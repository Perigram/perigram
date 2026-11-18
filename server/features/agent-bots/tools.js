import { createError } from 'h3';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';
import * as supportService from '~/server/features/support/service.js';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';
import { listRoles } from '~/server/features/organizations/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as webSearchService from '~/server/features/web-search/service.js';
import * as filesService from '~/server/features/files/service.js';
import { readAttachmentContent } from './attachment-read.js';
import { buildPrincipalAuth } from './service.js';
import { PROCESS_DESIGNER_PALETTE_GROUPS, DECLARATION_NODE_TYPES, PROCESS_NODE_CATALOG, PROCESS_NODE_FAMILIES, PROCESS_OPERATION_REGISTRY, authoredProcessDataFromGraphDocument, parseProcessSocketHandleId, resolveCatalogNodePorts } from '#packages/processes';
import { FIELD_BASES } from '#packages/cts';
import { iconFontGlyphs } from '#shared/icon-fonts.js';

/**
 * The agent tool catalog: one curated vocabulary over the existing service
 * seams, shared by the MCP endpoint and the chat bot runtime. Every tool
 * delegates to a registered service with the caller's auth — the catalog
 * owns no business logic and never touches a repository.
 *
 * Authoring discipline the descriptions encode: validate before activate,
 * surface activation gates (the migration plan) as structured results the
 * caller must confirm, never push through them.
 */

const LIST_LIMIT_DEFAULT = 25;
const LIST_LIMIT_MAX = 100;
// The instance list seam's own page ceiling — a query run searches the
// full page, not the sliced result budget.
const LIST_POOL_MAX = 200;

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

function instanceRow(dto, { payload = false } = {}) {
    if (!dto) return null;
    return {
        id: dto._id ?? dto.id ?? null,
        type: dto.type ?? null,
        name: dto.name ?? dto.identity?.name ?? null,
        state: dto.states?.main ?? dto.state ?? null,
        fields: dto.fields ?? null,
        ...(payload && dto.payload ? { payload: dto.payload } : {})
    };
}

// The manifest row: identity plus the input contract run_action's data
// composes from — the projected channels, nothing derived.
function actionRow(action = {}) {
    return {
        id: action.id,
        label: action.label || action.caption || action.id,
        actionKind: action.actionKind || null,
        typeId: action.typeId || null,
        parentTypeId: action.parentTypeId || null,
        ...(action.construction ? { construction: action.construction } : {}),
        ...(Array.isArray(action.inputs) ? { inputs: action.inputs } : {}),
        ...(action.inputPolicy ? { inputPolicy: action.inputPolicy } : {})
    };
}

// Activation-written records stay out of the authoring surface:
// `compiled` (inspection-only snapshot, nulled on every save), `history`
// (superseded graphs), `activated` (the activation snapshot). The
// definition tools strip them on load and preserve them on save — a tool
// loop moves only authored data (the full record runs to megabytes).
const SERVER_OWNED_DATA_KEYS = ['compiled', 'history', 'activated'];

