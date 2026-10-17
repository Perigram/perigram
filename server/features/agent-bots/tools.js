import { createError } from 'h3';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as supportService from '~/server/features/support/service.js';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';
import { listRoles } from '~/server/features/organizations/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { buildPrincipalAuth } from './service.js';
import { PROCESS_DESIGNER_PALETTE_GROUPS, DECLARATION_NODE_TYPES, PROCESS_NODE_CATALOG, PROCESS_NODE_FAMILIES, PROCESS_OPERATION_REGISTRY, parseProcessSocketHandleId, resolveCatalogNodePorts } from '~/packages/processes/src/index.js';

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
    "1. This payload: palette item ids (bare — 'literal', 'construct', 'calculate', 'finish', ...), the org's roles, families, declaration types. Per-kind sockets: request {detail:'sockets'} — every kind's input/output socket ids with base types. Operation sockets: {detail:'valueOperations', kind}.",
    '2. compose_process_definition with ordered designer gestures:',
    "- {op:'declareClass', id, typeId, name} — declare a CTS class in-tree;",
    "- {op:'declareTypeRef', id, typeId} — reference a registry type (ids from list_types);",
    "- {op:'declareField', id, ownerClassId, name, descriptor:{base}} — field on a class; the name is a label in any script (the storage key derives from it automatically);",
    "- {op:'wireDeclaration', from, to, role} — declaration wire (from = child, to = parent; roles: declares, targets, children, binds);",
    "- {op:'drop', item, id} — drop a palette item as a process node (item = the bare palette id);",
    "- {op:'configure', id, values} — inspector writes (typeId, construction, access...);",
    "- lanes are role grants: an effect's lane IS its access — configure {access:{grants:[{roleId,level}]}}, levels read/write/admin, roleIds from the roles list in this payload; grantless effects land in the implicit lane;",
    "- {op:'setInputDefault', id, input, value} — literal value on an input socket (input = bare socket id);",
    "- {op:'connect', id, fromPort, to, toPort} — id is the FROM node; ports are bare socket ids or 'data:<socketId>' handles; both work.",
    'The first illegal gesture fails with the gate message — read it, fix, retry.',
    '3. validate_process_definition: its anchored diagnostics name exactly what to fix.',
    '4. activate_process_definition: activation gates (migration plan, type death) are confirmations to resolve, never bypass.',
    'Editing an existing definition: get_process_definition (compact digest: node ids, kinds, edges as node:socket) then edit_process_definition with the same gestures (drop, configure, setInputDefault, connect, declarations) — small payloads, no graph echo-back. Full document view only via get_process_definition {full: true}.'
].join('\n');

const authoringData = (data = {}) => Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => !SERVER_OWNED_DATA_KEYS.includes(key))
);

// No tool result may blind the model: one oversized payload evicts the
// system prompt and tool schemas from a small context window, and the
// loop degrades into confabulation. Anything above the limit is returned
// truncated with a notice pointing at the narrower reads.
const TOOL_RESULT_LIMIT = 16 * 1024;

function boundedToolResult(result) {
    const json = JSON.stringify(result ?? null);
    if (json.length <= TOOL_RESULT_LIMIT) return result ?? null;
    return {
        notice: `Tool result truncated: ${json.length} bytes exceeds the ${TOOL_RESULT_LIMIT}-byte conversation limit. Request a narrower view (definition digest, vocabulary detail filters) instead of repeating this call.`,
        truncated: true,
        bytes: json.length,
        preview: json.slice(0, 4096)
    };
}

// The action manifest is live, not a run-start snapshot: a run may
// activate new process vocabulary mid-flight, and the delegated principal
// must see its own current manifest — the same freshness a human gets
// per request. Only the manifest surface pays the re-resolution.
async function livePrincipalAuth(auth) {
    if (!auth?.userId) return auth;
    try {
        return await buildPrincipalAuth(auth.userId);
    } catch {
        return auth;
    }
}

