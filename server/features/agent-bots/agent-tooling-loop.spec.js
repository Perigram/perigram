import { beforeEach, describe, expect, it, vi } from 'vitest';

// executeTool — the catalog the model drives on chat and MCP — over the
// real process-definitions service and headless authoring seam, on an
// in-memory definition store. Faked persistence: no stored org types
// app-registry instance services per test.
//
// Contracts pinned:
//  1. compose/edit answer a digest whose edges address node:socket.
//  2. Illegal gestures (unknown port, control into a data socket,
//     second wire on a single-value input) fail BY NAME and persist
//     nothing — steps apply atomically.
//  3. Graph replacements carrying handle-less data edges fail at the
//     save floor.
//  4. Declaration edges (role 'type') keep their node-to-node shape.
//  5. The activation migration gate returns as a structured
//     activationBlocked result carrying the plan; off-target
//     declarations fail activation with the plan attached; a correct
//     declaration re-activates, re-targets stranded instances, records
//     the applied summary.
//  6. Control-only graphs fail reachability; a reachable control node
//     compiles to no action or screen of its own.

vi.mock('../plugins/repository.js', () => ({
    listDisabledPacks: vi.fn(async () => []),
    enablePack: vi.fn(),
    disablePack: vi.fn(),
    // The facade install serves the fixture's cassette construction
    // contract (construction is plugin-served since the pack cutover).
    listInstallsByOrganization: vi.fn(async () => [{
        pluginId: 'facade',
        declarations: { constructions: { cassette: { editor: 'plugin.facade.bake' } } }
    }]),
    listDeclarationsByOrganization: vi.fn(async () => []),
    findDeclarationByTypeId: vi.fn(async () => null),
    findInstallByConnectorToken: vi.fn(async () => null)
}));
vi.mock('../cts-types/service.js', async () => {
    const cts = await import('#packages/cts');
    const pack = await import('@perigram/cts/pack/cnc');
    const domainPack = await import('../../../test-tools/facade-plugin.js');
    const registry = cts.createTypeRegistry({ id: 'spec-cts' });
    for (const declaration of [...cts.frameworkTypes, ...pack.cncTypePack, ...domainPack.facadeFileTypes]) {
        registry.defineType(declaration);
    }
    // The persisted-acceptance fixture authors a cassette construct; the
    // packs that once served it are plugin-served now, so this registry
    // declares it beside the packs.
    registry.defineType({ id: 'cassette', class: 'item', fields: { name: { base: 'string' } } });
    return {
        compileRegistryForOrganization: vi.fn(async () => registry),
        describeOrganizationTypes: vi.fn(async () => ({ bundle: { types: [] } })),
        // defineType persists the org declaration; the next registry
        // compile serves it.
        defineType: vi.fn(async declaration => {
            registry.defineType(declaration);
            return declaration;
        })
    };
});
// No stored org-authored types: activate stays hermetic.
vi.mock('../cts-types/repository.js', () => ({
    listByOrganization: vi.fn(async () => []),
    findByTypeId: vi.fn(async () => null)
}));
vi.mock('~/server/runtime/app-registry.js', () => ({
    getAppRegistry: vi.fn(),
    getAppRegistry: vi.fn(),
    resetAppRegistryForTests: vi.fn(),
    resetAppRegistryForTests: vi.fn()
}));
vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        stateService: { ...actual.stateService, setInitialStateForOrganization: vi.fn() }
    };
});
vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('~/server/features/instance-revisions/service.js', () => ({ getById: vi.fn() }));
vi.mock('../organizations/service.js', () => ({
    listRoles: vi.fn(async () => ({ role_admin: { id: 'role_admin', label: 'Admin' } }))
}));
vi.mock('../support/service.js', () => ({
    normalizeInstanceRefs: vi.fn(async () => []),
    findConversationAttachment: vi.fn(async () => null)
}));
vi.mock('../web-search/service.js', () => ({
    isWebSearchAvailable: vi.fn(async () => false),
    webSearch: vi.fn()
}));
vi.mock('../files/service.js', () => ({ getFileBuffer: vi.fn() }));
vi.mock('./service.js', () => ({ buildPrincipalAuth: vi.fn(async auth => auth) }));