// The bot-facing authoring skill served with the vocabulary: the domain
// model first, then the gesture grammar, then the loop. The model reads
// this as its only process-designer education.
const AUTHORING_GUIDE = [
    '## What a process definition is',
    "The organization's authored contract in two layers: a DECLARATION TREE — the entity vocabulary — and an OPERATION GRAPH — behavior. Activating compiles both into the runtime contract: actions, screens, role grants, workflows.",
    '## The declaration tree — the entity vocabulary',
    "- A CLASS declares an entity type. Five identity laws (CTS SPEC §5): item — a tracked individual; group — identity IS its membership, declares children; file — payload content, replaceable; process — a run with provenance inputs and typed outputs; party — framework principals (user, organization), read-only: parties bind as instance sources and relation targets and are never constructed or mutated. Glyphs ride declareClass/configure; {detail:'glyphs'} lists them.",
    "- Containment: {op:'wireDeclaration', from: child, to: parent, role:'children'} — an item, group, or process class parents; file and party never parent. The child's construct node gains a lineage input named for the parent type (lineage.<parentTypeId>Id — read the exact id from the digest after the wire lands); connect the parent construct's result into it. onRemove: restrict (default) | cascade | detach.",
    '- Re-parenting is three gestures: unwireDeclaration the old children wire, wireDeclaration the new one, then disconnect/connect the lineage sockets to the new parent construct.',
    "- A FIELD declares a typed slot on a class: the name is a label in any script (the storage key derives), descriptor.base picks from fieldBases; nullable:true marks it optional (required by default); identifier:true names the record. Edits ride configure (name, descriptor).",
    "- A STATE is a flat lifecycle value. Its wiring: {op:'wireDeclaration', from: stateId, to: constructOrTransitionId, role:'entry'} — a construct's initial state, a transition's target, the wire IS the value; {op:'wireDeclaration', from: parentStateId, to: childStateId, role:'nested'} — the child nests under the parent. These two wires are the whole state grammar.",
    "- A TYPE REFERENCE ({op:'declareTypeRef', typeId}) binds an existing registry type (ids from list_types) into the tree; it wires as child, target, or binding exactly like a class.",
    '## The operation graph — behavior',
    "- EFFECTS (construct, mutate, transition, remove, emit, registered services) are the one population carrying access: ONE grant per effect — its lane. A wired event input runs the effect automatically; an unwired effect is an entry — manual, or started by its authored time or event (next bullet).",
    '- Everything else is dataflow: sources (literal, context, all<T>), values, collections, reads, control. Ports derive from declarations: a construct bound to a class exposes fields.<name> per declared field; a consumer takes its type from its entity input.',
    "- Time and events: configure {trigger:{mode:'schedule',schedule:{at:'<ISO>'}}} or {interval:'PT5M'} starts an unwired entry at its time; {eventId:'<type>'} starts it on that emitted event (a wired event input wins). emitEvent persists one event (inputs: type — required, payload) and dispatches it to subscriber entries; waitUntil parks until its dateTime input; eventPayload reads the delivered event (path event.payload).",
    "- Sockets: {detail:'sockets'} serves the catalog-static kinds (families: sources, values, collections, records, reads, effects, control). Record-bound kinds (construct, mutate, transition) resolve their live sockets from the bound record — read them off the digest row of the dropped node.",
    '## The gestures',
    'Palette item ids are bare: literal, construct, calculate, finish, ... (this payload lists them all). Declaration roles: declares, targets, children, binds.',
    "- {op:'declareClass', id, typeId, name} — declare a CTS class in-tree;",
    "- {op:'declareTypeRef', id, typeId} — reference a registry type (ids from list_types);",
    "- {op:'declareField', id, ownerClassId, name, descriptor:{base}} — field on a class;",
    "- {op:'declareState', id, value} — a flat lifecycle value (display policy rides configure: severity, icon); entry wires author a construct's initial or a transition's target (see STATE above);",
    "- {op:'wireDeclaration', from, to, role} — declaration wire (from = child, to = parent);",
    "- {op:'unwireDeclaration', from, to, role} — removes that declaration wire;",
    "- {op:'drop', item, id} — drop a palette item as a process node;",
    "- A construct binds its type by wire: declare the type ({op:'declareTypeRef', id, typeId} for registry types, declareClass in-tree), then {op:'wireDeclaration', from: typeNodeId, to: constructId, role:'binds'} — the derived typeId lands on the record; configure typeId on a construct refuses;",
    "- {op:'configure', id, values} — inspector writes (typeId, construction, access...); lanes are role grants: an effect's lane IS its access — exactly ONE grant per effect; configure {access:{grants:[{roleId,level}]}}, levels read/write/admin, roleIds from the roles list in this payload; grants: [] lands the effect in the grantless implicit lane; construction.mode: the bound type's modes ({detail:'construction'});",
    "- {op:'setInputDefault', id, input, value} — typed scalar on an input socket the node declares (input = bare socket id; entityRef as {type, id}); records arrive from reads, services, and record composition, never as authored values. Socket defaults ride this gesture — configure refuses inputDefaults;",
    '- a declared field\'s port exists in the SAME session once wireDeclaration lands (fields.* on construct/mutate nodes) — never hand-edit construction.inputs, it derives from the class\'s declared fields;',
    "- {op:'connect', id, fromPort, to, toPort} — id is the FROM node; ports are socket HANDLES: data:<socketId> for data sockets, control:<socketId> for control. Bare socket ids and the retired input:/output: spellings refuse;",
    "- {op:'disconnect', id, fromPort, to, toPort} — removes the data wire those handles name;",
    "- {op:'removeNode', id} — removes a node: its record, its wires, and the producer outputs it anchored; a declaration node (class, typeRef, field, state) goes the same way — its declaration record and every wire touching it;",
    '## Composition algebra (runtime laws)',
    'A definition is the extension mechanism: compose a need from these primitives before treating it as a capability gap. Canonical law: packages/processes/README.md.',
    '1. A wired data socket takes its producer\'s packet at run time; an unwired prompted input is asked of the runner at run time.',
    '2. A construct bound to an authored type carries the type\'s declared fields as inputs (fields.*): unwired, each declared field is a creation prompt; wired, each reads its producer.',
    '3. cts.field reads one field off an instance packet; value operations (string, math, compare, ...) transform packets; constructRecord composes wired values into one record.',
    '4. A control wire (control:completed → control:in) orders effects within ONE action run — the first construct\'s result socket feeds the chained effect as a packet.',
    '5. Ref inputs resolve with their payloads: a file-instance ref carries its bytes to the consuming service.',
    '6. Instances and lists: allEntities lists a type (configure typeId); childEntities/relatedEntities/parentEntity navigate edges; filterList (compare/logic condition) and sortItems shape lists.',
    'When the installed operators do not obviously cover a need, compose it from these primitives in a scratch definition and run it before concluding the platform lacks the capability. When composition truly cannot express it, say exactly that and stop — a capability request belongs to the owner.',
    '## Worked example',
    'Declare text-document, compose a record, format a template, wire content into a construct, then validate, apply_declarations, and activate.',
    '## The proposition gate',
    'Before composing, show a small Mermaid proposition with entity types, lifecycle states, effects, and manual/scheduled/event entries; use ask_user for one concise validation question. Revise the diagram when the room changes the shape.',
    '## The loop',
    'The first illegal gesture fails with the gate message — read it, fix, retry. When intent maps to several authoring shapes (which class law, where it parents, which children move), ask_user: shape belongs to the room.',
    '1. compose_process_definition (or get_process_definition digest + edit_process_definition — same gestures, small payloads, no graph echo-back). Digest rows carry each node\'s socket handles — connect against them.',
    '2. validate_process_definition: its anchored diagnostics name exactly what to fix.',
    '3. In-tree declarations MUST be posted into the registry with apply_declarations before activation — validation overlays the draft, the activation compile resolves the registry.',
    '4. activate_process_definition: activation gates (the migration plan) are confirmations to resolve, never bypass — status migration targets are declared with declare_status_mappings (one mapping per plan row).',
    'Full document view only via get_process_definition {full: true}.'
].join('\n');

