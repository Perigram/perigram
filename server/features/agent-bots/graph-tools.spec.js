import { describe, it, expect, beforeEach, vi } from 'vitest';

// The graph tools' §30.9.2 contract, pinned: the tools/list surface, the
// catalog/get/validate discovery and inspection reads, and the patch
// transaction — stale revision and failed validation write nothing, a
// valid patch persists through the revisioned payload boundary the editor
// save uses, and refusals arrive as mapped diagnostics the caller can act
// on. Services are mocked at their seams; the canonical graph validators
// and document shapes run real.

const { mockedGraphExecutions, mockedPlugins, mockedRegistry, mockedGraphService, mockedExecutionService } = vi.hoisted(() => ({
    mockedGraphExecutions: {
        savedGraphSource: vi.fn(),
        readSavedGraph: vi.fn(),
        preflightGraphForServer: vi.fn(),
        evaluateAndRecordSavedGraphPreview: vi.fn()
    },
    mockedPlugins: { listInstalledGraphNodeDefinitions: vi.fn() },
    mockedRegistry: { getInstanceService: vi.fn() },
    mockedGraphService: { processList: vi.fn(), processGetById: vi.fn(), replacePayload: vi.fn() },
    mockedExecutionService: { processGetById: vi.fn() }
}));

vi.mock('~/server/features/graph-executions/service.js', () => mockedGraphExecutions);
vi.mock('~/server/features/plugins/service.js', () => mockedPlugins);
vi.mock('~/server/runtime/app-registry.js', () => ({ getAppRegistry: () => mockedRegistry }));

import { executeTool, mcpToolDescriptors } from './tools.js';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '#packages/core';

const AUTH = { userId: 'user-1', organizationId: 'org-1' };

const GRAPH = () => ({
    format: 'perigram.graph',
    version: 1,
    id: 'graph.report',
    revision: 'rev-01',
    name: 'Report graph',
    interface: {
        inputs: [{ id: 'source', label: 'Source', contract: { shape: 'item', semantic: { base: 'string' } } }],
        outputs: [{ id: 'report', label: 'Report', contract: { shape: 'item', semantic: { base: 'string' } } }]
    },
    nodes: [
        { id: 'input-1', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'source' } },
        { id: 'format-1', operation: { provider: 'plugin.documents', id: 'document.compose', version: '3' }, config: { template: 'brief' } },
        { id: 'output-1', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'report' } }
    ],
    edges: [
        { id: 'edge-1', source: { node: 'input-1', port: 'value' }, target: { node: 'format-1', port: 'source' } },
        { id: 'edge-2', source: { node: 'format-1', port: 'value' }, target: { node: 'output-1', port: 'value' } }
    ]
});

const GRAPH_DOCUMENT = () => ({
    _id: 'graph-instance-1',
    organizationId: 'org-1',
    name: 'Report graph',
    revision: 4,
    fields: { graphId: 'graph.report' },
    payload: { fileId: 'graph-file-1' }
});

const IR = () => ({
    operations: [
        { nodeId: 'input-1', slots: { inputs: [], outputs: [{ port: 'value', shape: 'item', semantic: { base: 'string' }, required: true }] } },
        { nodeId: 'format-1', slots: { inputs: [{ port: 'source', shape: 'item', semantic: { base: 'string' }, required: true }], outputs: [{ port: 'value', shape: 'item', semantic: { base: 'number' }, required: true }] } },
        { nodeId: 'output-1', slots: { inputs: [{ port: 'value', shape: 'item', semantic: { base: 'string' }, required: true }], outputs: [] } }
    ],
    dependencies: [
        { edgeId: 'edge-1', decision: { status: 'exact', compatible: true, reason: 'match', conversions: [] } },
        { edgeId: 'edge-2', decision: { status: 'exact', compatible: true, reason: 'match', conversions: [] } }
    ],
    capabilities: [],
    executionKinds: ['pure']
});

const INSTALLED_DEFINITION = () => ({
    provider: 'plugin.documents',
    id: 'document.compose',
    version: '3',
    label: 'Compose document',
    palette: { group: 'documents' },
    inputs: [{ id: 'source', label: 'Source', shape: 'item', semantic: { base: 'string' }, required: true }],
    outputs: [{ id: 'value', label: 'Value', shape: 'item', semantic: { base: 'document' }, required: true }],
    configuration: { type: 'object', properties: { template: { type: 'string' } } },
    execution: { kind: 'pure', targets: ['server'], capabilities: [], deterministic: true },
    packagePin: { pluginId: 'documents', version: '31', runtimeId: 'documents-shared', operationId: 'document.compose' }
});