// In-memory definition store: create composes through the seam, update
// saves, activate flips the stored row — the loop reads back what it
// wrote, exactly like the model's next tool call does against Mongo.
function makeDefinitionStore() {
    const rows = new Map();
    const primary = row => row?.states?.main ?? row?.status?.state?.primary ?? row?.status?.state ?? null;
    return {
        rows,
        insert: vi.fn(async doc => {
            const plain = doc.toJSON ? doc.toJSON() : doc;
            // The uid is the stable wire address (get_process_definition
            // reads it); Mongo's _id never leaves the repository.
            const row = { ...plain, _id: plain?.identity?.uid || `def-${rows.size + 1}` };
            rows.set(row._id, row);
            return row;
        }),
        findById: vi.fn(async id => rows.get(String(id)) ?? null),
        findActiveByOrganization: vi.fn(async organizationId =>
            [...rows.values()].find(row => row.lineage?.organizationId === organizationId && primary(row) === 'ACTIVE') ?? null),
        findActiveSetByOrganization: vi.fn(async organizationId =>
            [...rows.values()].filter(row => row.lineage?.organizationId === organizationId && primary(row) === 'ACTIVE')),
        updateById: vi.fn(async (id, doc) => {
            const row = { ...(doc.toJSON ? doc.toJSON() : doc), _id: String(id) };
            rows.set(String(id), row);
            return row;
        }),
        seed(row) {
            rows.set(String(row._id), row);
            return row;
        }
    };
}

vi.mock('../process-definitions/repository.js', async () => {
    const store = makeDefinitionStore();
    return {
        __store: store,
        find: vi.fn(async () => []),
        findById: store.findById,
        findActiveByOrganization: store.findActiveByOrganization,
        findActiveSetByOrganization: store.findActiveSetByOrganization,
        create: store.insert,
        insert: store.insert,
        updateById: store.updateById,
        removeById: vi.fn(),
    };
});

import { executeTool } from './tools.js';
import { createPersistedAcceptanceFixture } from '../../../test-data/persisted-acceptance.js';
import { stateService } from '~/server/core/machines/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as processRepository from '../process-definitions/repository.js';
import { authoredProcessDataFromGraphDocument } from '#packages/processes';

const AUTH = {
    userId: 'admin',
    organizationId: 'org-acceptance',
    effectivePermissions: { organizations: { level: 'admin' }, materials: { level: 'admin' } }
};

const organizationService = {
    getProcessConfiguration: vi.fn()
};

const store = () => processRepository.__store;

// The wiring legs author the in-tree way: a declared class + field, a
// construct bound to it (the draft-overlay law — the field's port exists
// the moment wireDeclaration lands), and a literal on the field socket.
// (A registry type in editor mode takes its field values from the
// construct dialog, not sockets — only lineage/relations inputs are
// wired; that shape carries the happy-path activate leg below.)
const TASK_STEPS = [
    { op: 'declareClass', id: 'clsTask', typeId: 'task', name: 'Task' },
    { op: 'declareField', id: 'fldTitle', ownerClassId: 'clsTask', name: 'title' },
    { op: 'wireDeclaration', from: 'fldTitle', to: 'clsTask', role: 'declares' },
    { op: 'drop', item: 'construct', id: 'make' },
    { op: 'wireDeclaration', from: 'clsTask', to: 'make', role: 'binds' },
    { op: 'configure', id: 'make', values: { access: { grants: [{ roleId: 'fixture-role-operator', level: 'admin' }] } } },
    { op: 'setInputDefault', id: 'make', input: 'fields.title', value: 'Spec task' }
];

const LITERAL_STEPS = [
    { op: 'drop', item: 'literal', id: 'nameLit' },
    { op: 'configure', id: 'nameLit', values: { type: { base: 'string', nullable: false }, value: 'wired' } },
    { op: 'connect', id: 'nameLit', fromPort: 'data:value', to: 'make', toPort: 'data:fields.title' }
];

