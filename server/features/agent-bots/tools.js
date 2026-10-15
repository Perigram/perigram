import { createError } from 'h3';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as supportService from '~/server/features/support/service.js';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

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
        description: 'Loads one process definition with its full authored semantic records (graph nodes, edges, declarations).',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.getById(requireString(args.definitionId, 'definitionId'), auth);
        }
    },
    {
        name: 'create_process_definition',
        description: 'Creates an empty process definition draft (authored data holds only the dataflowVersion marker).',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.create({ name: requireString(args.name, 'name') }, auth);
        }
    },
    {
        name: 'update_process_definition',
        description: 'Saves authored semantic records onto a definition (full data replace, exactly like the designer\'s save). data must carry dataflowVersion: 4 — the sole operation protocol; saves without it are rejected. Use get_process_definition first, mutate the returned data, then save it back.',
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
            return await processDefinitionsService.update(
                requireString(args.definitionId, 'definitionId'),
                { ...(args.name ? { name: args.name } : {}), data: args.data },
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
