import { describe, it, expect, beforeEach, vi } from 'vitest';

// The definition tools' authoring-surface contract, pinned: the
// activation-written records (compiled snapshot, history, activated) never
// cross the tool wire in either direction, and a graph-level save composes
// over the stored document instead of replacing it.

const { mockedProcessDefinitions, mockedSupport, mockedTypes, mockedRegistry, mockedOrganizations } = vi.hoisted(() => ({
    mockedProcessDefinitions: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        validate: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        executeActiveProcessAction: vi.fn(),
        composeDefinition: vi.fn()
    },
    mockedSupport: { normalizeInstanceRefs: vi.fn() },
    mockedTypes: { describeOrganizationTypes: vi.fn() },
    mockedRegistry: { getAppRegistry: vi.fn() },
    mockedOrganizations: { listRoles: vi.fn() }
}));

vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/cts-types/service.js', () => mockedTypes);
vi.mock('~/server/runtime/app-registry.js', () => mockedRegistry);
vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);

import { executeTool, mcpToolDescriptors, chatToolDescriptors } from './tools.js';

const AUTH = { userId: 'user-1', organizationId: 'org-1' };
const STORED = {
    identity: { name: 'Organization process' },
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

describe('definition tool authoring surface', () => {
    it('get strips the activation-written records from data', async () => {
        const row = await executeTool('get_process_definition', { definitionId: 'd1' }, AUTH);
        expect(row.data.compiled).toBeUndefined();
        expect(row.data.history).toBeUndefined();
        expect(row.data.activated).toBeUndefined();
        expect(row.data.graph).toEqual(STORED.data.graph);
        expect(row.data.valueInputs).toEqual(STORED.data.valueInputs);
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

    it('serves the authoring vocabulary — palette, node catalog, typed sockets, roles', async () => {
        mockedOrganizations.listRoles.mockResolvedValueOnce({
            role_admin: { id: 'role_admin', label: 'Admin' },
            role_ops: { id: 'role_ops', label: 'Operations' }
        });
        const vocabulary = await executeTool('get_authoring_vocabulary', {}, AUTH);
        const json = JSON.stringify(vocabulary);
        // The payload is data only: no runtime (function) members of the
        // operation registry may cross the wire.
        expect(json).not.toContain('"run"');
        expect(vocabulary.palette.some(group => group.items.some(item => item.type === 'processNode' && item.kind))).toBe(true);
        expect(vocabulary.declarationNodeTypes).toEqual(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);
        expect(vocabulary.nodeCatalog.length).toBeGreaterThan(50);
        expect(vocabulary.nodeCatalog.some(node => node.kind === 'cts.construct')).toBe(true);
        const math = vocabulary.valueOperations['value.math'] || {};
        const firstMath = math[Object.keys(math)[0]];
        expect(Array.isArray(firstMath?.inputs)).toBe(true);
        expect(vocabulary.guide).toContain('compose_process_definition');
        expect(vocabulary.guide).toContain('wireDeclaration');
        // The lane/grant story: the guide teaches the access shape and the
        // org's roles ride the same payload, so grant authoring needs no
        // second tool call.
        expect(vocabulary.guide).toContain('grants');
        expect(mockedOrganizations.listRoles).toHaveBeenCalledWith(AUTH.organizationId, AUTH);
        expect(vocabulary.roles).toEqual([
            { id: 'role_admin', label: 'Admin' },
            { id: 'role_ops', label: 'Operations' }
        ]);
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
});