// A registry-typed construct — binds by declaration wire (the palette
// construct binds its type; configure never writes typeId), lane grant,
// default the identifier field.
const COMPOSE_STEPS = [
    { op: 'declareTypeRef', id: 'tapeRef', typeId: 'cassette' },
    { op: 'drop', item: 'construct', id: 'make' },
    { op: 'wireDeclaration', from: 'tapeRef', to: 'make', role: 'binds' },
    { op: 'configure', id: 'make', values: { access: { grants: [{ roleId: 'fixture-role-operator', level: 'admin' }] } } },
    { op: 'setInputDefault', id: 'make', input: 'fields.name', value: 'Spec cassette' }
];

beforeEach(() => {
    vi.clearAllMocks();
    processRepository.__store.rows.clear();
    organizationService.getProcessConfiguration.mockResolvedValue({
        roles: createPersistedAcceptanceFixture().organization.data.roles,
        roleAssignments: {}
    });
    getAppRegistry.mockReturnValue({
        getInstanceService: type => (type === 'organization' ? organizationService : null)
    });
});

const call = (name, args) => executeTool(name, args, AUTH);

describe('the compose → validate → activate loop over the tool catalog', () => {
    it('serves the authoring vocabulary with the guide, roles, and per-kind sockets', async () => {
        const compact = await call('get_authoring_vocabulary', {});
        expect(compact.guide).toMatch(/compose_process_definition/);
        expect(compact.guide).toMatch(/declaration tree/);
        expect(compact.guide).toMatch(/Five identity laws/);
        expect(compact.guide).toMatch(/ask_user/);
        expect(compact.guide).toMatch(/proposition gate/);
        expect(compact.guide).toMatch(/Mermaid/);
        expect(compact.guide).toMatch(/schedule:\{at:/);
        expect(compact.guide).toMatch(/eventId/);
        expect(compact.palette.length).toBeGreaterThan(0);
        expect(compact.roles).toEqual([{ id: 'role_admin', label: 'Admin' }]);

        const sockets = await call('get_authoring_vocabulary', { detail: 'sockets' });
        const literal = sockets.sockets['source.literalItem'];
        expect(literal.outputs.map(socket => socket.id)).toContain('value');

        // A wrong family id teaches instead of answering an empty inventory.
        await expect(call('get_authoring_vocabulary', { detail: 'sockets', family: 'operations' }))
            .rejects.toThrow(/families: sources, values/);
    });

    it('composes a definition through gestures and answers the digest, never the document', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec compose', steps: COMPOSE_STEPS });
        expect(digest.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'make', kind: 'cts.construct', typeId: 'cassette' })
        ]));
        expect(digest.counts.processNodes).toBe(1);
        expect(digest.status).toBe('DRAFT');

        const stored = authoredProcessDataFromGraphDocument(store().rows.get(digest.id).data);
        expect(stored.dataflowVersion).toBe(4);
        expect(JSON.stringify(digest).length).toBeLessThan(JSON.stringify(stored).length);
    });

    it('validates and activates the composed definition through the tools', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec compose', steps: COMPOSE_STEPS });

        const validation = await call('validate_process_definition', { definitionId: digest.id });
        expect(validation.ok).toBe(true);

        const activated = await call('activate_process_definition', { definitionId: digest.id });
        expect(activated.status).toBe('ACTIVE');

        const after = await call('get_process_definition', { definitionId: digest.id });
        expect(after.status).toBe('ACTIVE');
    });

    it('edits a stored draft with gestures — small payloads, no graph echo-back', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        const edited = await call('edit_process_definition', { definitionId: digest.id, steps: LITERAL_STEPS });
        expect(edited.edges).toContainEqual({ from: 'nameLit:value', to: 'make:fields.title' });
    });
});

