import { describe, it, expect, beforeEach, vi } from 'vitest';

// The definition tools' authoring-surface contract, pinned: the
// activation-written records (compiled snapshot, history, activated) never
// cross the tool wire in either direction, and a graph-level save composes
// over the stored document instead of replacing it.

const { mockedProcessDefinitions, mockedSupport, mockedTypes, mockedRegistry, mockedOrganizations, mockedAgentService } = vi.hoisted(() => ({
    mockedProcessDefinitions: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        validate: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        executeActiveProcessAction: vi.fn(),
        composeDefinition: vi.fn(),
        editDefinition: vi.fn()
    },
    mockedSupport: { normalizeInstanceRefs: vi.fn() },
    mockedTypes: { describeOrganizationTypes: vi.fn() },
    mockedRegistry: { getAppRegistry: vi.fn() },
    mockedOrganizations: { listRoles: vi.fn() },
    mockedAgentService: { buildPrincipalAuth: vi.fn() }
}));

vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/cts-types/service.js', () => mockedTypes);
vi.mock('~/server/runtime/app-registry.js', () => mockedRegistry);
vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);
vi.mock('~/server/features/agent-bots/service.js', () => mockedAgentService);

import { executeTool, mcpToolDescriptors, chatToolDescriptors, toolCallDetail } from './tools.js';

const AUTH = { userId: 'user-1', organizationId: 'org-1' };
const STORED = {
    _id: 'd1',
    identity: { uid: 'process-d1', name: 'Organization process' },
    status: { state: { primary: 'DRAFT' } },
    data: {
        dataflowVersion: 4,
        graph: { nodes: [{ id: 'n1' }], edges: [] },
        valueInputs: { a: 1 },
        compiled: { bundle: 'server-derived' },
        history: [{ superseded: true }],
        activated: { snapshot: true }
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedProcessDefinitions.getById.mockResolvedValue(structuredClone(STORED));
    mockedProcessDefinitions.update.mockImplementation(async (_id, payload) => ({ saved: payload }));
    mockedProcessDefinitions.create.mockImplementation(async (payload) => ({ created: payload }));
});

describe('tool call detail', () => {
    it('cites the authored vocabulary a call addressed, storage ids never', () => {
        expect(toolCallDetail('create_process_definition', { name: 'Order flow', data: {} })).toBe('Order flow');
        expect(toolCallDetail('run_action', { actionId: 'rename', instanceId: '507f1f77bcf86cd799439011' })).toBe('rename');
        expect(toolCallDetail('list_instances', { type: 'cassette', limit: 5 })).toBe('cassette');
        // Definition calls addressed by storage id carry no detail — the
        // id is code-only and never renders.
        expect(toolCallDetail('get_process_definition', { definitionId: '507f1f77bcf86cd799439011' })).toBe('');
        expect(toolCallDetail('list_types', {})).toBe('');
    });

    it('joins several values and caps runaway lengths', () => {
        expect(toolCallDetail('x', { name: 'Order flow', type: 'cassette' })).toBe('Order flow · cassette');
        const long = 'x'.repeat(500);
        expect(toolCallDetail('x', { name: long })).toHaveLength(60);
    });
});