beforeEach(() => {
    vi.clearAllMocks();
    mockedRegistry.getInstanceService.mockImplementation(type => (
        type === 'graph-document' ? mockedGraphService : type === 'graph-execution' ? mockedExecutionService : null
    ));
    mockedGraphExecutions.savedGraphSource.mockResolvedValue({
        graphDocument: GRAPH_DOCUMENT(),
        graph: GRAPH(),
        organizationId: 'org-1'
    });
    mockedGraphExecutions.preflightGraphForServer.mockResolvedValue({ ir: IR(), diagnostics: [] });
    mockedGraphExecutions.readSavedGraph.mockImplementation(async row => GRAPH());
    mockedPlugins.listInstalledGraphNodeDefinitions.mockResolvedValue([INSTALLED_DEFINITION()]);
    mockedGraphService.replacePayload.mockResolvedValue({ _id: 'graph-instance-1', revision: 5 });
});

describe('tools/list surface', () => {
    it('serves the graph tools with stable input schemas', async () => {
        const tools = await mcpToolDescriptors('org-1');
        const names = tools.map(tool => tool.name);
        for (const name of ['list_graph_catalog', 'get_graph', 'discover_operations', 'validate_graph', 'apply_graph_patch', 'preview_graph', 'inspect_execution']) {
            expect(names).toContain(name);
        }
        for (const name of ['apply_graph_patch', 'validate_graph']) {
            expect(tools.find(tool => tool.name === name).inputSchema).toMatchObject({ type: 'object' });
        }
    });
});

describe('list_graph_catalog', () => {
    it('serves bounded rows with interface summaries through the graph-document read grant', async () => {
        mockedGraphService.processList.mockResolvedValue([
            { _id: 'g1', name: 'Report graph', fields: { graphId: 'graph.report' } },
            { _id: 'g2', name: 'Parts query', fields: { graphId: 'graph.parts' } },
            { _id: 'g3', name: 'Missing payload', fields: { graphId: 'graph.gone' } }
        ]);
        mockedGraphExecutions.readSavedGraph.mockImplementation(async row => (
            row._id === 'g3' ? Promise.reject(Object.assign(new Error('not found'), { statusCode: 404 })) : GRAPH()
        ));
        const result = await executeTool('list_graph_catalog', { limit: 2 }, AUTH);
        expect(mockedGraphService.processList).toHaveBeenCalledWith(
            { limit: 2, sortBy: 'createdAt', sortDirection: 'desc' },
            AUTH
        );
        expect(result.graphs).toHaveLength(2);
        expect(result.graphs[0]).toMatchObject({
            graphDocumentInstanceId: 'g1',
            graphId: 'graph.report',
            name: 'Report graph',
            revision: 'rev-01'
        });
        expect(result.graphs[0].inputs).toEqual([{ id: 'source', shape: 'item', base: 'string' }]);
        expect(result.graphs[0].outputs).toEqual([{ id: 'report', shape: 'item', base: 'string' }]);
    });

    it('narrows by query over name and graph id before payload reads', async () => {
        mockedGraphService.processList.mockResolvedValue([
            { _id: 'g1', name: 'Report graph', fields: { graphId: 'graph.report' } },
            { _id: 'g2', name: 'Parts query', fields: { graphId: 'graph.parts' } }
        ]);
        const result = await executeTool('list_graph_catalog', { query: 'parts' }, AUTH);
        expect(mockedGraphService.processList).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 200 }),
            AUTH
        );
        expect(result.graphs.map(row => row.graphDocumentInstanceId)).toEqual(['g2']);
        expect(mockedGraphExecutions.readSavedGraph).toHaveBeenCalledTimes(1);
    });

    it('caps the limit at 100', async () => {
        mockedGraphService.processList.mockResolvedValue([]);
        await executeTool('list_graph_catalog', { limit: 5000 }, AUTH);
        expect(mockedGraphService.processList).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 100 }),
            AUTH
        );
    });
});