describe('illegal wires never persist — the socket wall', () => {
    it('refuses a connect that names no sockets (the node-body wire)', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'drop', item: 'literal', id: 'nameLit' }, { op: 'connect', id: 'nameLit', to: 'make' }]
        })).rejects.toThrow(/fromPort is required|Unknown port/);
        const after = await call('get_process_definition', { definitionId: digest.id });
        expect(after.edges.filter(edge => !edge.declaration)).toEqual([]);
    });

    it('refuses a connect onto a socket the node does not carry, naming it', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'drop', item: 'literal', id: 'nameLit' }, { op: 'connect', id: 'nameLit', fromPort: 'data:nope', to: 'make', toPort: 'data:fields.title' }]
        })).rejects.toThrow(/Unknown port nameLit:data:nope/);
    });

    it('refuses control into a data socket', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [
                { op: 'drop', item: 'construct', id: 'make2' },
                { op: 'wireDeclaration', from: 'clsTask', to: 'make2', role: 'binds' },
                { op: 'connect', id: 'make', fromPort: 'control:completed', to: 'make2', toPort: 'data:fields.title' }
            ]
        })).rejects.toThrow(/control into a data socket/);
    });

    it('refuses a second wire on a single-value input and keeps the first edit intact', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        await call('edit_process_definition', { definitionId: digest.id, steps: LITERAL_STEPS });
        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [
                { op: 'drop', item: 'literal', id: 'nameLit2' },
                { op: 'connect', id: 'nameLit2', fromPort: 'data:value', to: 'make', toPort: 'data:fields.title' }
            ]
        })).rejects.toThrow(/accepts one wire/);
        const after = await call('get_process_definition', { definitionId: digest.id });
        expect(after.edges.filter(edge => edge.to === 'make:fields.title')).toHaveLength(1);
    });

    it('refuses a graph replacement whose data edges carry no socket handles', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        const full = await call('get_process_definition', { definitionId: digest.id, full: true });
        // Edge endpoints alone: a node-body wire. The save floor answers.
        const graph = {
            nodes: full.data.graph.nodes,
            edges: [{ id: 'guessed', source: 'make', target: 'make', sourceHandle: null, targetHandle: null }]
        };
        await expect(call('update_definition_graph', { definitionId: digest.id, graph })).rejects.toThrow(/without sockets/);
        const after = await call('get_process_definition', { definitionId: digest.id });
        expect(after.edges.filter(edge => !edge.declaration)).toEqual([]);
    });

    it('refuses agent shapes the designer cannot author', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        const full = await call('get_process_definition', { definitionId: digest.id, full: true });

        const faked = {
            nodes: full.data.graph.nodes,
            edges: [{ id: 'invented', source: 'make', target: 'make', sourceHandle: 'data:value', targetHandle: 'data:top' }]
        };
        await expect(call('update_definition_graph', { definitionId: digest.id, graph: faked })).rejects.toThrow(/addresses no/);

        const phantom = {
            nodes: [...full.data.graph.nodes, { id: 'ghost', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'ghost' } }],
            edges: full.data.graph.edges
        };
        await expect(call('update_definition_graph', { definitionId: digest.id, graph: phantom })).rejects.toThrow(/addresses no processNodes record/);

        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'configure', id: 'make', values: { access: { grants: [
                { roleId: 'role_admin', level: 'admin' },
                { roleId: 'fixture-role-operator', level: 'write' }
            ] } } }]
        })).rejects.toThrow(/one role grant/);

        const multi = JSON.parse(JSON.stringify(full.data));
        multi.processNodes.make.access = { grants: [
            { roleId: 'role_admin', level: 'admin' },
            { roleId: 'fixture-role-operator', level: 'write' }
        ] };
        await call('update_process_definition', { definitionId: digest.id, data: multi });
        const stored = authoredProcessDataFromGraphDocument(store().rows.get(digest.id).data);
        expect(stored.processNodes.make.access.grants).toEqual([{ roleId: 'role_admin', level: 'admin' }]);
    });

    it('restructures an existing definition through the removal grammar', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: [...TASK_STEPS, ...LITERAL_STEPS] });
        const wired = await call('get_process_definition', { definitionId: digest.id });
        expect(wired.edges).toContainEqual({ from: 'nameLit:value', to: 'make:fields.title' });

        const unwired = await call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'disconnect', id: 'nameLit', fromPort: 'data:value', to: 'make', toPort: 'data:fields.title' }]
        });
        expect(unwired.edges).not.toContainEqual({ from: 'nameLit:value', to: 'make:fields.title' });

        const trimmed = await call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'removeNode', id: 'nameLit' }]
        });
        expect(trimmed.nodes.some(node => node.id === 'nameLit')).toBe(false);
        expect(trimmed.counts.processNodes).toBe(1);

        const undeclared = await call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'unwireDeclaration', from: 'fldTitle', to: 'clsTask', role: 'declares' }]
        });
        expect(undeclared.edges.some(edge => edge.declaration === 'declares')).toBe(false);
        await expect(call('edit_process_definition', {
            definitionId: digest.id,
            steps: [{ op: 'disconnect', id: 'nameLit', fromPort: 'data:value', to: 'make', toPort: 'data:fields.title' }]
        })).rejects.toThrow(/composed nodes/);
    });

    it('keeps declaration edges legal — the tree wires node to node by design', async () => {
        const digest = await call('compose_process_definition', {
            name: 'Spec declarations',
            steps: [
                { op: 'declareClass', id: 'clsTask', typeId: 'task', name: 'Task' },
                { op: 'declareField', id: 'fldTitle', ownerClassId: 'clsTask', name: 'title' },
                { op: 'wireDeclaration', from: 'fldTitle', to: 'clsTask', role: 'declares' }
            ]
        });
        const full = await call('get_process_definition', { definitionId: digest.id, full: true });
        const declarationEdge = full.data.graph.edges.find(edge => edge.role === 'type');
        expect(declarationEdge.sourceHandle || null).toBeNull();

        const graph = { nodes: full.data.graph.nodes, edges: full.data.graph.edges };
        const replaced = await call('update_definition_graph', { definitionId: digest.id, graph });
        expect(replaced.counts.declarations).toBeGreaterThan(0);
    });

    it('refuses the same handle-less edge through the full-document save', async () => {
        const digest = await call('compose_process_definition', { name: 'Spec task', steps: TASK_STEPS });
        const full = await call('get_process_definition', { definitionId: digest.id, full: true });
        const data = {
            ...full.data,
            graph: {
                nodes: full.data.graph.nodes,
                edges: [{ id: 'guessed', source: 'make', target: 'make' }]
            }
        };
        await expect(call('update_process_definition', { definitionId: digest.id, data })).rejects.toThrow(/without sockets/);
    });
});