const authoringData = (data = {}) => {
    const authored = data?.format === 'perigram.graph'
        ? (authoredProcessDataFromGraphDocument(data) || {})
        : data;
    return Object.fromEntries(
        Object.entries(authored || {}).filter(([key]) => !SERVER_OWNED_DATA_KEYS.includes(key))
    );
};

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
    const data = authoringData(row?.data || {});
    const records = data.processNodes || {};
    const nodes = (data.graph?.nodes || []).map(node => {
        if (node?.type === 'processNode') {
            const record = records[node.data?.refId] || {};
            return {
                id: node.id,
                kind: record.kind ?? null,
                typeId: record.typeId ?? null,
                sockets: [
                    ...(record.inputs || []).map(port => `${port.role === 'data' ? 'data' : 'control'}:${port.id}`),
                    ...(record.outputs || []).map(port => `${port.role === 'data' ? 'data' : 'control'}:${port.id}`)
                ],
                // Authored entry facts (schedule, event subscription) are
                // invisible in edges — the digest is the compact view an
                // editing agent composes against.
                ...(record.trigger?.schedule || record.eventId
                  ? {
                      entry: {
                        ...(record.trigger?.schedule ? { schedule: record.trigger.schedule } : {}),
                        ...(record.eventId ? { eventId: record.eventId } : {})
                      }
                    }
                  : {})
            };
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
        // The wire shape is the entity DTO (`states.main`).
        status: row?.states?.main ?? row?.status?.state?.primary ?? row?.status?.state ?? null,
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
        description: 'Loads one definition as a COMPACT DIGEST by default — node ids/kinds/typeIds with their socket handles, edges with socket ids, value-input keys — the addresses edit gestures and diagnostics use. full: true returns the whole authored document instead (large; only needed for whole-document replaces through update_process_definition).',
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
            // The digest, never the saved document (see compose).
            return definitionDigest(await saveAuthoring(requireString(args.definitionId, 'definitionId'), {
                data: {
                    graph: args.graph,
                    ...(args.valueInputs && typeof args.valueInputs === 'object' ? { valueInputs: args.valueInputs } : {})
                }
            }, auth));
        }
    },
    {
        name: 'get_authoring_vocabulary',
        description: 'The process authoring vocabulary, COMPACT by default: the authoring skill (guide: what a process definition is — the declaration tree\'s class/field/state laws and containment, the operation graph\'s effects and lanes — the gesture grammar, and the compose→validate→apply→activate loop), the organization\'s roles (grant vocabulary for effect access — the designer\'s lanes, one grant per effect), node families, declaration node types (ctsClass/ctsType/ctsField/ctsState — they wire only to declaration partners), the palette\'s droppable items (id + kind per group). Deep details on request via detail: \'sockets\' (the catalog-static kinds\' socket ids and base types — record-bound kinds resolve live sockets off the digest of the dropped node), detail: \'nodeCatalog\' (every valid node kind with family and level), detail: \'valueOperations\' (typed input sockets and output per operation), narrowed by family/kind, or detail: \'construction\' (per-type construction modes with each type\'s default — the list the compiler enforces). A processNode palette item composes a canvas node {type: \'processNode\', data: {refId}} whose semantic record in data.processNodes carries the kind. Compose new definitions through compose_process_definition; edit existing ones with get_process_definition + edit_process_definition; validate_process_definition\'s anchored diagnostics are the authoring teacher.',
        inputSchema: {
            type: 'object',
            properties: {
                detail: { type: 'string', enum: ['nodeCatalog', 'valueOperations', 'sockets', 'construction', 'glyphs'] },
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
                fieldBases: [...FIELD_BASES],
                palette: PROCESS_DESIGNER_PALETTE_GROUPS.map(group => ({
                    id: group.id,
                    items: (group.items || []).map(item => ({ id: item.id, kind: item.kind || item.type || null }))
                }))
            });
            // Detail views carry the detail and roles; the guide rides the
            // compact view alone — re-serving it on every detail pushed
            // the socket inventory past the conversation limit.
            const base = () => ({
                families: [...PROCESS_NODE_FAMILIES],
                declarationNodeTypes: [...DECLARATION_NODE_TYPES]
            });
            const roles = async () => Object.values((await listRoles(auth.organizationId, auth)) || {})
                .map(role => ({ id: role.id, label: role.label || role.id }));
            // A filter naming nothing is a teacher error, never a silent
            // empty inventory (families are the catalog's own vocabulary).
            if (['nodeCatalog', 'sockets'].includes(args.detail)
                && !Object.values(PROCESS_NODE_CATALOG).some(entry => (
                    (!args.family || entry.family === args.family)
                    && (!args.kind || entry.kind === args.kind)
                ))) {
                throw createError({
                    statusCode: 400,
                    message: `No catalog entry matches family '${args.family || '*'}' kind '${args.kind || '*'}' — families: ${PROCESS_NODE_FAMILIES.join(', ')}; kinds are the palette items' kind values`
                });
            }
            if (args.detail === 'nodeCatalog') {
                const entries = Object.values(PROCESS_NODE_CATALOG)
                    .filter(entry => !args.family || entry.family === args.family)
                    .filter(entry => !args.kind || entry.kind === args.kind);
                return { ...(await base()), roles: await roles(), nodeCatalog: entries };
            }
            if (args.detail === 'glyphs') {
                // The class glyph palette (the icon fonts' authoring
                // listing) — consumed like any PrimeIcon class string.
                return { ...(await base()), roles: await roles(), glyphs: [...iconFontGlyphs] };
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
                return { ...(await base()), roles: await roles(), sockets };
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
                return { ...(await base()), roles: await roles(), valueOperations };
            }
            if (args.detail === 'construction') {
              // The mode list compile accepts; construction.mode picks its value from these rows.
              const construction = await processDefinitionsService.listConstructionModes(auth.organizationId);
              return { ...(await base()), roles: await roles(), construction };
            }

            return { ...(await compact()), roles: await roles() };
        }
    },
    {
        name: 'compose_process_definition',
        description: 'Composes a NEW process definition draft through the same headless authoring seam the visual designer drives — each step is a designer gesture carrying the same legality gates, so nothing illegal can be composed. Compose the room-approved shape: answer first with the definition\'s simplified Mermaid flowchart (entity types, lifecycle states, effects, entries) and validate it with ask_user in chat runs; MCP surfaces answer with the diagram and compose on the next message. Steps run in order; the first failing step stops the compose with its gate message. Then validate_process_definition (its anchored diagnostics name what to fix), and activate_process_definition. Editing an existing definition instead: get_process_definition (digest) then edit_process_definition.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            op: { type: 'string', enum: ['declareClass', 'declareTypeRef', 'declareField', 'declareState', 'wireDeclaration', 'unwireDeclaration', 'drop', 'configure', 'setInputDefault', 'connect', 'disconnect', 'removeNode'] },
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
            // The digest: a whole-document echo (megabytes on real
            // definitions) blinds small contexts.
            return definitionDigest(await processDefinitionsService.composeDefinition(
                { name: requireString(args.name, 'name'), steps: Array.isArray(args.steps) ? args.steps : [] },
                auth
            ));
        }
    },
    {
        name: 'edit_process_definition',
        description: 'Applies the same ordered designer gestures to an EXISTING definition — drop and remove nodes, configure records, wire and unwire sockets, set input defaults, declare and undeclare — with the same legality gates as the designer and no whole-graph echo-back. Get the compact digest first (get_process_definition) for current node ids and wired sockets, then edit, then validate_process_definition. Each step is small; the first failing step stops with its gate message.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            op: { type: 'string', enum: ['declareClass', 'declareTypeRef', 'declareField', 'declareState', 'wireDeclaration', 'unwireDeclaration', 'drop', 'configure', 'setInputDefault', 'connect', 'disconnect', 'removeNode'] },
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
            // The digest, never the saved document (see compose).
            return definitionDigest(await processDefinitionsService.editDefinition(
                { definitionId: requireString(args.definitionId, 'definitionId'), steps: Array.isArray(args.steps) ? args.steps : [] },
                auth
            ));
        }
    },
    {
        name: 'apply_declarations',
        description: 'Posts the definition\'s in-tree declarations (classes, fields, states, and their wires) into the organization\'s type registry — the designer Apply\'s declaration step. REQUIRED before activate_process_definition whenever the draft declares types in-tree (declareClass/declareField/declareTypeRef gestures): validation accepts the draft\'s own declarations, but the activation compile resolves types against the registry. A refused declaration (breaking type diff without migrate steps) returns as a structured failure naming the type — resolve it or ask the room; successful posts are idempotent.',
        inputSchema: {
            type: 'object',
            properties: { definitionId: { type: 'string' } },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.applyTreeDeclarations(
                requireString(args.definitionId, 'definitionId'),
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
        description: 'Activates a definition (additively, into the active set). Activation gates return as a structured { activationBlocked, ... } result: read the migration plan, then resolve it through declare_status_mappings (one mapping per plan row, targets from the plan).',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' }
            },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            try {
                // The digest, never the activated document (see compose) —
                // the entity echo crossed the conversation limit.
                return definitionDigest(await processDefinitionsService.activate(
                    requireString(args.definitionId, 'definitionId'),
                    auth
                ));
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
        name: 'declare_status_mappings',
        description: 'Declares the Apply status-migration decision on a definition — the mapping list the activation gate reads when removed workflow states still hold live instances. Take one { typeId, from, to } per migration-plan row, targets from the plan\'s retained targets; ask the room with ask_user when the choice belongs to it. The list replaces the stored declaration (an empty list clears it back to the gate); coverage is validated at activation with the plan attached.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                mappings: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            typeId: { type: 'string' },
                            from: { type: 'string' },
                            to: { type: 'string' }
                        },
                        required: ['typeId', 'from', 'to'],
                        additionalProperties: false
                    }
                }
            },
            required: ['definitionId', 'mappings'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.declareStatusMappings({
                definitionId: requireString(args.definitionId, 'definitionId'),
                mappings: args.mappings
            }, auth);
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
            return definitionDigest(await processDefinitionsService.deactivate(requireString(args.definitionId, 'definitionId'), auth));
        }
    },
    {
        name: 'delete_process_definition',
        description: 'Deletes a definition permanently (admin access). Prefer deactivate_process_definition for removing a definition from the active set.',
        inputSchema: {
            type: 'object',
            properties: {
                definitionId: { type: 'string' }
            },
            required: ['definitionId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            return await processDefinitionsService.remove(
                requireString(args.definitionId, 'definitionId'),
                auth
            );
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
        description: 'Lists readable instances of a type through the registry-resolved instance service (party types user and organization included). filters carries the list seam\'s flat filter map — primaryState, primaryStates (comma-separated), states.<key>, a declared lineage.<key>, _id; query is a case-insensitive substring over the row\'s name, id, and state.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string' },
                query: { type: 'string' },
                filters: { type: 'object' },
                limit: { type: 'number' }
            },
            required: ['type'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const filters = args.filters && typeof args.filters === 'object' && !Array.isArray(args.filters)
                ? args.filters
                : {};
            const query = String(args.query || '').trim().toLowerCase();
            const rows = await instanceServiceFor(args.type)
                .processList({ ...filters, limit: query ? LIST_POOL_MAX : boundLimit(args.limit) }, auth);
            return (rows || [])
                .filter(row => !query || [row?.name, row?.identity?.name, row?._id ?? row?.id, row?.states?.main ?? row?.state]
                    .some(value => String(value ?? '').toLowerCase().includes(query)))
                .map(instanceRow)
                .slice(0, boundLimit(args.limit));
        }
    },
    {
        name: 'get_instance',
        description: 'Loads one instance of a type through the registry-resolved instance service. File-type rows carry their payload reference (fileId, mime, size, name).',
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
                .processGetById(requireString(args.id, 'id'), auth), { payload: true });
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
        description: 'Lists the compiled process actions available to the calling principal (the action manifest): create, update, delete, link, unlink, and command actions with their target types and input contracts — construction mode and inputs, prompt fields (inputPolicy), run parameters — the vocabulary run_action\'s data composes from. Pass actionId for one action\'s full row. Live per call — actions activated mid-run are visible immediately.',
        inputSchema: {
            type: 'object',
            properties: { actionId: { type: 'string' } },
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const live = await livePrincipalAuth(auth);
            const actions = live.roleAssignments?.actions || [];
            if (args.actionId) {
                const action = actions.find(entry => entry.id === String(args.actionId));
                if (!action) throw createError({ statusCode: 404, message: `Action ${args.actionId} is not in your action manifest` });
                return actionRow(action);
            }
            return actions.map(actionRow);
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
    },
    {
        name: 'web_search',
        description: 'Searches the public web through the organization\'s configured search provider. Returns ranked results with title, url, and snippet. Use it for facts, current events, documentation, or anything outside the organization\'s own data.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query.' },
                maxResults: { type: 'integer', description: 'Maximum results to return (default 5, at most 10).' }
            },
            required: ['query'],
            additionalProperties: false
        },
        execute: async (args, auth, run) => {
            return await webSearchService.webSearch({
                organizationId: auth.organizationId,
                query: requireString(args.query, 'query'),
                maxResults: args.maxResults,
                ...(run?.signal ? { signal: run.signal } : {})
            });
        }
    },
    {
        name: 'ask_user',
        description: 'Asks the conversation a question and waits for the answer: the run suspends, the question (with optional one-tap options) renders at the composer, and the next message from a participant replies to it. Use it for decisions that belong to the room — a new definition\'s simplified Mermaid proposition (the diagram in your answer, the validation question here), activation gates carrying live data (status migration targets), or genuinely ambiguous intent. Declared intent proceeds; a failed tool call is retried on its corrected input.',
        inputSchema: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'The question shown to the room.' },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional short answer choices offered as one-tap replies (at most 6).'
                }
            },
            required: ['question'],
            additionalProperties: false
        },
        chatOnly: true,
        execute: async (args, auth, run) => {
            if (!run?.ask) throw createError({ statusCode: 400, message: 'ask_user is available inside a chat run only' });
            const options = (Array.isArray(args.options) ? args.options : [])
                .map(option => String(option || '').trim())
                .filter(Boolean)
                .slice(0, 6);
            const answer = await run.ask(requireString(args.question, 'question'), options);
            return { answer };
        }
    },
    {
        name: 'read_attachment',
        description: 'Reads the content of a file attached to a message in this conversation. Message history marks attachments as [attachment: name <fileId:id>] — pass that fileId. Reads text files, spreadsheets (as CSV), PDFs (page text), DOCX (document body), and audio (as a transcript when the organization has transcription configured); images and video have no text content. Large content is truncated.',
        inputSchema: {
            type: 'object',
            properties: {
                fileId: { type: 'string', description: 'The fileId from an [attachment: …] marker in the conversation.' }
            },
            required: ['fileId'],
            additionalProperties: false
        },
        chatOnly: true,
        execute: async (args, auth, run) => {
            if (!run?.conversationKey) throw createError({ statusCode: 400, message: 'read_attachment is available inside a chat run only' });
            const fileId = requireString(args.fileId, 'fileId');
            const descriptor = await supportService.findConversationAttachment(run.conversationKey, fileId);
            if (!descriptor) throw createError({ statusCode: 404, message: 'No message in this conversation carries that attachment' });
            const buffer = await filesService.getFileBuffer(fileId, descriptor.bucket || 'files').catch(() => null);
            if (!buffer) throw createError({ statusCode: 404, message: 'Attachment content is no longer stored' });
            const content = await readAttachmentContent(descriptor, buffer, auth);
            return {
                name: descriptor.name || '',
                mimeType: descriptor.mimeType || '',
                size: descriptor.size || buffer.length,
                ...content
            };
        }
    },
    {
        name: 'read_instance_file',
        description: 'Reads the file payload of one file-type instance (a stored template or document) through the same extraction families as read_attachment: text files (markdown, DXF), spreadsheets (as CSV), PDFs (page text), DOCX (document body), audio (as a transcript). Instance ids come from list_instances / get_instance. Large content is truncated.',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'The instance type id.' },
                id: { type: 'string', description: 'The instance id from list_instances / get_instance.' }
            },
            required: ['type', 'id'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const type = requireString(args.type, 'type');
            const instance = await instanceServiceFor(type).processGetById(requireString(args.id, 'id'), auth);
            if (!instance) throw createError({ statusCode: 404, message: `No ${type} instance ${args.id}` });
            const payload = instance.payload || null;
            const fileId = payload?.fileId || payload?.id || null;
            if (!fileId) throw createError({ statusCode: 400, message: `${type} instance carries no file payload` });
            const buffer = await filesService.getFileBuffer(fileId, 'files').catch(() => null);
            if (!buffer) throw createError({ statusCode: 404, message: 'File content is no longer stored' });
            const name = payload.name || instance.name || instance.identity?.name || type;
            const content = await readAttachmentContent({ name, mimeType: payload.mime || '' }, buffer, auth);
            return {
                name,
                mimeType: payload.mime || '',
                size: payload.size ?? buffer.length,
                ...content
            };
        }
    }
];