describe('get_graph', () => {
    it('serves the saved canonical document with its validation state', async () => {
        const result = await executeTool('get_graph', { graphDocumentInstanceId: 'graph-instance-1' }, AUTH);
        expect(result.graphDocumentInstanceId).toBe('graph-instance-1');
        expect(result.graph.revision).toBe('rev-01');
        expect(result.validation.ok).toBe(true);
        expect(mockedGraphExecutions.savedGraphSource).toHaveBeenCalledWith('graph-instance-1', AUTH);
    });

    it('reports canonical problems mapped to document paths', async () => {
        const broken = GRAPH();
        broken.nodes = broken.nodes.filter(node => node.id !== 'output-1');
        mockedGraphExecutions.savedGraphSource.mockResolvedValue({
            graphDocument: GRAPH_DOCUMENT(),
            graph: broken,
            organizationId: 'org-1'
        });
        const result = await executeTool('get_graph', { graphDocumentInstanceId: 'graph-instance-1' }, AUTH);
        expect(result.validation.ok).toBe(false);
        expect(result.validation.problems[0]).toMatchObject({ code: 'missing-output-boundary', path: 'interface.outputs' });
    });

    it('rejects a mismatched revision pin as stale', async () => {
        await expect(executeTool('get_graph', { graphDocumentInstanceId: 'graph-instance-1', revision: 'rev-00' }, AUTH))
            .rejects.toMatchObject({ statusCode: 409 });
    });
});

