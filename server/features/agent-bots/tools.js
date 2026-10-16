import { createError } from 'h3';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as supportService from '~/server/features/support/service.js';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { PROCESS_DESIGNER_PALETTE_GROUPS, DECLARATION_NODE_TYPES, PROCESS_NODE_CATALOG, PROCESS_NODE_FAMILIES, PROCESS_OPERATION_REGISTRY } from '~/packages/processes/src/index.js';

/**
 * The agent tool catalog: one curated vocabulary over the existing service
 * seams, shared by the MCP endpoint and the chat bot runtime. Every tool
 * delegates to a registered service with the caller's auth — the catalog
 * owns no business logic and never touches a repository.
 *
 * Authoring discipline the descriptions encode: validate before activate,
 * surface the activation gates (migration plan, type death) as structured
 * results the caller must confirm, never push through them.
 */

const LIST_LIMIT_DEFAULT = 25;
const LIST_LIMIT_MAX = 100;

function requireString(value, field) {
    const text = String(value ?? '').trim();
    if (!text) throw createError({ statusCode: 400, message: `${field} is required` });
    return text;
}

function boundLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return LIST_LIMIT_DEFAULT;
    return Math.min(parsed, LIST_LIMIT_MAX);
}

function instanceServiceFor(type) {
    const service = getAppRegistry().getInstanceService(requireString(type, 'type'));
    if (!service?.processList || !service?.processGetById) {
        throw createError({ statusCode: 400, message: `Unknown instance type: ${type}` });
    }
    return service;
}

function instanceRow(dto) {
    if (!dto) return null;
    return {
        id: dto._id ?? dto.id ?? null,
        type: dto.type ?? null,
        name: dto.name ?? dto.identity?.name ?? null,
        state: dto.states?.main ?? dto.state ?? null,
        fields: dto.fields ?? null
    };
}

// Activation-written records ride the stored document but never the
// authoring surface: `compiled` (inspection-only snapshot, nulled on every
// save), `history` (superseded graphs), `activated` (the activation
// snapshot). The definition tools strip them on load and preserve them on
// save so a tool loop moves only authored data — the full record runs to
// megabytes, which no model can echo back through a full-replace save.
const SERVER_OWNED_DATA_KEYS = ['compiled', 'history', 'activated'];

// The bot-facing authoring recipe served with the vocabulary: the compose
// loop over the headless seam, the edit path, and the validation teacher.
const AUTHORING_GUIDE = [
    '## Composing a process definition',
    '1. This payload: palette item ids, node kinds, declaration types, value sockets.',
    '2. compose_process_definition with ordered designer gestures:',
    "- {op:'declareClass', id, typeId, name} — declare a CTS class in-tree;",
    "- {op:'declareTypeRef', id, typeId} — reference a registry type;",
    "- {op:'declareField', id, ownerClassId, name, descriptor:{base}} — field on a class;",
    "- {op:'wireDeclaration', from, to, role} — declaration wire (from = child, to = parent; roles: declares, targets, children, binds);",
    "- {op:'drop', item, id} — drop a palette item as a process node;",
    "- {op:'configure', id, values} — inspector writes (typeId, construction, access...);",
    "- {op:'setInputDefault', id, input, value} — literal value on an input socket;",
    "- {op:'connect', id, fromPort, to, toPort} — wire sockets (ports are 'data:<socketId>').",
    'The first illegal gesture fails with the gate message — read it, fix, retry.',
    '3. validate_process_definition: its anchored diagnostics name exactly what to fix.',
    '4. activate_process_definition: activation gates (migration plan, type death) are confirmations to resolve, never bypass.',
    'Editing an existing definition instead: get_process_definition, then update_definition_graph (nodes, wires, values).'
].join('\n');

const authoringData = (data = {}) => Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => !SERVER_OWNED_DATA_KEYS.includes(key))
);

/** Authored payload over the stored document, server records preserved. */
async function saveAuthoring(definitionId, { name = '', data: patch = {} } = {}, auth) {
    const stored = await processDefinitionsService.getById(definitionId, auth);
    const data = { ...authoringData(stored?.data), ...authoringData(patch) };
    for (const key of ['history', 'activated']) {
        if (stored?.data?.[key] !== undefined) data[key] = stored.data[key];
    }
    return await processDefinitionsService.update(
        definitionId,
        { ...(name ? { name } : {}), data },
        auth
    );
}