describe('the activation migration gate through the tools', () => {
    const seedMigrationScenario = () => {
        const fixture = createPersistedAcceptanceFixture();
        const typeId = fixture.processDefinition.data.producerOutputs['create_cassette:result'].typeId;
        const activeData = structuredClone(fixture.processDefinition.data);
        activeData.producerOutputs['create_cassette:result'].lifecycle = customLifecycle({
            draft: { canUpdateMeta: true }, LEGACY_RETIRED: {}
        });
        const draftData = structuredClone(fixture.processDefinition.data);
        draftData.producerOutputs['create_cassette:result'].lifecycle = customLifecycle({
            draft: { canUpdateMeta: true }, done: {}
        });
        store().seed({
            ...fixture.processDefinition,
            _id: 'def-active',
            lineage: { organizationId: 'org-acceptance' },
            data: activeData
        });
        store().seed({
            _id: 'def-draft',
            identity: { uid: 'def-draft', name: 'Next process', slug: 'next-process' },
            lineage: { organizationId: 'org-acceptance' },
            status: { state: 'DRAFT', userId: 'admin', timestamp: '2026-01-01T00:00:00.000Z', metadata: {}, eventId: null, lifecycle: { actors: [], attachments: {}, data: {} } },
            data: draftData
        });
        const stranded = [
            { _id: 'p-1', state: 'LEGACY_RETIRED' },
            { _id: 'p-2', state: 'LEGACY_RETIRED' }
        ];
        getAppRegistry.mockReturnValue({
            getInstanceService: type => (type === typeId
                ? { processList: vi.fn().mockResolvedValue(stranded) }
                : (type === 'organization' ? organizationService : null))
        });
        return typeId;
    };

    it('returns the gate as a structured activationBlocked result carrying the plan', async () => {
        const typeId = seedMigrationScenario();

        const blocked = await call('activate_process_definition', { definitionId: 'def-draft' });
        expect(blocked).toMatchObject({
            activationBlocked: true,
            gate: {
                migrationRequired: true,
                migrationPlan: {
                    statuses: [{
                        typeId,
                        removed: [{ state: 'LEGACY_RETIRED', count: 2 }],
                        targets: expect.arrayContaining(['draft', 'done'])
                    }]
                }
            }
        });
        expect(store().rows.get('def-draft').states?.main).not.toBe('ACTIVE');
    });

    it('accepts any declared mapping at declare time — the plan checks it at activation', async () => {
        const typeId = seedMigrationScenario();
        const declared = await call('declare_status_mappings', {
            definitionId: 'def-draft',
            mappings: [{ typeId, from: 'LEGACY_RETIRED', to: 'NOT_A_STATE' }]
        });
        expect(declared.declared).toEqual([{ typeId, from: 'LEGACY_RETIRED', to: 'NOT_A_STATE' }]);

        await expect(call('activate_process_definition', { definitionId: 'def-draft' }))
            .rejects.toThrow(/NOT_A_STATE is not a retained state/);
    });

    it('declares the mapping, re-activates, re-targets the stranded instances, and records the applied summary', async () => {
        const typeId = seedMigrationScenario();

        const declared = await call('declare_status_mappings', {
            definitionId: 'def-draft',
            mappings: [{ typeId, from: 'LEGACY_RETIRED', to: 'done' }]
        });
        expect(declared).toMatchObject({ definitionId: 'def-draft', declared: [{ typeId, from: 'LEGACY_RETIRED', to: 'done' }] });

        const activated = await call('activate_process_definition', { definitionId: 'def-draft' });
        expect(activated.status).toBe('ACTIVE');

        expect(stateService.setInitialStateForOrganization).toHaveBeenCalledTimes(2);
        expect(stateService.setInitialStateForOrganization).toHaveBeenCalledWith(
            typeId, 'p-1', 'done', 'org-acceptance', 'admin',
            expect.objectContaining({ note: 'Process apply migration', producerOutputId: expect.any(String) })
        );

        const stored = store().rows.get('def-draft');
        expect(stored.data.migrations.applied).toMatchObject({
            appliedAt: expect.any(String),
            applied: { [typeId]: { 'LEGACY_RETIRED->done': 2 } },
            failures: []
        });
    });
});

