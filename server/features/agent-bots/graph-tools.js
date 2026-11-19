import { randomUUID } from 'node:crypto';
import { createError } from 'h3';
import { normalizeGraphDocument, validateGraphDocument, createCoreGraphDataProvider, CORE_DATA_PROVIDER } from '#packages/core';
import * as graphExecutionsService from '~/server/features/graph-executions/service.js';
import { listInstalledGraphNodeDefinitions } from '~/server/features/plugins/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

/**
 * The graph authoring tools (SPEC §30.9.2): one adapter over the
 * graph-execution and instance payload seams. Reads, validation, and
 * patches run with the caller's auth through the same boundaries the
 * editor and evaluator use; commit, bake, and export keep their explicit
 * routes — no tool here confers them.
 */

const LIST_LIMIT_DEFAULT = 25;
const LIST_LIMIT_MAX = 100;
const LIST_POOL_MAX = 200;

const PATCH_OPS = ['addNode', 'updateNode', 'removeNode', 'addEdge', 'removeEdge', 'setInterface'];

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

function graphDocumentService() {
    const service = getAppRegistry().getInstanceService('graph-document');
    if (!service) throw createError({ statusCode: 503, message: 'Graph document service is unavailable' });
    return service;
}

// Port rows stay summary-level: the transport shape and the semantic base
// are the authoring facts; full semantic descriptors ride the payloads
// (get_graph, validate_graph detail, discover_operations detail).
function interfaceRow(port) {
    return {
        id: port.id,
        shape: port.contract?.shape ?? null,
        base: port.contract?.semantic?.base ?? null
    };
}

function graphSummary(document) {
    return {
        id: document.id,
        revision: document.revision,
        name: document.name,
        inputs: document.interface.inputs.map(port => port.id),
        outputs: document.interface.outputs.map(port => port.id),
        nodes: document.nodes.map(node => ({
            id: node.id,
            operation: `${node.operation.provider}/${node.operation.id}@${node.operation.version}`
        })),
        edges: document.edges.map(edge => ({
            id: edge.id,
            source: `${edge.source.node}:${edge.source.port}`,
            target: `${edge.target.node}:${edge.target.port}`
        }))
    };
}

// Diagnostics already carry nodeId/edgeId/portId/path; edge errors gain the
// IR's expected-versus-actual port contracts and the comparator decision
// with its applicable conversions.
function mappedDiagnostics(ir, diagnostics) {
    const operations = new Map((ir?.operations || []).map(operation => [operation.nodeId, operation]));
    const dependencies = new Map((ir?.dependencies || []).map(dependency => [dependency.edgeId, dependency]));
    const portContract = (nodeId, port) => {
        const operation = operations.get(nodeId);
        if (!operation) return null;
        const slot = [...(operation.slots?.inputs || []), ...(operation.slots?.outputs || [])]
            .find(candidate => candidate.port === port);
        return slot ? { shape: slot.shape ?? null, base: slot.semantic?.base ?? null } : null;
    };
    return (Array.isArray(diagnostics) ? diagnostics : []).map(item => {
        const dependency = item.edgeId ? dependencies.get(item.edgeId) : null;
        if (!dependency) return { ...item };
        return {
            ...item,
            edge: {
                decision: dependency.decision,
                source: {
                    node: dependency.source.node,
                    port: dependency.source.port,
                    contract: portContract(dependency.source.node, dependency.source.port)
                },
                target: {
                    node: dependency.target.node,
                    port: dependency.target.port,
                    contract: portContract(dependency.target.node, dependency.target.port)
                }
            }
        };
    });
}

function operationRow(definition) {
    const port = item => ({
        id: item.id,
        ...(item.shape ? { shape: item.shape } : {}),
        ...(item.semantic?.base ? { base: item.semantic.base } : {}),
        ...(item.required === true ? { required: true } : {})
    });
    return {
        provider: definition.provider,
        id: definition.id,
        version: definition.version,
        label: definition.label || definition.id,
        palette: definition.palette?.group || null,
        inputs: (definition.inputs || []).map(port),
        outputs: (definition.outputs || []).map(port),
        execution: {
            kind: definition.execution?.kind ?? null,
            targets: definition.execution?.targets ?? [],
            capabilities: definition.execution?.capabilities || []
        }
    };
}