export const TOOL_SPECS = [
    {
        name: 'list_process_definitions',
        description: 'Lists the organization\'s process definitions (id, name, status).',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async (args, auth) => {
            const rows = await processDefinitionsService.list(auth);
            return rows.map(row => ({
                id: row._id,
                name: row.identity?.name || '',
                status: row.states?.main || ''
            }));
        }
    },
    {
        name: 'get_process_definition',
        description: 'Loads one definition\'s authored document — the graph (nodes and wired edges), value inputs, declarations. Server-owned activation records (history, snapshots) stay off the wire.',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const json = await processDefinitionsService.getById(requireString(args.definitionId, 'definitionId'), auth);
            return { ...json, data: authoringData(json?.data) };
        }
    },
    {
        name: 'create_process_definition',
        description: 'Creates a process definition draft, optionally seeded with authored data — pass get_process_definition\'s data (without or with changes) to fork an existing process.',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' }, data: { type: 'object' } },
            required: ['name'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const payload = { name: requireString(args.name, 'name') };
            if (args.data && typeof args.data === 'object') payload.data = authoringData(args.data);
            return await processDefinitionsService.create(payload, auth);
        }
    },
    {
        name: 'update_process_definition',
        description: 'Saves authored data onto a definition (full authored replace, exactly like the designer\'s save). data must carry dataflowVersion: 4 — the sole operation protocol; saves without it are rejected. Use get_process_definition first, mutate the returned data, then save it back. Server-owned activation records are preserved automatically.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                name: { type: 'string' },
                data: { type: 'object' }
            },
            required: ['definitionId', 'data'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            if (!args.data || typeof args.data !== 'object') {
                throw createError({ statusCode: 400, message: 'data must be an object' });
            }
            return await saveAuthoring(
                requireString(args.definitionId, 'definitionId'),
                { ...(args.name ? { name: args.name } : {}), data: args.data },
                auth
            );
        }
    },
    {
        name: 'update_definition_graph',
        description: 'Replaces the definition\'s graph (nodes and wired edges) and optionally its value inputs — the small authoring surface for nodes, wires, and values, without echoing the whole document back. get_process_definition carries the current graph; edge source/target must reference node ids. The rest of the authored document is kept as stored.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                graph: { type: 'object' },
                valueInputs: { type: 'object' }
            },
            required: ['definitionId', 'graph'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            if (!args.graph || typeof args.graph !== 'object') {
                throw createError({ statusCode: 400, message: 'graph must be an object' });
            }
            return await saveAuthoring(requireString(args.definitionId, 'definitionId'), {
                data: {
                    graph: args.graph,
                    ...(args.valueInputs && typeof args.valueInputs === 'object' ? { valueInputs: args.valueInputs } : {})
                }
            }, auth);
        }
    },
    {
        name: 'get_authoring_vocabulary',
        description: 'The process authoring vocabulary and guide, straight off the designer\'s palette: the compose recipe (guide), palette groups (what to drop), the node catalog (every valid node kind with family and level — a processNode palette item composes a canvas node {type: \'processNode\', data: {refId}} whose semantic record in data.processNodes carries the kind), the value operations with typed input sockets and output, and the declaration node types (ctsClass/ctsType/ctsField/ctsState — they wire only to declaration partners). Edge handles are \'data:<socketId>\'. Compose new definitions through compose_process_definition; edit existing ones with get_process_definition + update_definition_graph; validate_process_definition\'s anchored diagnostics are the authoring teacher.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => {
            const valueOperations = {};
            for (const [kind, kindOperations] of Object.entries(PROCESS_OPERATION_REGISTRY)) {
                valueOperations[kind] = {};
                for (const [id, operation] of Object.entries(kindOperations)) {
                    valueOperations[kind][id] = {
                        inputs: (operation.inputs || []).map(socket => ({ id: socket.id, base: socket.base })),
                        output: operation.output ? { id: operation.output.id, base: operation.output.base } : null
                    };
                }
            }
            return {
                guide: AUTHORING_GUIDE,
                palette: PROCESS_DESIGNER_PALETTE_GROUPS,
                declarationNodeTypes: [...DECLARATION_NODE_TYPES],
                nodeCatalog: PROCESS_NODE_CATALOG,
                families: [...PROCESS_NODE_FAMILIES],
                valueOperations
            };
        }
    },
    {
        name: 'compose_process_definition',
        description: 'Composes a NEW process definition draft through the same headless authoring seam the visual designer drives — each step is a designer gesture carrying the same legality gates, so nothing illegal can be composed. Steps run in order; the first failing step stops the compose with its gate message. Then validate_process_definition (its anchored diagnostics name what to fix), and activate_process_definition. Editing an existing definition instead: get_process_definition then update_definition_graph.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            op: { type: 'string', enum: ['declareClass', 'declareTypeRef', 'declareField', 'wireDeclaration', 'drop', 'configure', 'setInputDefault', 'connect'] },
                            id: { type: 'string' },
                            typeId: { type: 'string' },
                            name: { type: 'string' },
                            class: { type: 'string' },
                            ownerClassId: { type: 'string' },
                            descriptor: { type: 'object' },
                            from: { type: 'string' },
                            to: { type: 'string' },
                            role: { type: 'string' },
                            item: { type: 'string' },
                            values: { type: 'object' },
                            input: { type: 'string' },
                            value: {},
                            fromPort: { type: 'string' },
                            toPort: { type: 'string' }
                        },
                        required: ['op'],
                        additionalProperties: false
                    }
                }
            },
            required: ['name', 'steps'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.composeDefinition(
                { name: requireString(args.name, 'name'), steps: Array.isArray(args.steps) ? args.steps : [] },
                auth
            );
        }
    },
    {
        name: 'validate_process_definition',
        description: 'Validates a draft: returns errors, anchored diagnostics, the semantic Apply diff against the active set, and the migration plan. Run this before every activate.',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.validate(requireString(args.definitionId, 'definitionId'), auth);
        }
    },
    {
        name: 'activate_process_definition',
        description: 'Activates a definition (additively, into the active set). Activation gates return as a structured { activationBlocked, ... } result: read the migration plan / type death rows, then re-call with confirmTypeDeath or the declared status migrations authored on the definition data.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                confirmTypeDeath: { type: 'boolean' }
            },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            try {
                return await processDefinitionsService.activate(
                    requireString(args.definitionId, 'definitionId'),
                    auth,
                    { confirmTypeDeath: Boolean(args.confirmTypeDeath) }
                );
            } catch (error) {
                if (error?.statusCode === 409) {
                    return {
                        activationBlocked: true,
                        message: error.message,
                        ...(error.data ? { gate: error.data } : {})
                    };
                }
                throw error;
            }
        }
    },
    {
        name: 'deactivate_process_definition',
        description: 'Removes one definition from the active set (back to DRAFT, editable and re-activatable).',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.deactivate(requireString(args.definitionId, 'definitionId'), auth);
        }
    },
    {
        name: 'list_types',
        description: 'Lists the CTS type vocabulary the organization\'s registry view declares (pack, plugin, and org-authored types).',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async (args, auth) => {
            const described = await describeOrganizationTypes(auth.organizationId);
            return (described.bundle?.types || []).map(type => ({
                id: type.id,
                name: type.name || type.id,
                class: type.class,
                scope: type.scope
            }));
        }
    },
    {
        name: 'list_instances',
        description: 'Lists readable instances of a type through the registry-resolved instance service (party types user and organization included).',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string' },
                limit: { type: 'number' }
            },
            required: ['type'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const rows = await instanceServiceFor(args.type).processList({}, auth);
            return (rows || []).slice(0, boundLimit(args.limit)).map(instanceRow);
        }
    },
    {
        name: 'get_instance',
        description: 'Loads one instance of a type through the registry-resolved instance service.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string' },
                id: { type: 'string' }
            },
            required: ['type', 'id'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return instanceRow(await instanceServiceFor(args.type)
                .processGetById(requireString(args.id, 'id'), auth));
        }
    },
    {
        name: 'attach_instances',
        description: 'Attaches instances as reference chips on the reply being composed (the chat composer\'s instance attach). Only readable instances survive validation; accepted refs ride the final answer in this conversation.',
        chatOnly: true,
        inputSchema: {
            type: 'object',
            properties: {
                instances: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { type: { type: 'string' }, id: { type: 'string' } },
                        required: ['type', 'id'],
                        additionalProperties: false
                    }
                }
            },
            required: ['instances'],
            additionalProperties: false
        },
        execute: async (args, auth, run) => {
            if (!run) throw createError({ statusCode: 400, message: 'attach_instances is available inside a chat run only' });
            const validated = await supportService.normalizeInstanceRefs(args.instances || [], auth);
            const seen = new Set(run.instanceRefs.map(ref => `${ref.type}:${ref.id}`));
            for (const ref of validated) {
                const key = `${ref.type}:${ref.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                run.instanceRefs.push(ref);
            }
            return validated.map(ref => ({ type: ref.type, id: ref.id, label: ref.label }));
        }
    },
    {
        name: 'list_actions',
        description: 'Lists the compiled process actions available to the calling principal (the action manifest): create, update, delete, link, unlink, and command actions with their target types.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async (args, auth) => {
            return (auth.roleAssignments?.actions || []).map(action => ({
                id: action.id,
                label: action.label || action.caption || action.id,
                actionKind: action.actionKind || null,
                typeId: action.typeId || null,
                parentTypeId: action.parentTypeId || null
            }));
        }
    },
    {
        name: 'run_action',
        description: 'Executes one compiled process action from the manifest (instance creation runs through the active process contract with its access gates).',
        inputSchema: {
            type: 'object',
            properties: {
                actionId: { type: 'string' },
                instanceId: { type: 'string' },
                data: { type: 'object' }
            },
            required: ['actionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.executeActiveProcessAction({
                actionId: requireString(args.actionId, 'actionId'),
                ...(args.instanceId ? { instanceId: String(args.instanceId) } : {}),
                data: args.data && typeof args.data === 'object' ? args.data : {}
            }, auth);
        }
    }
];

const SPECS_BY_NAME = new Map(TOOL_SPECS.map(spec => [spec.name, spec]));

/** MCP `tools/list` descriptors. */
export function mcpToolDescriptors() {
    return TOOL_SPECS
        .filter(spec => !spec.chatOnly)
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * Protocol-neutral chat descriptors for the LLM loop — the same shape MCP
 * serves. The [llm module](../llm/README.md) translates them onto each
 * provider's wire shape.
 */
export function chatToolDescriptors() {
    return TOOL_SPECS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function executeTool(name, args, auth) {
    const spec = SPECS_BY_NAME.get(String(name || ''));
    if (!spec) throw createError({ statusCode: 400, message: `Unknown tool: ${name}` });
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
    return await spec.execute(args && typeof args === 'object' ? args : {}, auth);
}