describe('discover_operations', () => {
    it('lists core provider rows beside installed graph-node rows', async () => {
        const result = await executeTool('discover_operations', {}, AUTH);
        const ids = result.operations.map(row => `${row.provider}/${row.id}`);
        expect(ids).toContain('perigram.core.data/query.instances');
        expect(ids).toContain('plugin.documents/document.compose');
        const installed = result.operations.find(row => row.provider === 'plugin.documents');
        expect(installed).toMatchObject({ version: '3', palette: 'documents' });
        expect(installed.inputs).toEqual([{ id: 'source', shape: 'item', base: 'string', required: true }]);
        expect(installed.execution.kind).toBe('pure');
    });

    it('scopes installed enumeration through the same resolution seam with the provider filter', async () => {
        await executeTool('discover_operations', { provider: 'plugin.documents' }, AUTH);
        expect(mockedPlugins.listInstalledGraphNodeDefinitions).toHaveBeenCalledWith({ provider: 'plugin.documents', auth: AUTH });
    });

    it('serves one full definition by provider-qualified id', async () => {
        const detail = await executeTool('discover_operations', { operation: 'plugin.documents/document.compose' }, AUTH);
        expect(detail).toMatchObject({ provider: 'plugin.documents', id: 'document.compose' });
        expect(detail.configuration).toBeDefined();
        const core = await executeTool('discover_operations', { operation: 'perigram.core.data/query.instances' }, AUTH);
        expect(core.id).toBe('query.instances');
        await expect(executeTool('discover_operations', { operation: 'plugin.documents/nope' }, AUTH))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('validate_graph', () => {
    it('answers ok with counts for a clean document', async () => {
        const result = await executeTool('validate_graph', { graph: GRAPH() }, AUTH);
        expect(result.ok).toBe(true);
        expect(result.counts).toEqual({ nodes: 3, edges: 2 });
        expect(result.ir).toBeUndefined();
    });

    it('maps edge diagnostics to expected-versus-actual contracts with the conversion decision', async () => {
        const conversion = { convert: 'unit', from: 'mm', to: 'm' };
        mockedGraphExecutions.preflightGraphForServer.mockResolvedValue({
            ir: {
                ...IR(),
                dependencies: [
                    ...IR().dependencies.slice(0, 1),
                    {
                        edgeId: 'edge-2',
                        source: { node: 'format-1', port: 'value' },
                        target: { node: 'output-1', port: 'value' },
                        decision: { status: 'convertible', compatible: false, reason: 'Unit mm requires conversion to m', conversions: [conversion] }
                    }
                ]
            },
            diagnostics: [{
                code: 'lowering-diagnostic',
                severity: 'error',
                phase: 'lowering',
                message: 'Edge edge-2 is incompatible: Unit mm requires conversion to m',
                nodeId: 'format-1',
                edgeId: 'edge-2',
                portId: 'value'
            }]
        });
        const result = await executeTool('validate_graph', { graph: GRAPH() }, AUTH);
        expect(result.ok).toBe(false);
        const edgeDiagnostic = result.diagnostics[0];
        expect(edgeDiagnostic.edgeId).toBe('edge-2');
        expect(edgeDiagnostic.edge.decision.conversions).toEqual([conversion]);
        expect(edgeDiagnostic.edge.source).toMatchObject({ node: 'format-1', port: 'value', contract: { shape: 'item', base: 'number' } });
        expect(edgeDiagnostic.edge.target.contract).toMatchObject({ shape: 'item', base: 'string' });
    });

    it('serves the full typed IR on demand', async () => {
        const result = await executeTool('validate_graph', { graph: GRAPH(), detail: 'ir' }, AUTH);
        expect(result.ir.operations).toHaveLength(3);
    });
});

describe('apply_graph_patch', () => {
    it('applies a coherent edit set atomically and persists through the revisioned payload boundary', async () => {
        const result = await executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [
                { op: 'updateNode', id: 'format-1', config: { template: 'full' } },
                { op: 'addNode', node: { id: 'stamp-1', operation: { provider: 'plugin.documents', id: 'document.stamp', version: '1' }, config: {} } },
                { op: 'addEdge', edge: { id: 'edge-3', source: { node: 'stamp-1', port: 'value' }, target: { node: 'output-1', port: 'value' } } }
            ]
        }, AUTH);
        expect(result.applied).toBe(true);
        expect(result.revision).not.toBe('rev-01');
        expect(result.document.nodes.map(node => node.id)).toContain('stamp-1');
        expect(result.document.edges).toHaveLength(3);
        expect(mockedGraphExecutions.savedGraphSource).toHaveBeenCalledWith('graph-instance-1', AUTH);
        expect(mockedGraphExecutions.preflightGraphForServer).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'graph.report', revision: result.revision }),
            AUTH
        );
        expect(mockedGraphService.replacePayload).toHaveBeenCalledTimes(1);
        const [instanceId, payload, context] = mockedGraphService.replacePayload.mock.calls[0];
        expect(instanceId).toBe('graph-instance-1');
        expect(context).toMatchObject({
            userId: 'user-1',
            organizationId: 'org-1',
            expectedRevision: 4,
            reason: 'graph-patched'
        });
        expect(payload.filename).toBe('Report graph.json');
        const persisted = JSON.parse(payload.buffer.toString('utf8'));
        expect(persisted.revision).toBe(result.revision);
        expect(persisted.nodes.find(node => node.id === 'format-1').config).toEqual({ template: 'full' });
    });

    it('drops edges touching a removed node', async () => {
        const result = await executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [{ op: 'removeNode', id: 'format-1' }]
        }, AUTH);
        expect(result.applied).toBe(true);
        expect(result.document.edges).toEqual([]);
        expect(result.document.nodes).toHaveLength(2);
    });

    it('rejects a stale expected revision with zero writes', async () => {
        await expect(executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-00',
            edits: [{ op: 'removeNode', id: 'format-1' }]
        }, AUTH)).rejects.toMatchObject({ statusCode: 409 });
        expect(mockedGraphService.replacePayload).not.toHaveBeenCalled();
    });

    it('refuses an invalid resulting document with mapped diagnostics and zero writes', async () => {
        mockedGraphExecutions.preflightGraphForServer.mockResolvedValue({
            ir: IR(),
            diagnostics: [{
                code: 'lowering-diagnostic',
                severity: 'error',
                phase: 'lowering',
                message: 'Operation plugin.documents/document.stamp@1 for node stamp-1 is unresolved',
                nodeId: 'stamp-1'
            }]
        });
        const result = await executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [{ op: 'addNode', node: { id: 'stamp-1', operation: { provider: 'plugin.documents', id: 'document.stamp', version: '1' }, config: {} } }]
        }, AUTH);
        expect(result).toMatchObject({ applied: false, revision: 'rev-01' });
        expect(result.diagnostics[0]).toMatchObject({ nodeId: 'stamp-1', severity: 'error' });
        expect(mockedGraphService.replacePayload).not.toHaveBeenCalled();
    });

    it('refuses an edit naming an unknown node, naming the edit', async () => {
        const result = await executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [{ op: 'removeNode', id: 'ghost' }]
        }, AUTH);
        expect(result.applied).toBe(false);
        expect(result.message).toMatch(/edits\[0\]: node ghost does not exist/);
        expect(mockedGraphExecutions.preflightGraphForServer).not.toHaveBeenCalled();
        expect(mockedGraphService.replacePayload).not.toHaveBeenCalled();
    });

    it('refuses a patch that breaks the canonical document shape before preflight', async () => {
        const result = await executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [{
                op: 'addNode',
                node: { id: 'broken', operation: { provider: 'plugin.documents', id: 'document.stamp', version: '1' }, position: { x: 'NaN' } }
            }]
        }, AUTH);
        expect(result.applied).toBe(false);
        expect(result.message).toMatch(/position/i);
        expect(mockedGraphExecutions.preflightGraphForServer).not.toHaveBeenCalled();
        expect(mockedGraphService.replacePayload).not.toHaveBeenCalled();
    });
});