// The compact definition view: node ids/kinds/typeIds, edges with socket
// ids, value-input keys — the addresses gestures and validation
// diagnostics use, without the full authored document.
function definitionDigest(row) {
    const data = row?.data || {};
    const records = data.processNodes || {};
    const nodes = (data.graph?.nodes || []).map(node => {
        if (node?.type === 'processNode') {
            const record = records[node.data?.refId] || {};
            return { id: node.id, kind: record.kind ?? null, typeId: record.typeId ?? null };
        }
        const declaration = (data.ctsTypes || {})[node?.data?.refId] || {};
        return { id: node.id, declaration: node?.type ?? null, typeId: declaration.typeId ?? null, name: declaration.name ?? null };
    });
    const socket = (nodeId, handle) => handle ? `${nodeId}:${parseProcessSocketHandleId(handle)}` : nodeId;
    const edges = (data.graph?.edges || []).map(edge => ({
        from: socket(edge.source, edge.sourceHandle),
        to: socket(edge.target, edge.targetHandle),
        ...(edge.role === 'type' && edge.label ? { declaration: edge.label } : {})
    }));
    return {
        id: row?.identity?.uid ?? row?._id ?? null,
        name: row?.identity?.name ?? null,
        status: row?.status?.state?.primary ?? null,
        nodes,
        edges,
        valueInputs: Object.keys(data.valueInputs || {}),
        counts: { declarations: Object.keys(data.ctsTypes || {}).length, processNodes: Object.keys(records).length }
    };
}

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
        description: 'Loads one definition as a COMPACT DIGEST by default — node ids/kinds/typeIds, edges with socket ids, value-input keys — the addresses edit gestures and diagnostics use. full: true returns the whole authored document instead (large; only needed for whole-document replaces through update_process_definition).',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' }, full: { type: 'boolean' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const json = await processDefinitionsService.getById(requireString(args.definitionId, 'definitionId'), auth);
            if (args.full === true) return { ...json, data: authoringData(json?.data) };
            return definitionDigest(json);
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
        description: 'Saves authored data onto a definition (full authored replace, exactly like the designer\'s save). data must carry dataflowVersion: 4 — the sole operation protocol; saves without it are rejected. Load the full document first (get_process_definition {full: true}), mutate the returned data, then save it back; for targeted changes prefer edit_process_definition gestures. Server-owned activation records are preserved automatically.',
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
        description: 'Replaces the definition\'s graph (nodes and wired edges) and optionally its value inputs — the whole-graph authoring surface, without echoing the rest of the document. Prefer edit_process_definition gestures for targeted changes; this tool needs the full graph object ({full: true} view). The rest of the authored document is kept as stored.',
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
        description: 'The process authoring vocabulary, COMPACT by default: the compose/edit recipe (guide), the organization\'s roles (grant vocabulary for effect access — the designer\'s lanes), node families, declaration node types (ctsClass/ctsType/ctsField/ctsState — they wire only to declaration partners), and the palette\'s droppable items (id + kind per group). Deep details on request via detail: \'sockets\' (every kind\'s input/output socket ids and base types — what connect addresses), detail: \'nodeCatalog\' (every valid node kind with family and level), or detail: \'valueOperations\' (typed input sockets and output per operation), narrowed by family/kind. A processNode palette item composes a canvas node {type: \'processNode\', data: {refId}} whose semantic record in data.processNodes carries the kind. Compose new definitions through compose_process_definition; edit existing ones with get_process_definition + edit_process_definition; validate_process_definition\'s anchored diagnostics are the authoring teacher.',
        inputSchema: {
            type: 'object',
            properties: {
                detail: { type: 'string', enum: ['nodeCatalog', 'valueOperations', 'sockets'] },
                family: { type: 'string' },
                kind: { type: 'string' }
            },
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const compact = () => ({
                guide: AUTHORING_GUIDE,
                families: [...PROCESS_NODE_FAMILIES],
                declarationNodeTypes: [...DECLARATION_NODE_TYPES],
                palette: PROCESS_DESIGNER_PALETTE_GROUPS.map(group => ({
                    id: group.id,
                    items: (group.items || []).map(item => ({ id: item.id, kind: item.kind || item.type || null }))
                }))
            });
            const roles = async () => Object.values((await listRoles(auth.organizationId, auth)) || {})
                .map(role => ({ id: role.id, label: role.label || role.id }));
            if (args.detail === 'nodeCatalog') {
                const entries = Object.values(PROCESS_NODE_CATALOG)
                    .filter(entry => !args.family || entry.family === args.family)
                    .filter(entry => !args.kind || entry.kind === args.kind);
                return { ...(await compact()), roles: await roles(), nodeCatalog: entries };
            }
            if (args.detail === 'sockets') {
                // The per-kind socket inventory off the catalog's own port
                // resolution — the same ports the canvas renders. Kinds
                // whose ports resolve only against a configured record are
                // absent; the digest shows live sockets for dropped nodes.
                const sockets = {};
                for (const entry of Object.values(PROCESS_NODE_CATALOG)) {
                    if (args.family && entry.family !== args.family) continue;
                    if (args.kind && entry.kind !== args.kind) continue;
                    let ports;
                    try {
                        ports = resolveCatalogNodePorts({ kind: entry.kind });
                    } catch {
                        continue;
                    }
                    const row = list => (list || []).map(socket => ({
                        id: socket.id,
                        base: socket.type?.base ?? null,
                        ...(socket.role && socket.role !== 'data' ? { role: socket.role } : {}),
                        ...(socket.access && socket.access !== 'item' ? { access: socket.access } : {}),
                        ...(socket.multiple === true ? { multiple: true } : {})
                    }));
                    const inputs = row(ports.inputs);
                    const outputs = row(ports.outputs);
                    if (inputs.length || outputs.length) {
                        sockets[entry.kind] = { ...(inputs.length ? { inputs } : {}), ...(outputs.length ? { outputs } : {}) };
                    }
                }
                return { ...(await compact()), roles: await roles(), sockets };
            }
            if (args.detail === 'valueOperations') {
                const valueOperations = {};
                for (const [kind, kindOperations] of Object.entries(PROCESS_OPERATION_REGISTRY)) {
                    if (args.kind && kind !== args.kind) continue;
                    valueOperations[kind] = {};
                    for (const [id, operation] of Object.entries(kindOperations)) {
                        valueOperations[kind][id] = {
                            inputs: (operation.inputs || []).map(socket => ({ id: socket.id, base: socket.base })),
                            output: operation.output ? { id: operation.output.id, base: operation.output.base } : null
                        };
                    }
                }
                return { ...(await compact()), roles: await roles(), valueOperations };
            }
            return { ...(await compact()), roles: await roles() };
        }
    },
    {
        name: 'compose_process_definition',
        description: 'Composes a NEW process definition draft through the same headless authoring seam the visual designer drives — each step is a designer gesture carrying the same legality gates, so nothing illegal can be composed. Steps run in order; the first failing step stops the compose with its gate message. Then validate_process_definition (its anchored diagnostics name what to fix), and activate_process_definition. Editing an existing definition instead: get_process_definition (digest) then edit_process_definition.',
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
        name: 'edit_process_definition',
        description: 'Applies the same ordered designer gestures to an EXISTING definition — drop nodes, configure records, wire sockets, set input defaults, declare — with the same legality gates as the designer and no whole-graph echo-back. Get the compact digest first (get_process_definition) for current node ids and wired sockets, then edit, then validate_process_definition. Each step is small; the first failing step stops with its gate message.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
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
            required: ['definitionId', 'steps'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.editDefinition(
                { definitionId: requireString(args.definitionId, 'definitionId'), steps: Array.isArray(args.steps) ? args.steps : [] },
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
        description: 'Lists the compiled process actions available to the calling principal (the action manifest): create, update, delete, link, unlink, and command actions with their target types. Live per call — actions activated mid-run are visible immediately.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute: async (args, auth) => {
            const live = await livePrincipalAuth(auth);
            return (live.roleAssignments?.actions || []).map(action => ({
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
        description: 'Executes one compiled process action from the manifest (instance creation runs through the active process contract with its access gates). Availability is checked against the principal\'s live manifest.',
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
            const live = await livePrincipalAuth(auth);
            return await processDefinitionsService.executeActiveProcessAction({
                actionId: requireString(args.actionId, 'actionId'),
                ...(args.instanceId ? { instanceId: String(args.instanceId) } : {}),
                data: args.data && typeof args.data === 'object' ? args.data : {}
            }, live);
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

export async function executeTool(name, args, auth, run = null) {
    const spec = SPECS_BY_NAME.get(String(name || ''));
    if (!spec) throw createError({ statusCode: 400, message: `Unknown tool: ${name}` });
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
    return boundedToolResult(await spec.execute(args && typeof args === 'object' ? args : {}, auth, run));
}