describe('definition tool authoring surface', () => {
    it('get serves the compact digest by default and the stripped full document on request', async () => {
        const digest = await executeTool('get_process_definition', { definitionId: 'd1' }, AUTH);
        expect(digest.id).toBe('process-d1');
        expect(digest.name).toBe('Organization process');
        expect(digest.status).toBe('DRAFT');
        expect(digest.valueInputs).toEqual(['a']);
        expect(digest.data).toBeUndefined();
        expect(JSON.stringify(digest).length).toBeLessThan(2048);

        const full = await executeTool('get_process_definition', { definitionId: 'd1', full: true }, AUTH);
        expect(full.data.compiled).toBeUndefined();
        expect(full.data.history).toBeUndefined();
        expect(full.data.activated).toBeUndefined();
        expect(full.data.graph).toEqual(STORED.data.graph);
        expect(full.data.valueInputs).toEqual(STORED.data.valueInputs);
    });

    it('update keeps the stored activation records and drops client-injected ones', async () => {
        await executeTool('update_process_definition', {
            definitionId: 'd1',
            data: { dataflowVersion: 4, graph: { nodes: [] }, compiled: { stale: true }, history: [{ fake: true }] }
        }, AUTH);
        const payload = mockedProcessDefinitions.update.mock.calls[0][1];
        expect(payload.data.history).toEqual([{ superseded: true }]);
        expect(payload.data.activated).toEqual({ snapshot: true });
        expect(payload.data.compiled).toBeUndefined();
        expect(payload.data.graph).toEqual({ nodes: [] });
    });

    it('update_definition_graph replaces graph and value inputs over the stored document', async () => {
        await executeTool('update_definition_graph', {
            definitionId: 'd1',
            graph: { nodes: [{ id: 'n2' }], edges: [{ id: 'e1', source: 'n2', target: 'n2' }] },
            valueInputs: { b: 2 }
        }, AUTH);
        const payload = mockedProcessDefinitions.update.mock.calls[0][1];
        expect(payload.data.graph).toEqual({ nodes: [{ id: 'n2' }], edges: [{ id: 'e1', source: 'n2', target: 'n2' }] });
        expect(payload.data.valueInputs).toEqual({ b: 2 });
        expect(payload.data.dataflowVersion).toBe(4);
        expect(payload.data.history).toEqual([{ superseded: true }]);
    });

    it('a graph save without value inputs keeps the stored ones', async () => {
        await executeTool('update_definition_graph', { definitionId: 'd1', graph: { nodes: [] } }, AUTH);
        expect(mockedProcessDefinitions.update.mock.calls[0][1].data.valueInputs).toEqual({ a: 1 });
    });

    it('create passes seeded authored data through, stripped', async () => {
        await executeTool('create_process_definition', {
            name: 'Fork',
            data: { dataflowVersion: 4, graph: { nodes: [] }, history: [{ fake: true }] }
        }, AUTH);
        expect(mockedProcessDefinitions.create.mock.calls[0][0].data).toEqual({ dataflowVersion: 4, graph: { nodes: [] } });
    });

    it('serves the graph tool on both descriptors; chat-only tools stay off MCP', () => {
        const mcp = mcpToolDescriptors().map(tool => tool.name);
        expect(mcp).toContain('update_definition_graph');
        expect(mcp).not.toContain('attach_instances');
        expect(chatToolDescriptors().map(tool => tool.name)).toContain('attach_instances');
    });

    it('serves the authoring vocabulary compact by default; details arrive on request', async () => {
        mockedOrganizations.listRoles.mockResolvedValue({
            role_admin: { id: 'role_admin', label: 'Admin' },
            role_ops: { id: 'role_ops', label: 'Operations' }
        });
        const vocabulary = await executeTool('get_authoring_vocabulary', {}, AUTH);
        // Compact by default: no catalog or socket tables, palette items
        // are id/kind pairs — one oversized vocabulary response must never
        // evict the tools from a small context window.
        expect(vocabulary.nodeCatalog).toBeUndefined();
        expect(vocabulary.valueOperations).toBeUndefined();
        expect(vocabulary.palette.some(group => group.items.some(item => item.kind))).toBe(true);
        expect(vocabulary.palette.every(group => group.items.every(item => Object.keys(item).length <= 2))).toBe(true);
        expect(vocabulary.declarationNodeTypes).toEqual(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);
        expect(vocabulary.guide).toContain('compose_process_definition');
        expect(vocabulary.guide).toContain('wireDeclaration');
        expect(vocabulary.guide).toContain('grants');
        expect(vocabulary.guide).toContain('edit_process_definition');
        expect(mockedOrganizations.listRoles).toHaveBeenCalledWith(AUTH.organizationId, AUTH);
        expect(vocabulary.roles).toEqual([
            { id: 'role_admin', label: 'Admin' },
            { id: 'role_ops', label: 'Operations' }
        ]);
        expect(JSON.stringify(vocabulary).length).toBeLessThan(12 * 1024);

        const catalog = await executeTool('get_authoring_vocabulary', { detail: 'nodeCatalog', family: 'values' }, AUTH);
        expect(catalog.nodeCatalog.length).toBeGreaterThan(0);
        expect(catalog.nodeCatalog.every(node => node.family === 'values')).toBe(true);

        const socketTable = await executeTool('get_authoring_vocabulary', { detail: 'sockets', kind: 'source.literalItem' }, AUTH);
        expect(socketTable.sockets['source.literalItem'].outputs).toEqual([
            expect.objectContaining({ id: 'value', base: 'json' })
        ]);
        expect(vocabulary.guide).toContain("detail:'sockets'");
        expect(vocabulary.guide).toContain('id is the FROM node');

        const sockets = await executeTool('get_authoring_vocabulary', { detail: 'valueOperations', kind: 'value.math' }, AUTH);
        const math = sockets.valueOperations['value.math'] || {};
        const firstMath = math[Object.keys(math)[0]];
        expect(Array.isArray(firstMath?.inputs)).toBe(true);
        // The payload is data only: no runtime (function) members of the
        // operation registry may cross the wire.
        expect(JSON.stringify(sockets)).not.toContain('"run"');
    });

    it('composes definitions through the headless seam with the caller\'s auth', async () => {
        mockedProcessDefinitions.composeDefinition.mockResolvedValueOnce({ _id: 'process-new', states: { main: 'DRAFT' } });
        const result = await executeTool('compose_process_definition', {
            name: 'Composed',
            steps: [
                { op: 'declareClass', id: 'cls_a', typeId: 't-x', name: 'A' },
                { op: 'drop', item: 'construct', id: 'node_b' }
            ]
        }, AUTH);
        expect(mockedProcessDefinitions.composeDefinition).toHaveBeenCalledWith({
            name: 'Composed',
            steps: [
                { op: 'declareClass', id: 'cls_a', typeId: 't-x', name: 'A' },
                { op: 'drop', item: 'construct', id: 'node_b' }
            ]
        }, AUTH);
        expect(result._id).toBe('process-new');
    });

    it('edits an existing definition through gestures with the caller\'s auth', async () => {
        mockedProcessDefinitions.editDefinition.mockResolvedValueOnce({ _id: 'd1', states: { main: 'DRAFT' } });
        const result = await executeTool('edit_process_definition', {
            definitionId: 'd1',
            steps: [
                { op: 'drop', item: 'construct', id: 'node_c' },
                { op: 'configure', id: 'node_c', values: { typeId: 'cassette' } }
            ]
        }, AUTH);
        expect(mockedProcessDefinitions.editDefinition).toHaveBeenCalledWith({
            definitionId: 'd1',
            steps: [
                { op: 'drop', item: 'construct', id: 'node_c' },
                { op: 'configure', id: 'node_c', values: { typeId: 'cassette' } }
            ]
        }, AUTH);
        expect(result._id).toBe('d1');
        expect(mcpToolDescriptors().map(tool => tool.name)).toContain('edit_process_definition');
    });

    it('truncates oversized tool results instead of blinding the model', async () => {
        mockedProcessDefinitions.list.mockResolvedValueOnce(
            Array.from({ length: 900 }, (_, index) => ({ id: `process-${index}`, name: `Definition ${index}`, status: 'ACTIVE' }))
        );
        const result = await executeTool('list_process_definitions', {}, AUTH);
        expect(result.truncated).toBe(true);
        expect(result.notice).toContain('truncated');
        expect(result.bytes).toBeGreaterThan(16 * 1024);
        expect(result.preview.length).toBeLessThanOrEqual(4096);
    });

    it('forwards the chat-run side channel — attach_instances accumulates refs inside a run', async () => {
        mockedSupport.normalizeInstanceRefs.mockResolvedValue([
            { type: 'cassette', id: 'c1', label: 'Cassette One' },
            { type: 'sheet', id: 's1', label: 'Sheet One' }
        ]);
        const run = { instanceRefs: [] };
        const result = await executeTool('attach_instances', { instances: [{ type: 'cassette', id: 'c1' }] }, AUTH, run);
        expect(result).toEqual([
            { type: 'cassette', id: 'c1', label: 'Cassette One' },
            { type: 'sheet', id: 's1', label: 'Sheet One' }
        ]);
        expect(run.instanceRefs).toHaveLength(2);
        // Without a run the tool states its real constraint.
        await expect(executeTool('attach_instances', { instances: [{ type: 'cassette', id: 'c1' }] }, AUTH))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('serves the action manifest live — mid-run activations are visible without a new run', async () => {
        // The run-start snapshot carries no actions; the live principal
        // does. The manifest must reflect the live one.
        mockedAgentService.buildPrincipalAuth.mockResolvedValue({
            userId: AUTH.userId,
            organizationId: AUTH.organizationId,
            roleAssignments: { actions: [
                { id: 'nodeMake', actionKind: 'createInstance', typeId: 'test-task', label: 'Create Task' },
                { id: 'nodeUpdate', actionKind: 'updateInstance', typeId: 'test-task', label: 'Update Task' }
            ] }
        });
        const actions = await executeTool('list_actions', {}, AUTH);
        expect(mockedAgentService.buildPrincipalAuth).toHaveBeenCalledWith(AUTH.userId);
        expect(actions.map(action => action.id)).toEqual(['nodeMake', 'nodeUpdate']);

        mockedProcessDefinitions.executeActiveProcessAction.mockResolvedValue({ ok: true });
        await executeTool('run_action', { actionId: 'nodeUpdate', instanceId: 'i1', data: { done: false } }, AUTH);
        const liveAuth = mockedProcessDefinitions.executeActiveProcessAction.mock.calls[0][1];
        expect(liveAuth.userId).toBe(AUTH.userId);
        expect(liveAuth.roleAssignments.actions.map(action => action.id)).toContain('nodeUpdate');
    });
});