function editFailure(index, message) {
    return createError({ statusCode: 400, message: `edits[${index}]: ${message}` });
}

function requireEditId(edit, index) {
    const id = String(edit?.id ?? '').trim();
    if (!id) throw editFailure(index, `${edit?.op} requires an id`);
    return id;
}

// Sequential all-or-nothing edit application over the canonical document.
// removeNode drops every edge touching the node (the editor's own law);
// everything else is left to the canonical validators and the preflight.
function applyGraphEdits(source, edits) {
    const next = structuredClone(source);
    const nodes = new Map(next.nodes.map(node => [node.id, node]));
    const edges = new Map(next.edges.map(edge => [edge.id, edge]));
    for (let index = 0; index < edits.length; index += 1) {
        const edit = edits[index];
        if (!edit || typeof edit !== 'object') throw editFailure(index, 'each edit must be an object');
        if (edit.op === 'addNode') {
            const node = edit.node;
            if (!node || typeof node !== 'object' || !node.id) throw editFailure(index, 'addNode requires a node with an id');
            if (nodes.has(node.id)) throw editFailure(index, `node ${node.id} already exists`);
            nodes.set(node.id, node);
        } else if (edit.op === 'updateNode') {
            const node = nodes.get(requireEditId(edit, index));
            if (!node) throw editFailure(index, `node ${edit.id} does not exist`);
            if (Object.hasOwn(edit, 'config')) {
                if (edit.config == null) node.config = {};
                else if (typeof edit.config !== 'object' || Array.isArray(edit.config)) throw editFailure(index, 'config must be an object');
                else node.config = edit.config;
            }
            if (Object.hasOwn(edit, 'position')) {
                if (edit.position == null) delete node.position;
                else node.position = edit.position;
            }
        } else if (edit.op === 'removeNode') {
            const id = requireEditId(edit, index);
            if (!nodes.delete(id)) throw editFailure(index, `node ${id} does not exist`);
            for (const [edgeId, edge] of edges) {
                if (edge.source.node === id || edge.target.node === id) edges.delete(edgeId);
            }
        } else if (edit.op === 'addEdge') {
            const edge = edit.edge;
            if (!edge || typeof edge !== 'object' || !edge.id) throw editFailure(index, 'addEdge requires an edge with an id');
            if (edges.has(edge.id)) throw editFailure(index, `edge ${edge.id} already exists`);
            edges.set(edge.id, edge);
        } else if (edit.op === 'removeEdge') {
            const id = requireEditId(edit, index);
            if (!edges.delete(id)) throw editFailure(index, `edge ${id} does not exist`);
        } else if (edit.op === 'setInterface') {
            if (Object.hasOwn(edit, 'inputs')) next.interface.inputs = Array.isArray(edit.inputs) ? edit.inputs : [];
            if (Object.hasOwn(edit, 'outputs')) next.interface.outputs = Array.isArray(edit.outputs) ? edit.outputs : [];
        } else {
            throw editFailure(index, `unknown op ${edit.op || '(missing)'} — valid ops: ${PATCH_OPS.join(', ')}`);
        }
    }
    next.nodes = [...nodes.values()];
    next.edges = [...edges.values()];
    return next;
}