const SPECS_BY_NAME = new Map(TOOL_SPECS.map(spec => [spec.name, spec]));

// Org-gated tools: the descriptor surface reflects the organization's
// configured capabilities — an org without a search provider offers no
// search tool on any surface (the capability-availability law; see the
// web-search README).
const ORG_GATED_TOOLS = {
    web_search: webSearchService.isWebSearchAvailable
};

async function availableSpecs(organizationId) {
    const allowed = new Map();
    for (const [name, check] of Object.entries(ORG_GATED_TOOLS)) {
        allowed.set(name, await check(organizationId).catch(() => false));
    }
    return TOOL_SPECS.filter(spec => !ORG_GATED_TOOLS[spec.name] || allowed.get(spec.name));
}

/** MCP `tools/list` descriptors. */
export async function mcpToolDescriptors(organizationId = null) {
    return (await availableSpecs(organizationId))
        .filter(spec => !spec.chatOnly)
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

/**
 * Protocol-neutral chat descriptors for the LLM loop — the same shape MCP
 * serves. The [llm module](../llm/README.md) translates them onto each
 * provider's wire shape.
 */
export async function chatToolDescriptors(organizationId = null) {
    return (await availableSpecs(organizationId))
        .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

export async function executeTool(name, args, auth, run = null) {
    const spec = SPECS_BY_NAME.get(String(name || ''));
    if (!spec) throw createError({ statusCode: 400, message: `Unknown tool: ${name}` });
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
    return boundedToolResult(await spec.execute(args && typeof args === 'object' ? args : {}, auth, run));
}

/** Authored vocabulary of a call (name, type, action id); storage ids stay out. */
const DETAIL_ARG_KEYS = ['name', 'type', 'actionId'];
const DETAIL_VALUE_LIMIT = 60;
const DETAIL_TOTAL_LIMIT = 120;
export function toolCallDetail(name, args = {}) {
    return DETAIL_ARG_KEYS
        .map(key => String(args?.[key] ?? '').trim())
        .filter(Boolean)
        .map(value => value.slice(0, DETAIL_VALUE_LIMIT))
        .join(' · ')
        .slice(0, DETAIL_TOTAL_LIMIT);
}