describe('preview_graph and inspect_execution', () => {
    it('previews through the recorded saved-graph preview path', async () => {
        mockedGraphExecutions.evaluateAndRecordSavedGraphPreview.mockResolvedValue({
            execution: {
                id: 'exec-1',
                graph: { id: 'graph.report', revision: 'rev-01' },
                status: 'succeeded',
                outputs: { report: 'Generated' },
                diagnostics: []
            },
            instance: { _id: 'execution-instance-1' }
        });
        const result = await executeTool('preview_graph', {
            graphDocumentInstanceId: 'graph-instance-1',
            inputBindings: { source: 'hello' }
        }, AUTH);
        expect(mockedGraphExecutions.evaluateAndRecordSavedGraphPreview).toHaveBeenCalledWith({
            graphDocumentInstanceId: 'graph-instance-1',
            inputBindings: { source: 'hello' }
        }, AUTH);
        expect(result).toMatchObject({
            executionId: 'exec-1',
            executionInstanceId: 'execution-instance-1',
            status: 'succeeded',
            outputs: { report: 'Generated' }
        });
    });

    it('inspects a recorded execution through the collection-outputs read grant', async () => {
        mockedExecutionService.processGetById.mockResolvedValue({
            _id: 'execution-instance-1',
            fields: {
                executionId: 'exec-1',
                graphId: 'graph.report',
                graphRevision: 'rev-01',
                graphDocument: { type: 'graph-document', id: 'graph-instance-1' },
                profile: 'procedural-preview',
                status: 'succeeded',
                startedAt: '2026-11-19T10:00:00.000Z',
                completedAt: '2026-11-19T10:00:01.000Z',
                inputs: { source: 'hello' },
                outputs: { report: 'Generated' },
                diagnostics: [],
                provenance: {
                    nodes: [{ nodeId: 'format-1', status: 'succeeded' }],
                    invocations: [],
                    providers: [{ pluginId: 'documents', version: '31', runtimeId: 'documents-shared', operations: ['document.compose'] }],
                    capabilities: [],
                    unverifiedCapabilities: []
                },
                readSet: { instances: [], relations: [], queries: [] },
                artifacts: []
            }
        });
        const result = await executeTool('inspect_execution', { executionInstanceId: 'execution-instance-1' }, AUTH);
        expect(mockedExecutionService.processGetById).toHaveBeenCalledWith('execution-instance-1', AUTH);
        expect(result).toMatchObject({
            executionId: 'exec-1',
            graphDocumentInstanceId: 'graph-instance-1',
            status: 'succeeded',
            inputKeys: ['source'],
            outputIds: ['report']
        });
        expect(result.pins[0].operations).toEqual(['document.compose']);
        expect(result.nodeEvidence[0].nodeId).toBe('format-1');
    });

    it('answers 404 for an execution the caller cannot read', async () => {
        mockedExecutionService.processGetById.mockResolvedValue(null);
        await expect(executeTool('inspect_execution', { executionInstanceId: 'nope' }, AUTH))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('authorization', () => {
    it('runs every tool under the caller\'s auth and propagates read refusals', async () => {
        mockedGraphExecutions.savedGraphSource.mockRejectedValue(Object.assign(new Error('Permission denied'), { statusCode: 403 }));
        await expect(executeTool('get_graph', { graphDocumentInstanceId: 'graph-instance-1' }, AUTH))
            .rejects.toMatchObject({ statusCode: 403 });
        await expect(executeTool('apply_graph_patch', {
            graphDocumentInstanceId: 'graph-instance-1',
            expectedRevision: 'rev-01',
            edits: [{ op: 'removeEdge', id: 'edge-1' }]
        }, AUTH)).rejects.toMatchObject({ statusCode: 403 });
        expect(mockedGraphService.replacePayload).not.toHaveBeenCalled();
    });
});