export const GRAPH_TOOL_SPECS = [
    {
        name: 'list_graph_catalog',
        description: 'Lists the caller-readable graph documents (id, name, exact saved revision, interface summary). Rows are bounded; each interface summary lists input/output port ids with transport shape and semantic base. query is a case-insensitive substring over the document name and graph id.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' }
            },
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const service = graphDocumentService();
            if (typeof service.processList !== 'function') {
                throw createError({ statusCode: 503, message: 'Graph document listing is unavailable' });
            }
            const query = String(args.query || '').trim().toLowerCase();
            const rows = await service.processList({
                limit: query ? LIST_POOL_MAX : boundLimit(args.limit),
                sortBy: 'createdAt',
                sortDirection: 'desc'
            }, auth);
            const matches = (rows || [])
                .filter(row => !query || [row?.name, row?.identity?.name, row?.fields?.graphId]
                    .some(value => String(value ?? '').toLowerCase().includes(query)))
                .slice(0, boundLimit(args.limit));
            const graphs = [];
            for (const row of matches) {
                try {
                    const graph = await graphExecutionsService.readSavedGraph(row, auth);
                    graphs.push({
                        graphDocumentInstanceId: String(row._id ?? row.id ?? ''),
                        graphId: graph.id,
                        name: row.name ?? row.identity?.name ?? graph.name ?? '',
                        revision: graph.revision,
                        inputs: graph.interface.inputs.map(interfaceRow),
                        outputs: graph.interface.outputs.map(interfaceRow)
                    });
                } catch (error) {
                    if ([403, 404, 409].includes(Number(error?.statusCode))) continue;
                    throw error;
                }
            }
            return { graphs };
        }
    },
    {
        name: 'get_graph',
        description: 'Loads one saved graph document payload (the exact saved revision) with its canonical validation state: the full canonical document plus validate-problems mapped to their document paths. Pass revision to pin the read; a mismatched pin rejects 409. Boundary law: every interface input needs a Graph Input node (perigram.core graph-input, config.interfaceId), every output a Graph Output node; use-graph nodes pin {graphId, revision}.',
        inputSchema: {
            type: 'object',
            properties: {
                graphDocumentInstanceId: { type: 'string' },
                revision: { type: 'string' }
            },
            required: ['graphDocumentInstanceId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const instanceId = requireString(args.graphDocumentInstanceId, 'graphDocumentInstanceId');
            const { graph } = await graphExecutionsService.savedGraphSource(instanceId, auth);
            if (args.revision != null && String(graph.revision) !== String(args.revision).trim()) {
                throw createError({
                    statusCode: 409,
                    message: `Graph revision is stale: saved revision is ${graph.revision}`
                });
            }
            const problems = validateGraphDocument(graph);
            return {
                graphDocumentInstanceId: instanceId,
                graph,
                validation: { ok: !problems.length, problems }
            };
        }
    },
    {
        name: 'discover_operations',
        description: 'Provider-qualified graph operation discovery: the core data provider operations plus every installed managed graph-node definition the server evaluator can resolve for the caller\'s organization — the same resolution path evaluation uses, so a discovered operation is a composable one. Rows carry provider/id@version, palette group, input/output port contracts (transport shape + semantic base), and execution facts (kind, targets, capabilities). operation (provider-qualified, e.g. "plugin.documents/document.compose") serves that one definition in full detail including its configuration schema.',
        inputSchema: {
            type: 'object',
            properties: {
                provider: { type: 'string' },
                operation: { type: 'string' }
            },
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const coreDefinitions = createCoreGraphDataProvider().definitions;
            if (args.operation != null) {
                const qualified = String(args.operation).split('/');
                const [provider, id] = qualified;
                if (qualified.length !== 2 || !provider || !id) {
                    throw createError({ statusCode: 400, message: 'operation must be provider-qualified: provider/id' });
                }
                if (provider === CORE_DATA_PROVIDER) {
                    const definition = coreDefinitions.find(candidate => candidate.id === id);
                    if (!definition) throw createError({ statusCode: 404, message: `Unknown core operation ${provider}/${id}` });
                    return definition;
                }
                const installed = await listInstalledGraphNodeDefinitions({ provider, auth });
                const definition = installed.find(candidate => candidate.id === id);
                if (!definition) {
                    throw createError({ statusCode: 404, message: `Operation ${provider}/${id} is not installed for this organization` });
                }
                return definition;
            }
            const core = coreDefinitions.map(operationRow);
            const installed = (await listInstalledGraphNodeDefinitions({
                ...(args.provider ? { provider: String(args.provider) } : {}),
                auth
            })).map(operationRow);
            return { operations: [...core, ...installed] };
        }
    },
    {
        name: 'validate_graph',
        description: 'Pure validation of a submitted canonical graph document (nothing is persisted): the canonical validators plus the typed-IR preflight over the server resolution path — unresolved operations, unavailable Use Graph pins, server-target violations, and incompatible edges come back as structured diagnostics mapped to nodes, edges, ports, and document paths. Edge diagnostics carry the expected-versus-actual port contracts and the comparator decision with applicable conversions. detail: "ir" adds the full typed IR.',
        inputSchema: {
            type: 'object',
            properties: {
                graph: { type: 'object' },
                detail: { type: 'string', enum: ['ir'] }
            },
            required: ['graph'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            if (!args.graph || typeof args.graph !== 'object' || Array.isArray(args.graph)) {
                throw createError({ statusCode: 400, message: 'graph must be a canonical graph document object' });
            }
            const { ir, diagnostics } = await graphExecutionsService.preflightGraphForServer(args.graph, auth);
            const mapped = mappedDiagnostics(ir, diagnostics);
            return {
                ok: !mapped.some(item => item.severity === 'error'),
                diagnostics: mapped,
                ...(ir ? {
                    capabilities: ir.capabilities,
                    executionKinds: ir.executionKinds,
                    counts: {
                        nodes: ir.operations.length,
                        edges: ir.dependencies.length
                    }
                } : {}),
                ...(args.detail === 'ir' && ir ? { ir } : {})
            };
        }
    },
    {
        name: 'apply_graph_patch',
        description: 'Applies one bounded, transactional edit set to a saved graph document: nodes (addNode/updateNode/removeNode — removeNode drops every edge touching the node), edges (addEdge/removeEdge), and interface changes (setInterface replaces the inputs and/or outputs arrays; every port needs its Graph Input/Graph Output boundary node in the same patch). Requires the exact graph revision last read (expectedRevision); a stale revision rejects 409 with zero writes. The patched document must pass the canonical validators and the typed-IR preflight — a failure returns { applied: false } with the mapped diagnostics and writes nothing. Success persists through the revisioned payload boundary the editor save uses (server-minted revision) and returns the new revision, the document summary, and residual warning diagnostics. node/edge/port shapes are the canonical graph document\'s own.',
        inputSchema: {
            type: 'object',
            properties: {
                graphDocumentInstanceId: { type: 'string' },
                expectedRevision: { type: 'string' },
                edits: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            op: { type: 'string', enum: PATCH_OPS },
                            id: { type: 'string' },
                            node: { type: 'object' },
                            edge: { type: 'object' },
                            config: { type: 'object' },
                            position: {
                                type: 'object',
                                properties: { x: { type: 'number' }, y: { type: 'number' } },
                                required: ['x', 'y'],
                                additionalProperties: false
                            },
                            inputs: { type: 'array', items: { type: 'object' } },
                            outputs: { type: 'array', items: { type: 'object' } }
                        },
                        required: ['op'],
                        additionalProperties: false
                    }
                }
            },
            required: ['graphDocumentInstanceId', 'expectedRevision', 'edits'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const instanceId = requireString(args.graphDocumentInstanceId, 'graphDocumentInstanceId');
            const expectedRevision = requireString(args.expectedRevision, 'expectedRevision');
            const edits = Array.isArray(args.edits) ? args.edits : [];
            if (!edits.length) {
                throw createError({ statusCode: 400, message: 'A patch requires at least one edit' });
            }
            const source = await graphExecutionsService.savedGraphSource(instanceId, auth);
            if (String(source.graph.revision) !== expectedRevision) {
                throw createError({
                    statusCode: 409,
                    message: `Graph revision is stale: saved revision is ${source.graph.revision}; re-read and re-apply`
                });
            }
            let edited;
            try {
                edited = applyGraphEdits(source.graph, edits);
            } catch (error) {
                return {
                    applied: false,
                    revision: source.graph.revision,
                    message: error?.statusCode === 400 ? error.message : String(error?.message || error)
                };
            }
            let candidate;
            try {
                candidate = normalizeGraphDocument({ ...edited, revision: randomUUID() });
            } catch (error) {
                return {
                    applied: false,
                    revision: source.graph.revision,
                    message: error.message
                };
            }
            const { ir, diagnostics } = await graphExecutionsService.preflightGraphForServer(candidate, auth);
            const mapped = mappedDiagnostics(ir, diagnostics);
            if (mapped.some(item => item.severity === 'error')) {
                return { applied: false, revision: source.graph.revision, diagnostics: mapped };
            }
            const name = String(source.graphDocument.name ?? source.graphDocument.identity?.name ?? source.graph.name ?? candidate.name ?? 'graph').trim() || 'graph';
            const updated = await graphDocumentService().replacePayload(
                instanceId,
                {
                    buffer: Buffer.from(JSON.stringify(candidate, null, 2), 'utf8'),
                    filename: `${name}.json`,
                    mimeType: 'application/json'
                },
                {
                    auth,
                    userId: auth.userId,
                    organizationId: source.organizationId,
                    expectedRevision: source.graphDocument.revision ?? null,
                    reason: 'graph-patched'
                }
            );
            return {
                applied: true,
                graphDocumentInstanceId: instanceId,
                instanceRevision: updated?.revision ?? null,
                revision: candidate.revision,
                document: graphSummary(candidate),
                diagnostics: mapped
            };
        }
    },
    {
        name: 'preview_graph',
        description: 'Runs the pure server preview of a saved graph document through the same path the preview endpoint uses (lowering preflight, installed managed providers, read-set recording) and records the procedural-preview execution. The pure/read boundary is the service\'s own: effectful operations refuse. Returns the execution id, status, outputs, and diagnostics; inspect_execution reads the record\'s provenance afterwards.',
        inputSchema: {
            type: 'object',
            properties: {
                graphDocumentInstanceId: { type: 'string' },
                inputBindings: { type: 'object' }
            },
            required: ['graphDocumentInstanceId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const { execution, instance } = await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
                graphDocumentInstanceId: requireString(args.graphDocumentInstanceId, 'graphDocumentInstanceId'),
                inputBindings: args.inputBindings && typeof args.inputBindings === 'object' && !Array.isArray(args.inputBindings)
                    ? args.inputBindings
                    : {}
            }, auth);
            return {
                executionId: execution.id,
                executionInstanceId: instance?._id ?? instance?.id ?? null,
                graph: execution.graph,
                status: execution.status,
                outputs: execution.outputs,
                diagnostics: execution.diagnostics
            };
        }
    },
    {
        name: 'inspect_execution',
        description: 'Provenance inspection of one recorded graph execution (the execution instance id from preview_graph or the collection-outputs listing), read through the same grant those routes use: graph identity and document, status, diagnostics, package pins, read sets (instances, relations, queries, files), node task evidence, nested graph invocations, capability evidence, and artifact rows. Output values stay keyed by id only — resolve pinned collections through the collection-outputs routes and downloads through their own contracts.',
        inputSchema: {
            type: 'object',
            properties: {
                executionInstanceId: { type: 'string' }
            },
            required: ['executionInstanceId'],
            additionalProperties: false
        },
        execute: async (args, auth) => {
            const service = getAppRegistry().getInstanceService('graph-execution');
            if (typeof service?.processGetById !== 'function') {
                throw createError({ statusCode: 404, message: 'Graph execution not found' });
            }
            const record = await service.processGetById(requireString(args.executionInstanceId, 'executionInstanceId'), auth);
            if (!record) throw createError({ statusCode: 404, message: 'Graph execution not found' });
            const fields = record.fields || {};
            const provenance = fields.provenance || {};
            return {
                executionInstanceId: String(record._id ?? record.id ?? ''),
                executionId: String(fields.executionId || ''),
                graph: { id: String(fields.graphId || ''), revision: String(fields.graphRevision || '') },
                graphDocumentInstanceId: fields.graphDocument?.id ? String(fields.graphDocument.id) : null,
                profile: fields.profile ?? null,
                status: fields.status ?? null,
                startedAt: fields.startedAt ?? null,
                completedAt: fields.completedAt ?? null,
                inputKeys: Object.keys(fields.inputs || {}),
                outputIds: Object.keys(fields.outputs || {}),
                diagnostics: fields.diagnostics || [],
                pins: provenance.providers || [],
                readSet: fields.readSet ?? null,
                nodeEvidence: provenance.nodes || [],
                graphInvocations: provenance.invocations || [],
                capabilities: provenance.capabilities || [],
                unverifiedCapabilities: provenance.unverifiedCapabilities || [],
                artifacts: fields.artifacts || []
            };
        }
    }
];