describe('control nodes: the palette control section in the compiled surface', () => {
    it('refuses a control-only graph — an operational node needs a trigger path', async () => {
        const digest = await call('compose_process_definition', {
            name: 'Spec flow only',
            steps: [{ op: 'drop', item: 'finish', id: 'stop' }]
        });
        const validation = await call('validate_process_definition', { definitionId: digest.id });
        expect(validation.ok).toBe(false);
        expect(validation.errors).toContain('Operational node stop is not reachable from a trigger');
    });

    it('compiles a reachable finish to no action or screen of its own', async () => {
        // The construct owns the compiled surface; the finish adds
        // nothing to it — no action, screen, or grant derives from a
        // control node.
        const digest = await call('compose_process_definition', {
            name: 'Spec construct and finish',
            steps: [
                ...COMPOSE_STEPS,
                { op: 'drop', item: 'finish', id: 'stop' },
                { op: 'connect', id: 'make', fromPort: 'control:completed', to: 'stop', toPort: 'control:in' }
            ]
        });
        const validation = await call('validate_process_definition', { definitionId: digest.id });
        expect(validation.ok).toBe(true);

        const activated = await call('activate_process_definition', { definitionId: digest.id });
        expect(activated.status).toBe('ACTIVE');

        const compiled = store().rows.get(digest.id).data.compiled;
        // The construct's grant generates the surfaces; the finish wired
        // after it contributes nothing — no action, screen, or key of its
        // own anywhere in the compiled contract.
        expect(JSON.stringify(Object.keys(compiled.actions || {}))).not.toMatch(/stop|finish/i);
        expect(JSON.stringify(Object.keys(compiled.screens || {}))).not.toMatch(/stop|finish/i);
    });
});

function customLifecycle(states) {
    return {
        mode: 'custom',
        workflow: {
            schemaVersion: 2,
            primaryRegion: 'main',
            regions: {
                main: {
                    label: 'Project lifecycle',
                    initial: Object.keys(states)[0],
                    states,
                    transitions: []
                }
            }
        }
    };
}
