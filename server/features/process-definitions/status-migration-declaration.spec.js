import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Apply status-migration declaration seam, pinned: declare_status_
// mappings merges the authored decision onto the definition through the
// save boundary — no whole-document echo — replacing the stored list
// (normalized, deduped), clearing on empty (the applied summary
// survives), and leaving coverage validation to activation, where the
// recomputed plan rides the 400 (the migration-plan contract).

vi.mock('../plugins/repository.js', () => ({
    listDisabledPacks: vi.fn(async () => []),
    enablePack: vi.fn(),
    disablePack: vi.fn(),
    listInstallsByOrganization: vi.fn(async () => []),
    listDeclarationsByOrganization: vi.fn(async () => []),
    findDeclarationByTypeId: vi.fn(async () => null),
    findInstallByConnectorToken: vi.fn(async () => null)
}));
vi.mock('../cts-types/service.js', async () => {
    const cts = await import('#packages/cts');
    const registry = cts.createTypeRegistry({ id: 'spec-cts' });
    for (const declaration of cts.frameworkTypes) registry.defineType(declaration);
    return { compileRegistryForOrganization: vi.fn(async () => registry) };
});
vi.mock('./repository.js', () => ({
    find: vi.fn(),
    findById: vi.fn(),
    findActiveByOrganization: vi.fn(),
    findActiveSetByOrganization: vi.fn(async () => []),
    create: vi.fn(),
    updateById: vi.fn(),
    removeById: vi.fn(),
}));
vi.mock('~/server/runtime/app-registry.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getAppRegistry: vi.fn()
}));
vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, stateService: { ...actual.stateService, transitionWithResult: vi.fn(), setInitialStateForOrganization: vi.fn() } };
});
vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('~/server/features/instance-revisions/service.js', () => ({ getById: vi.fn() }));

import { createDefinitionAuthoring } from '@perigram/processes/authoring';
import * as processRepository from './repository.js';
import { applyAuthoringSteps, declareStatusMappings } from './service.js';

const RAW_DOMAIN = { entities: [], workflows: {}, fieldSchemas: {}, relations: [], commands: {} };
const AUTH = {
    userId: 'user-1',
    organizationId: 'org-1',
    memberships: [{ organizationId: 'org-1', status: 'active', permissions: { organizations: [{ level: 'admin' }] } }]
};

const BASE_STEPS = [
    { op: 'declareClass', id: 'clsTask', typeId: 'task', name: 'Task' },
    { op: 'declareField', id: 'fldTitle', ownerClassId: 'clsTask', name: 'title' },
    { op: 'wireDeclaration', from: 'fldTitle', to: 'clsTask', role: 'declares' },
    { op: 'drop', item: 'construct', id: 'nodeMake' },
    { op: 'wireDeclaration', from: 'clsTask', to: 'nodeMake', role: 'binds' },
    { op: 'drop', item: 'literal', id: 'nodeLit' }
];

function composedData() {
    const authoring = createDefinitionAuthoring(RAW_DOMAIN);
    applyAuthoringSteps(authoring, BASE_STEPS, RAW_DOMAIN);
    return authoring.definition();
}

function storedWith(data) {
    return {
        _id: 'd1',
        identity: { uid: 'process-d1', name: 'X' },
        status: { state: { primary: 'DRAFT' } },
        lineage: { organizationId: 'org-1' },
        data
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    processRepository.findById.mockResolvedValue(storedWith(composedData()));
    processRepository.updateById.mockImplementation(async (_id, doc) => doc);
});

describe('declareStatusMappings', () => {
    it('declares normalized mappings onto the definition through the save boundary', async () => {
        const result = await declareStatusMappings({
            definitionId: 'd1',
            mappings: [
                { typeId: 'task', from: 'archived', to: 'done' },
                { typeId: 'task', from: 'archived', to: 'legacy' },
                { typeId: '', from: 'x', to: 'y' }
            ]
        }, AUTH);
        expect(result).toEqual({
            definitionId: 'd1',
            declared: [{ typeId: 'task', from: 'archived', to: 'done' }]
        });
        const saved = processRepository.updateById.mock.calls[0][1];
        expect(saved.data.migrations.statuses).toEqual([{ typeId: 'task', from: 'archived', to: 'done' }]);
    });

    it('an empty list clears the declaration and preserves the applied summary', async () => {
        const data = composedData();
        data.migrations = {
            statuses: [{ typeId: 'task', from: 'archived', to: 'done' }],
            applied: { appliedAt: '2026-10-17T00:00:00.000Z', applied: 3, failures: [] }
        };
        processRepository.findById.mockResolvedValue(storedWith(data));
        const result = await declareStatusMappings({ definitionId: 'd1', mappings: [] }, AUTH);
        expect(result.declared).toEqual([]);
        const saved = processRepository.updateById.mock.calls[0][1];
        expect(saved.data.migrations.statuses).toBeUndefined();
        expect(saved.data.migrations.applied.applied).toBe(3);
    });

    it('rejects a non-array mapping list without touching the definition', async () => {
        await expect(declareStatusMappings({ definitionId: 'd1', mappings: 'nope' }, AUTH))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(processRepository.updateById).not.toHaveBeenCalled();
    });
});
