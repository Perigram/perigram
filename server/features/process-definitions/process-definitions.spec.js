import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activate,
  effectTransitionContext,
  executeActiveProcessAction,
  executeProcessQuery,
  hasProcessDefinitionMembershipAccess,
  performDurableEffect,
  preview,
  resolveProcessGraphEntity,
  evaluateDefinitionDataflow,
  update,
  validate
} from './service.js';
import * as processRepository from './repository.js';
import * as ctsTypes from '../cts-types/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { stateService } from '~/server/core/machines/service.js';
import * as instanceRevisionsService from '~/server/features/instance-revisions/service.js';
import { PROCESS_DATAFLOW_VERSION } from '~/packages/processes/src/index.js';
import { createTypeRegistry, frameworkTypes } from '~/packages/cts/src/index.js';
import { cncTypePack } from '~/packages/cts/src/pack/cnc.js';
import { createPersistedAcceptanceFixture, PERSISTED_ACCEPTANCE_IDS } from '~/test-data/persisted-acceptance.js';

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
  const cts = await import('~/packages/cts/src/index.js');
  const pack = await import('~/packages/cts/src/pack/cnc.js');
  const domainPack = await import('../../../test-tools/facade-plugin.js');
  const registry = cts.createTypeRegistry({ id: 'spec-cts' });
  for (const declaration of [...cts.frameworkTypes, ...pack.cncTypePack, ...domainPack.facadeFileTypes]) {
    registry.defineType(declaration);
  }
  return { compileRegistryForOrganization: vi.fn(async () => registry) };
});
vi.mock('./repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  findActiveSetByOrganization: vi.fn(),
  create: vi.fn(),
  updateById: vi.fn(),
  removeById: vi.fn(),
}));

const runRepository = {
  createRun: vi.fn(async ({ run, definition }) => ({ runId: run.id, state: run, definition, revision: 0 })),
  saveRunState: vi.fn(async (_runId, state, revision) => ({ state, revision: revision + 1 })),
  findUnreceiptedInvocations: vi.fn(async () => [])
};

vi.mock('~/server/runtime/app-registry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAppRegistry: vi.fn()
}));

vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    stateService: { ...actual.stateService, transitionWithResult: vi.fn(), setInitialStateForOrganization: vi.fn() }
  };
});

vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));

vi.mock('~/server/features/instance-revisions/service.js', () => ({
  getById: vi.fn()
}));

describe('transition actor assignment context (SPEC §7)', () => {
  it('composes ownership actors from the actors value', () => {
    const context = effectTransitionContext({ id: 't1' }, { actors: [{ id: 'u-1' }, 'u-2'] });
    expect(context.lifecycle).toEqual({
      actors: [{ userId: 'u-1' }, { userId: 'u-2' }]
    });
  });

  it('omits the channel without actors', () => {
    const none = effectTransitionContext({ id: 't1' }, {});
    expect(none.lifecycle).toBeUndefined();
  });
});

describe('current process-definition service contract', () => {
  const organizationService = {
    getProcessConfiguration: vi.fn(),
    setActiveProcessDefinition: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processRepository.findActiveSetByOrganization.mockResolvedValue([]);
    organizationService.getProcessConfiguration.mockResolvedValue({
      roles: createPersistedAcceptanceFixture().organization.data.roles,
      roleAssignments: {}
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'organization' ? organizationService : null
    });
  });

  it('reads entities through registered process adapters with the complete auth context', async () => {
    const processGetById = vi.fn().mockResolvedValue({
      _id: 'library-1',
      lineage: { organizationId: 'org-1' }
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'material' ? { processGetById } : organizationService
    });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: { files: [{ level: 'read' }] }
    };

    await expect(resolveProcessGraphEntity('material', 'library-1', { auth }))
      .resolves.toMatchObject({ _id: 'library-1' });
    expect(processGetById).toHaveBeenCalledWith('library-1', auth);
  });

  it('does not treat membership role labels as process-definition grants', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      memberships: [{ organizationId: 'org-1', role: 'role_admin', permissions: {}, status: 'active' }]
    }, 'org-1', 'admin')).toBe(false);
  });

  it('denies manual Create execution when the action is absent from the compiled role assignment', async () => {
    const fixture = createPersistedAcceptanceFixture();
    processRepository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    processRepository.findActiveSetByOrganization.mockResolvedValue([fixture.processDefinition]);
    organizationService.getProcessConfiguration.mockResolvedValueOnce({
      roles: fixture.organization.data.roles,
      roleAssignments: {}
    });

    await expect(executeActiveProcessAction({ actionId: 'create_cassette' }, {
      userId: 'user-1',
      organizationId: 'org-acceptance',
      roleAssignments: { actions: [] }
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uses explicit stored organization grants for process-definition access', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      effectivePermissions: {},
      memberships: [{
        organizationId: 'org-1',
        permissions: { organizations: { level: 'write' } },
        status: 'active'
      }]
    }, 'org-1', 'read')).toBe(true);
  });

  it('rejects activation when the authored graph is not the current protocol', async () => {
    processRepository.findById.mockResolvedValue({
      _id: 'process-old',
      identity: { uid: 'process-old', name: 'Old process', slug: 'old-process' },
      lineage: { organizationId: 'org-acceptance' },
      status: { state: 'DRAFT' },
      data: { schemaVersion: 1, dataflowVersion: 2, graph: { nodes: [], edges: [] } }
    });

    await expect(activate('process-old', adminAuth())).rejects.toThrow('Process dataflow version 4 is required');
    expect(processRepository.updateById).not.toHaveBeenCalled();
  });

  it('validates a v5 draft bound to an org-authored type through the projected domain', async () => {
    // Regression: validate/activate lowered the graph against the legacy
    // CNC domain, so every cts.* node bound to an org type store entry
    // failed with `unknown type` even though save and compile accepted it.
    const cts = await import('~/packages/cts/src/index.js');
    const orgRegistry = cts.createTypeRegistry({ id: 'spec-cts-org' });
    orgRegistry.defineType({
      id: 'fixture-panel-9',
      class: 'file',
      fields: { name: { base: 'string' } },
      states: {
        main: {
          initial: 'draft',
          states: { draft: {}, archived: { terminal: true } }
        }
      }
    });
    vi.mocked(ctsTypes.compileRegistryForOrganization).mockResolvedValueOnce(orgRegistry);

    const roleId = PERSISTED_ACCEPTANCE_IDS.role;
    processRepository.findById.mockResolvedValue(draftRecord({
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: { nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }], edges: [] },
      roleGrants: {},
      producerOutputs: {
        'create:result': {
          id: 'create:result', producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
          typeId: 'fixture-panel-9', lifecycle: { mode: 'domainDefault' },
          fields: { read: ['name'], write: [], private: [] }
        }
      },
      actions: {}, services: {}, sockets: {}, screens: {},
      processNodes: {
        create: {
          id: 'create', kind: 'cts.construct', typeId: 'fixture-panel-9', via: 'genericCreate',
          producerOutputId: 'create:result', trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId, level: 'admin' }] }
        }
      }
    }));

    const validation = await validate('process-draft', adminAuth());
    expect(validation.ok).toBe(true);
    expect(validation.errors || []).toEqual([]);
  });

  it('saves a v5 draft with access rules on a still-unbound node; validate reports the binding diagnostic', async () => {
    // Save-time acceptance is binding-tolerant: access rules on a node whose
    // field binding is not finished must not make the draft unsavable — the
    // diagnostic belongs to validate/apply.
    const roleId = PERSISTED_ACCEPTANCE_IDS.role;
    const authored = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: { nodes: [{ id: 'f1', type: 'processNode', data: { refId: 'f1' } }], edges: [] },
      roleGrants: {},
      producerOutputs: {},
      actions: {}, services: {}, sockets: {}, screens: {},
      processNodes: {
        f1: {
          id: 'f1', kind: 'cts.field', typeId: 'facade', inputDefaults: { field: 'rogue' },
          access: { level: 'read', grants: [{ roleId, level: 'read' }] }
        }
      }
    };
    processRepository.findById.mockResolvedValue(draftRecord(structuredClone(authored)));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const saved = await update('process-draft', { data: authored }, adminAuth());
    expect(saved.data.processNodes.f1.access.grants).toEqual([{ roleId, level: 'read' }]);

    // The binding diagnostic still surfaces at the validate boundary.
    await expect(validate('process-draft', adminAuth()))
      .rejects.toMatchObject({ message: expect.stringMatching(/not in the facade row/) });
  });

  it('persists structurally serializable drafts without compiling them', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    processRepository.findById.mockResolvedValue(draftRecord(authored));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const result = await update('process-draft', { data: authored }, adminAuth());

    expect(processRepository.updateById.mock.calls[0][1].data).toEqual({ ...authored, compiled: null });
    expect(result.data.graph).toEqual(authored.graph);
  });

  it('migrates a persisted entity-producing node before save and activation', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    const node = authored.processNodes.create_cassette;
    const profile = authored.producerOutputs[node.producerOutputId];
    delete authored.producerOutputs[node.producerOutputId];
    delete node.producerOutputId;
    authored.entityProfiles = { project: { ...profile, id: 'project' } };
    delete authored.entityProfiles.project.producerOutputId;
    delete authored.entityProfiles.project.nodeId;
    delete authored.entityProfiles.project.outputSocketId;
    processRepository.findById.mockResolvedValue(draftRecord(authored));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const saved = await update('process-draft', { data: authored }, adminAuth());
    const producerOutputId = 'create_cassette:result';
    expect(saved.data.processNodes.create_cassette.producerOutputId).toBe(producerOutputId);
    expect(saved.data.producerOutputs[producerOutputId]).toMatchObject({
      producerOutputId,
      nodeId: 'create_cassette',
      outputSocketId: 'result',
      typeId: 'cassette'
    });
    expect(saved.data).not.toHaveProperty('entityProfiles');

    processRepository.findById.mockResolvedValue(draftRecord(saved.data));
    await expect(validate('process-draft', adminAuth())).resolves.toMatchObject({ ok: true });
    await expect(activate('process-draft', adminAuth())).resolves.toMatchObject({
      states: { main: 'ACTIVE' }
    });
  });

  it('reports the semantic apply diff and requires a migration decision for removed workflow states', async () => {
    const fixture = createPersistedAcceptanceFixture();
    const typeId = fixture.processDefinition.data.producerOutputs['create_cassette:result'].typeId;
    const activeData = structuredClone(fixture.processDefinition.data);
    activeData.producerOutputs['create_cassette:result'].lifecycle = {
      mode: 'custom',
      workflow: {
        schemaVersion: 2,
        primaryRegion: 'main',
        regions: {
          main: {
            label: 'Cassette lifecycle',
            initial: 'ACTIVE',
            states: { ACTIVE: { canUpdateMeta: true }, LEGACY_RETIRED: {} },
            transitions: []
          }
        }
      }
    };
    processRepository.findActiveByOrganization.mockResolvedValue({
      ...fixture.processDefinition,
      _id: 'process-active',
      data: activeData
    });
      processRepository.findActiveSetByOrganization.mockResolvedValue([{
        ...fixture.processDefinition,
        _id: 'process-active',
        data: activeData
      }]);
    processRepository.findById.mockResolvedValue(draftRecord(fixture.processDefinition.data));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));
    const processList = vi.fn().mockResolvedValue([{ states: { main: 'LEGACY_RETIRED' } }]);
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === typeId ? { processList } : organizationService
    });

    const validation = await validate('process-draft', adminAuth());
    expect(validation.ok).toBe(true);
    expect(validation.diff.removedInstanceStatees).toEqual([{ typeId, statuses: ['LEGACY_RETIRED'] }]);

    await expect(activate('process-draft', adminAuth())).rejects.toMatchObject({
      statusCode: 409,
      data: {
        migrationRequired: true,
        migrationPlan: {
          statuses: [expect.objectContaining({ typeId, removed: [{ state: 'LEGACY_RETIRED', count: 1 }] })]
        }
      }
    });
    expect(processList).toHaveBeenCalledWith({}, expect.objectContaining({ organizationId: 'org-acceptance' }));
    expect(processRepository.updateById).not.toHaveBeenCalledWith('process-active', expect.anything());
  });

  it('maps construction inputs onto the wire paths the §3 boundary reads', async () => {
    // The retired hardcoded Name input is gone from contracts; the seam
    // rewrite (rewriteRetiredNameInputs) drops it from persisted records
    // before anything executes. What remains maps by its own path.
    const { processConstructionInputRecord } = await import('./service.js');
    const record = {
      construction: {
        inputs: [
          { id: 'lineage.parentId', path: 'lineage.parentId', type: 'entity' },
          { id: 'fields.note', path: 'fields.note', type: 'string' }
        ]
      }
    };
    const draft = processConstructionInputRecord(record, {
      'lineage.parentId': { type: 'parent', id: 'p-1' },
      'fields.note': 'hello'
    });
    expect(draft).toEqual({
      lineage: { parentId: 'p-1' },
      fields: { note: 'hello' }
    });
  });

  it('derives the effect construction inputs from the live domain contract', async () => {
    // A record authored against a domain that lacked the declared types
    // stamps a stale (often empty) construction.inputs copy, while the
    // ports and the compiled prompt contract speak the live domain —
    // the draft mapping reads the same derived list, so a prompted value
    // that arrived through a contract port is never dropped. Authored
    // entries keep merging over their contract twins.
    const { processConstructionInputRecord } = await import('./service.js');
    const domain = {
      construction: {
        widget: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'lineage.binId', path: 'lineage.binId', type: 'entity' },
            { id: 'fields.name', path: 'fields.name', type: 'string', required: true },
            { id: 'fields.width', path: 'fields.width', type: 'number' }
          ]
        }
      }
    };
    const staleRecord = {
      typeId: 'widget',
      construction: { mode: 'genericCreate', inputs: [] }
    };
    expect(processConstructionInputRecord(staleRecord, { 'fields.name': 'Probe' }, domain))
      .toEqual({ fields: { name: 'Probe' } });
    const authoredRecord = {
      typeId: 'widget',
      construction: {
        mode: 'genericCreate',
        inputs: [{ id: 'fields.width', path: 'fields.width', type: 'number', default: 12 }]
      }
    };
    expect(processConstructionInputRecord(authoredRecord, { 'fields.name': 'Probe' }, domain))
      .toEqual({ fields: { name: 'Probe', width: 12 } });
    // No domain contract: the record's own list stays the whole truth.
    expect(processConstructionInputRecord(staleRecord, { 'fields.name': 'Probe' }, {}))
      .toEqual({});
  });

  it('accepts the manifest action record shape in the availability check', async () => {    // Regression: the assignment manifest carries full records keyed `id`
    // while the check matched only `actionId` — every manual action 403'd.
    const { executeActiveProcessAction } = await import('./service.js');
    // Shaped like event.context.auth after resolveProcessAuth.
    const auth = { userId: 'user-1', organizationId: 'org-acceptance', roleAssignments: { actions: [{ id: 'act-1' }] } };
    try {
      await executeActiveProcessAction({ actionId: 'act-1', data: {} }, auth);
    } catch (error) {
      expect(error.statusCode).not.toBe(403);
    }
  });

  it('activates when removed workflow states have no live entities', async () => {
    const fixture = createPersistedAcceptanceFixture();
    const typeId = fixture.processDefinition.data.producerOutputs['create_cassette:result'].typeId;
    const activeData = structuredClone(fixture.processDefinition.data);
    activeData.producerOutputs['create_cassette:result'].lifecycle = {
      mode: 'custom',
      workflow: {
        schemaVersion: 2,
        primaryRegion: 'main',
        regions: {
          main: {
            label: 'Project lifecycle',
            initial: 'ACTIVE',
            states: { ACTIVE: { canUpdateMeta: true }, LEGACY_RETIRED: {} },
            transitions: []
          }
        }
      }
    };
    processRepository.findActiveByOrganization.mockResolvedValue({
      ...fixture.processDefinition,
      _id: 'process-active',
      data: activeData
    });
      processRepository.findActiveSetByOrganization.mockResolvedValue([{
        ...fixture.processDefinition,
        _id: 'process-active',
        data: activeData
      }]);
    processRepository.findById.mockResolvedValue(draftRecord(fixture.processDefinition.data));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === typeId
        ? { processList: vi.fn().mockResolvedValue([{ states: { main: 'ACTIVE' } }]) }
        : organizationService
    });

    await expect(activate('process-draft', adminAuth())).resolves.toMatchObject({
      states: { main: 'ACTIVE' }
    });
    // Additive activation: the previous active definition stays ACTIVE.
    expect(processRepository.updateById).not.toHaveBeenCalledWith('process-active', expect.anything());
  });

  it('returns the migration plan on validate and keeps the 409 without mappings', async () => {
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
    processRepository.findActiveByOrganization.mockResolvedValue({
      ...fixture.processDefinition,
      _id: 'process-active',
      data: activeData
    });
      processRepository.findActiveSetByOrganization.mockResolvedValue([{
        ...fixture.processDefinition,
        _id: 'process-active',
        data: activeData
      }]);
    processRepository.findById.mockResolvedValue(draftRecord(draftData));
    const strandedEntities = [
      { _id: 'p-1', states: { main: 'LEGACY_RETIRED' } },
      { _id: 'p-2', states: { main: 'LEGACY_RETIRED' } }
    ];
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === typeId
        ? { processList: vi.fn().mockResolvedValue(strandedEntities) }
        : organizationService
    });

    const validation = await validate('process-draft', adminAuth());
    expect(validation.ok).toBe(true);
    expect(validation.migrationPlan).toEqual({
      statuses: [expect.objectContaining({
        typeId,
        removed: [{ state: 'LEGACY_RETIRED', count: 2 }],
        targets: expect.arrayContaining(['draft', 'done'])
      })]
    });

    await expect(activate('process-draft', adminAuth())).rejects.toMatchObject({
      statusCode: 409,
      data: {
        migrationRequired: true,
        migrationPlan: { statuses: [expect.any(Object)] }
      }
    });
    expect(processRepository.updateById).not.toHaveBeenCalledWith('process-active', expect.anything());
  });

  it('rejects declared migration mappings outside the next contract states', async () => {
    const fixture = createPersistedAcceptanceFixture();
    const typeId = fixture.processDefinition.data.producerOutputs['create_cassette:result'].typeId;
    const activeData = structuredClone(fixture.processDefinition.data);
    activeData.producerOutputs['create_cassette:result'].lifecycle = customLifecycle({
      draft: {}, LEGACY_RETIRED: {}
    });
    const draftData = structuredClone(fixture.processDefinition.data);
    draftData.producerOutputs['create_cassette:result'].lifecycle = customLifecycle({ draft: {}, done: {} });
    draftData.migrations = { statuses: [{ typeId, from: 'LEGACY_RETIRED', to: 'NOT_A_STATE' }] };
    processRepository.findActiveByOrganization.mockResolvedValue({
      ...fixture.processDefinition,
      _id: 'process-active',
      data: activeData
    });
      processRepository.findActiveSetByOrganization.mockResolvedValue([{
        ...fixture.processDefinition,
        _id: 'process-active',
        data: activeData
      }]);
    processRepository.findById.mockResolvedValue(draftRecord(draftData));
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === typeId
        ? { processList: vi.fn().mockResolvedValue([{ _id: 'p-1', states: { main: 'LEGACY_RETIRED' } }]) }
        : organizationService
    });

    await expect(activate('process-draft', adminAuth())).rejects.toMatchObject({
      statusCode: 400,
      data: { migrationPlan: { statuses: expect.any(Array) } }
    });
    expect(processRepository.updateById).not.toHaveBeenCalledWith('process-active', expect.anything());
  });

  it('activates with declared migrations, re-targets stranded instances, and records the applied summary', async () => {
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
    draftData.migrations = { statuses: [{ typeId, from: 'LEGACY_RETIRED', to: 'draft' }] };
    processRepository.findActiveByOrganization.mockResolvedValue({
      ...fixture.processDefinition,
      _id: 'process-active',
      data: activeData
    });
      processRepository.findActiveSetByOrganization.mockResolvedValue([{
        ...fixture.processDefinition,
        _id: 'process-active',
        data: activeData
      }]);
    processRepository.findById.mockResolvedValue(draftRecord(draftData));
    // Faithful storage round-trip: the wire shape (`states`) plus the status
    // block a re-parsed model needs — production storage must preserve both
    // (see repository updateById).
    processRepository.updateById.mockImplementation(async (id, process) => ({
      ...process.toJSON(),
      status: process.status ? process.status.toJSON() : null,
      origin: process.origin ? process.origin.toJSON() : null,
      _id: id
    }));
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === typeId
        ? { processList: vi.fn().mockResolvedValue([
            { _id: 'p-1', state: 'LEGACY_RETIRED' },
            { _id: 'p-2', state: 'draft' }
          ]) }
        : organizationService
    });
    stateService.setInitialStateForOrganization.mockResolvedValue({ state: { primary: 'draft' } });

    const result = await activate('process-draft', adminAuth());

    expect(result.states.main).toBe('ACTIVE');
    expect(stateService.setInitialStateForOrganization).toHaveBeenCalledWith(
      typeId, 'p-1', 'draft', 'org-acceptance', 'admin', expect.objectContaining({ producerOutputId: 'create_cassette:result' })
    );
    expect(result.data.migrations).toEqual(expect.objectContaining({
      statuses: [{ typeId, from: 'LEGACY_RETIRED', to: 'draft' }],
      applied: expect.objectContaining({
        actor: 'admin',
        applied: { [typeId]: { 'LEGACY_RETIRED->draft': 1 } },
        failures: []
      })
    }));
    // Additive activation: no organization pointer is written — the active
    // set is queried from the definitions collection.
    expect(organizationService.setActiveProcessDefinition).not.toHaveBeenCalled();
  });

  it('renames without touching data (identity-only PATCH keeps the graph)', async () => {
    const fixture = createPersistedAcceptanceFixture();
    processRepository.findById.mockResolvedValue(draftRecord(fixture.processDefinition.data));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const updated = await update('process-draft', { name: 'Renamed process' }, adminAuth());

    expect(updated.identity.name).toBe('Renamed process');
    const persisted = processRepository.updateById.mock.calls[0][1].toJSON();
    expect(persisted.data.dataflowVersion).toBe(fixture.processDefinition.data.dataflowVersion);
    expect(Object.keys(persisted.data.processNodes)).toEqual(Object.keys(fixture.processDefinition.data.processNodes));
  });

  it('records the superseded graph in history on re-activation', async () => {
    const fixture = createPersistedAcceptanceFixture();
    const activeRecord = {
      ...draftRecord(fixture.processDefinition.data),
      _id: 'process-draft',
      status: { ...draftRecord(fixture.processDefinition.data).status, state: 'ACTIVE' }
    };
    processRepository.findById.mockResolvedValue(activeRecord);
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));
    processRepository.findActiveSetByOrganization.mockResolvedValue([activeRecord]);

    await activate('process-draft', adminAuth());

    const persisted = processRepository.updateById.mock.calls[0][1].toJSON();
    expect(Array.isArray(persisted.data.history)).toBe(true);
    expect(persisted.data.history).toHaveLength(1);
    expect(persisted.data.history[0].data.processNodes).toEqual(fixture.processDefinition.data.processNodes);
  });

  it('rejects ambiguous persisted producer sockets at the save boundary', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    const node = authored.processNodes.create_cassette;
    delete authored.producerOutputs[node.producerOutputId];
    delete node.producerOutputId;
    node.outputs = [
      { id: 'result', type: { base: 'entity', typeId: 'cassette' } },
      { id: 'alternate', type: { base: 'entity', typeId: 'cassette' } }
    ];
    processRepository.findById.mockResolvedValue(draftRecord(authored));

    await expect(update('process-draft', { data: authored }, adminAuth())).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(
        'Process node create_cassette requires one cassette producer output; candidates: create_cassette:alternate (cassette), create_cassette:result (cassette)'
      )
    });
    expect(processRepository.updateById).not.toHaveBeenCalled();
  });

  it('activates a valid current fixture and records it through the organization service boundary', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    processRepository.findById.mockResolvedValue(draftRecord(authored));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const result = await activate('process-draft', adminAuth());

    expect(result.states.main).toBe('ACTIVE');
    // The compiled machine is graph-derived (SPEC §7): the fixture's state
    // records seed the vocabulary, the construct's state default is the
    // initial, and transitions come from transition nodes (none here).
    const region = result.data.compiled.producerOutputs['create_cassette:result'].workflow.regions.main;
    expect(region.initial).toBe('ACTIVE');
    expect(Object.keys(region.states).sort()).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(region.states.ARCHIVED.isTerminal).toBe(true);
    expect(region.transitions).toEqual([]);
    // Additive activation: no organization pointer is written — the active
    // set is queried from the definitions collection.
    expect(organizationService.setActiveProcessDefinition).not.toHaveBeenCalled();
  });

  it('round-trips the missing-field tag and present null through the preview response', async () => {
    const result = await preview({ definition: { data: previewProcessData() } }, adminAuth());

    expect(result.nodes.present.outputs.value.branches[0].items).toEqual([null]);
    expect(result.nodes.absent.outputs.value.branches[0].items).toEqual([
      { missing: true, path: 'fields.design' }
    ]);
    // The response is already the JSON contract: no undefined property or
    // array item degrades to null on the wire.
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });

  it('persists a deconstruct -> modify block -> update entity read-modify-write chain through processUpdate with list and tree field inputs', async () => {
    const machine = {
      type: 'machine',
      id: 'machine-1',
      _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: { label: 'Router', reference: { code: 'M-00', location: 'Hall B' } },
      attachments: {},
      states: { main: 'ACTIVE' }
    };
    const processUpdate = vi.fn(async (id, patch) => {
      const persisted = structuredClone(machine);
      for (const [path, value] of Object.entries(patch)) {
        setByPath(persisted, path, value);
      }
      return persisted;
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate }
        : type === 'organization' ? organizationService : null
    });
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findById.mockResolvedValue(draftRecord(readModifyWriteProcessData()));

    const run = await evaluateDefinitionDataflow('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: machine }
    }, adminAuth(), { runRepository });
    restoreMachineRegistry();

    expect(run.status).toBe('succeeded');
    expect(processUpdate).toHaveBeenCalledTimes(1);
    expect(processUpdate).toHaveBeenCalledWith(
      'machine-1',
      expect.objectContaining({
        'data.label': 'Renamed machine',
        'data.reference': { code: 'M-01', location: 'Hall A' }
      }),
      expect.objectContaining({ userId: 'admin', organizationId: 'org-acceptance' })
    );
    const persisted = await processUpdate.mock.results[0].value;
    expect(persisted.data.label).toBe('Renamed machine');
    expect(persisted.identity.name).toBe('CNC Router');
    expect(persisted.identity.slug).toBe('cnc-router');
    expect(persisted.data.reference).toEqual({ code: 'M-01', location: 'Hall A' });
  });

  it('chains a manual field mutate into an event-triggered transition with the entity carried through', async () => {
    // Regression probe: a manually triggered mutate whose event edge fires
    // a cts.transition must hand the entity to the transition — from the
    // run-context entity when the wire has no upstream value, not "requires
    // an entity reference".
    const machine = {
      type: 'machine',
      id: 'machine-1',
      _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: { label: 'Router' },
      attachments: {},
      states: { main: 'ACTIVE' }
    };
    const processUpdate = vi.fn(async (id, patch) => {
      const persisted = structuredClone(machine);
      for (const [path, value] of Object.entries(patch)) setByPath(persisted, path, value);
      return persisted;
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate }
        : type === 'organization' ? organizationService : null
    });
    stateService.transitionWithResult.mockImplementation(async ({ targetState }) => {
      const updated = structuredClone(machine);
      updated.states = { main: targetState };
      return { entity: updated, status: { state: { primary: targetState } }, actions: [], effects: [] };
    });
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'machine', value: 'ACTIVE' },
        s2: { id: 's2', kind: 'state', typeId: 'machine', value: 'MAINTENANCE', terminal: true }
      },
      graph: {
        nodes: ['update', 'transition'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'update-transition', source: 'update', sourceHandle: 'data:result', target: 'transition', targetHandle: 'data:entity', role: 'data' },
          { id: 'update-transition-flow', source: 'update', sourceHandle: 'control:completed', target: 'transition', targetHandle: 'control:in', role: 'control' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        update: {
          id: 'update', kind: 'cts.mutate', typeId: 'machine',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { 'data.label': 'Renamed machine' }
        },
        transition: {
          id: 'transition', kind: 'cts.transition', typeId: 'machine',
          state: { axis: 'main', to: 'MAINTENANCE' },
          trigger: { mode: 'event' }, access: { level: 'write', grants: [] }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findById.mockResolvedValue(draftRecord(data));

    const run = await evaluateDefinitionDataflow('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: 'machine-1' }
    }, adminAuth(), { runRepository });
    restoreMachineRegistry();

    expect(run.status).toBe('succeeded');
    expect(processUpdate).toHaveBeenCalledWith(
      'machine-1',
      { 'data.label': 'Renamed machine' },
      expect.anything()
    );
    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'machine',
      targetId: 'machine-1',
      targetState: 'MAINTENANCE'
    }));
  });

  it('executes an authored target-only transition end to end: activate, button, fan-out machine', async () => {
    // The full chain the designer drives: a cts.transition record authors
    // ONLY its target, activation compiles the machine (entry from the
    // construct default, edges fanned from every declared value), and the
    // generated button executes the transition for the opened instance.
    const machine = {
      type: 'machine', id: 'machine-1', _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: {}, attachments: {}, states: { main: 'state1' }
    };
    const processUpdate = vi.fn();
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate, processGetById: async () => machine }
        : type === 'organization' ? organizationService : null
    });
    stateService.transitionWithResult.mockImplementation(async ({ targetState }) => {
      const updated = structuredClone(machine);
      updated.states = { main: targetState };
      return { entity: updated, status: { state: { primary: targetState } }, actions: [], effects: [] };
    });
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'machine', value: 'state1' },
        s2: { id: 's2', kind: 'state', typeId: 'machine', value: 'state2' }
      },
      graph: {
        nodes: ['create', 'transition'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'create-transition', source: 'create', sourceHandle: 'data:result', target: 'transition', targetHandle: 'data:entity', role: 'data' },
          { id: 'create-transition-flow', source: 'create', sourceHandle: 'control:completed', target: 'transition', targetHandle: 'control:in', role: 'control' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        create: {
          id: 'create', kind: 'cts.construct', typeId: 'machine',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          construction: { mode: 'genericCreate' },
          inputDefaults: { state: 'state1' }
        },
        transition: {
          id: 'transition', kind: 'cts.transition', typeId: 'machine',
          state: { axis: 'main', to: 'state2' },
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findActiveByOrganization.mockResolvedValue(draftRecord(data));
    processRepository.findById.mockResolvedValue(draftRecord(data));
    organizationService.getProcessConfiguration.mockResolvedValueOnce({ roles: [], roleAssignments: {} });

    const auth = {
      userId: 'admin', organizationId: 'org-acceptance',
      roleAssignments: { actions: [{ id: 'transition' }] }
    };
    const result = await executeActiveProcessAction({
      actionId: 'transition',
      instanceId: 'machine-1',
      data: {}
    }, { ...auth, effectivePermissions: { organizations: { level: 'admin' } } });
    restoreMachineRegistry();

    expect(result).toMatchObject({ _id: 'machine-1', states: { main: 'state2' } });
    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'machine', targetId: 'machine-1', targetState: 'state2'
    }));
  });

  it('executes a legacy transition whose target lives in inputDefaults.state (persisted authoring shape)', async () => {
    // Regression against a live draft: the target was authored as the
    // status socket's default (inputDefaults.state), which validation
    // accepts — activation compiled — but the runtime boundary read only
    // state.to and threw 'declares no target state'.
    const machine = {
      type: 'machine', id: 'machine-1', _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: {}, attachments: {}, states: { main: 'state1' }
    };
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate: vi.fn(), processGetById: async () => machine }
        : type === 'organization' ? organizationService : null
    });
    stateService.transitionWithResult.mockImplementation(async ({ targetState }) => {
      const updated = structuredClone(machine);
      updated.states = { main: targetState };
      return { entity: updated, status: { state: { primary: targetState } }, actions: [], effects: [] };
    });
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: { s1: { id: 's1', kind: 'state', value: 'new' } },
      graph: {
        nodes: [{ id: 'transition', type: 'processNode', data: { refId: 'transition' } }],
        edges: []
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        transition: {
          id: 'transition', kind: 'cts.transition', typeId: 'machine',
          inputDefaults: { state: 'new' },
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findActiveByOrganization.mockResolvedValue(draftRecord(data));
    processRepository.findById.mockResolvedValue(draftRecord(data));
    organizationService.getProcessConfiguration.mockResolvedValueOnce({ roles: [], roleAssignments: {} });

    const result = await executeActiveProcessAction({
      actionId: 'transition',
      instanceId: 'machine-1',
      data: {}
    }, {
      userId: 'admin', organizationId: 'org-acceptance',
      roleAssignments: { actions: [{ id: 'transition' }] },
      effectivePermissions: { organizations: { level: 'admin' } }
    });
    restoreMachineRegistry();

    expect(result).toMatchObject({ _id: 'machine-1', states: { main: 'new' } });
  });

  it('passes the children-read lineage filter through to the process list', async () => {
    const processList = vi.fn(async () => []);
    await executeProcessQuery(processList, { queueId: 'q-1' }, { userId: 'u' });
    expect(processList).toHaveBeenCalledWith({ queueId: 'q-1' }, { userId: 'u' });
  });

  it('binds the manual transport instance to the trigger effect through the typed map', async () => {
    // The orchestration seam spreads environment.data as an object per
    // evaluated node; a function-valued data environment silently dropped
    // every read seam (currentEntity, childEntities, projectEntity).
    const machine = {
      type: 'machine', id: 'machine-1', _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: {}, attachments: {}, states: { main: 'state1' }
    };
    const processGetById = vi.fn(async () => machine);
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate: vi.fn(), processGetById }
        : type === 'organization' ? organizationService : null
    });
    stateService.transitionWithResult.mockImplementation(async ({ targetState }) => {
      const updated = structuredClone(machine);
      updated.states = { main: targetState };
      return { entity: updated, status: { state: { primary: targetState } }, actions: [], effects: [] };
    });
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'machine', value: 'state1' },
        s2: { id: 's2', kind: 'state', typeId: 'machine', value: 'state2' }
      },
      graph: {
        nodes: ['ctx', 'transition'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'ctx-transition', source: 'ctx', sourceHandle: 'data:result', target: 'transition', targetHandle: 'data:entity', role: 'data' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        ctx: { id: 'ctx', kind: 'cts.read', typeId: 'machine', select: 'current' },
        transition: {
          id: 'transition', kind: 'cts.transition', typeId: 'machine',
          state: { axis: 'main', to: 'state2' },
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findActiveByOrganization.mockResolvedValue(draftRecord(data));
    processRepository.findById.mockResolvedValue(draftRecord(data));
    organizationService.getProcessConfiguration.mockResolvedValueOnce({ roles: [], roleAssignments: {} });

    const result = await executeActiveProcessAction({
      actionId: 'transition',
      instanceId: 'machine-1',
      data: {}
    }, {
      userId: 'admin', organizationId: 'org-acceptance',
      roleAssignments: { actions: [{ id: 'transition' }] },
      effectivePermissions: { organizations: { level: 'admin' } }
    });
    restoreMachineRegistry();

    expect(result).toMatchObject({ _id: 'machine-1', states: { main: 'state2' } });
  });

  it('surfaces a failed mutation slot as the manual action error instead of a silent success', async () => {
    // Regression: the mutation mapper collects per-slot failures and keeps
    // the run 'succeeded', so a rejected transition (invalid from-state,
    // missing machine, denied access) returned a failure envelope that the
    // action endpoint passed through — the client toasted success while the
    // state never changed.
    const machine = {
      type: 'machine',
      id: 'machine-1',
      _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: { label: 'Router' },
      attachments: {},
      states: { main: 'ACTIVE' }
    };
    const processUpdate = vi.fn(async (id, patch) => ({ ...machine, data: { ...machine.data, ...patch } }));
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate }
        : type === 'organization' ? organizationService : null
    });
    stateService.transitionWithResult.mockRejectedValueOnce(
      new Error('Transition MAINTENANCE is not valid from state ACTIVE')
    );
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'machine', value: 'ACTIVE' },
        s2: { id: 's2', kind: 'state', typeId: 'machine', value: 'MAINTENANCE', terminal: true }
      },
      graph: {
        nodes: [{ id: 'update', type: 'processNode', data: { refId: 'update' } }],
        edges: []
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        update: {
          id: 'update', kind: 'cts.mutate', typeId: 'machine',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { 'data.label': 'Renamed machine', state: 'MAINTENANCE' }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findById.mockResolvedValue(draftRecord(data));

    await expect(evaluateDefinitionDataflow('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: machine }
    }, adminAuth(), { runRepository })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Transition MAINTENANCE is not valid from state ACTIVE'
    });
    restoreMachineRegistry();
    expect(processUpdate).not.toHaveBeenCalled();
  });

  it('applies a mutate field patch and a chained transition state as separate operations', async () => {
    const machine = {
      type: 'machine',
      id: 'machine-1',
      _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: { label: 'Router', reference: { code: 'M-00', location: 'Hall B' } },
      attachments: {},
      states: { main: 'ACTIVE' }
    };
    const processUpdate = vi.fn(async (id, patch) => {
      const persisted = structuredClone(machine);
      for (const [path, value] of Object.entries(patch)) {
        setByPath(persisted, path, value);
      }
      return persisted;
    });
    stateService.transitionWithResult.mockImplementation(async ({ targetState }) => {
      const updated = structuredClone(machine);
      updated.states = { main: targetState };
      return { entity: updated, status: { state: { primary: targetState } }, actions: [], effects: [] };
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'machine'
        ? { processUpdate }
        : type === 'organization' ? organizationService : null
    });
    const data = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graphProtocol: 5,
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'machine', value: 'ACTIVE' },
        s2: { id: 's2', kind: 'state', typeId: 'machine', value: 'MAINTENANCE', terminal: true }
      },
      graph: {
        nodes: ['update', 'transition'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'update-transition', source: 'update', sourceHandle: 'data:result', target: 'transition', targetHandle: 'data:entity', role: 'data' },
          { id: 'update-transition-flow', source: 'update', sourceHandle: 'control:completed', target: 'transition', targetHandle: 'control:in', role: 'control' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        update: {
          id: 'update', kind: 'cts.mutate', typeId: 'machine',
          trigger: { mode: 'manual' }, access: { level: 'write', grants: [] },
          inputDefaults: { 'data.label': 'Renamed machine', 'data.reference': { code: 'M-01', location: 'Hall A' } }
        },
        transition: {
          id: 'transition', kind: 'cts.transition', typeId: 'machine',
          state: { axis: 'main', to: 'MAINTENANCE' },
          trigger: { mode: 'event' }, access: { level: 'write', grants: [] }
        }
      }
    };
    const restoreMachineRegistry = mockMachineRegistry();
    processRepository.findById.mockResolvedValue(draftRecord(data));

    const run = await evaluateDefinitionDataflow('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: machine }
    }, adminAuth(), { runRepository });
    restoreMachineRegistry();

    expect(run.status).toBe('succeeded');
    // The field patch and the declared state are separate operations: the
    // mutate persists fields only, the transition owns the state.
    expect(processUpdate).toHaveBeenCalledWith(
      'machine-1',
      expect.objectContaining({
        'data.label': 'Renamed machine',
        'data.reference': { code: 'M-01', location: 'Hall A' }
      }),
      expect.anything()
    );
    expect(stateService.transitionWithResult).toHaveBeenCalledTimes(1);
    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      typeId: 'machine',
      targetId: 'machine-1',
      targetState: 'MAINTENANCE'
    }));
    const transitionStep = run.steps.find(step => step.nodeId === 'transition')?.output;
    expect(transitionStep).toMatchObject({
      _id: 'machine-1',
      states: { main: 'MAINTENANCE' }
    });
    expect(transitionStep).not.toHaveProperty('actions');
    expect(transitionStep).not.toHaveProperty('effects');
  });

  it('applies the authored initial primary state while retaining all workflow region initials', async () => {
    const created = { _id: 'queue-1', type: 'queue', identity: { name: 'Queue' } };
    const initialStatus = { state: { primary: 'READY', active: { main: 'READY', fulfillment: 'UNASSIGNED' } } };
    const create = vi.fn().mockResolvedValue(created);
    stateService.setInitialStateForOrganization.mockResolvedValue(initialStatus);
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'queue'
        ? { constructionHandlers: { genericCreate: create } }
        : organizationService
    });

    const result = await performDurableEffect({
      kind: 'effect.createEntity',
      record: {
        kind: 'effect.createEntity',
        id: 'create',
        typeId: 'queue',
        producerOutputId: 'create:result',
        construction: { mode: 'genericCreate' },
        blocks: []
      },
      inputs: { 'states.main': 'READY' }
    }, adminAuth());

    expect(stateService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'queue', 'queue-1', 'READY', 'org-acceptance', 'admin', expect.objectContaining({ producerOutputId: 'create:result' })
    );
    expect(result.status).toEqual(initialStatus);
    expect(result.status.state.active.fulfillment).toBe('UNASSIGNED');
  });

  it('executes independent initial statuses for two same-type producers', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ _id: 'project-a', type: 'project' })
      .mockResolvedValueOnce({ _id: 'project-b', type: 'project' });
    stateService.setInitialStateForOrganization
      .mockResolvedValueOnce({ state: { primary: 'PLANNED' } })
      .mockResolvedValueOnce({ state: { primary: 'SURVEYING' } });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'project'
        ? { constructionHandlers: { genericCreate: create } }
        : organizationService
    });
    const createEffect = (id, stateTo) => performDurableEffect({
      kind: 'effect.createEntity',
      record: {
        kind: 'effect.createEntity',
        id,
        typeId: 'project',
        producerOutputId: `${id}:result`,
        construction: { mode: 'genericCreate' },
        state: { to: stateTo },
        blocks: []
      },
      inputs: {}
    }, adminAuth());

    await createEffect('create_a', 'PLANNED');
    await createEffect('create_b', 'SURVEYING');

    expect(stateService.setInitialStateForOrganization).toHaveBeenNthCalledWith(1,
      'project', 'project-a', 'PLANNED', 'org-acceptance', 'admin',
      expect.objectContaining({ producerOutputId: 'create_a:result' }));
    expect(stateService.setInitialStateForOrganization).toHaveBeenNthCalledWith(2,
      'project', 'project-b', 'SURVEYING', 'org-acceptance', 'admin',
      expect.objectContaining({ producerOutputId: 'create_b:result' }));
  });

  it('passes the authored note to status execution as metadata and returns the entity DTO', async () => {
    const entity = { _id: 'sheet-1', type: 'sheet', states: { main: 'AVAILABLE' } };
    stateService.transitionWithResult.mockResolvedValue({ entity: { ...entity, states: { main: 'VERIFIED' } }, actions: [], effects: [] });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'sheet' ? {} : organizationService
    });

    const result = await performDurableEffect({
      kind: 'effect.changeStatus',
      record: { kind: 'effect.changeStatus', typeId: 'sheet', producerOutputId: 'sheet_source:entity' },
      inputs: {
        entity: { type: 'sheet', id: 'sheet-1' },
        status: 'VERIFIED',
        note: 'Inspection complete'
      }
    }, adminAuth());

    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      targetState: 'VERIFIED',
      context: {
        source: { kind: 'process-run' },
        producerOutputId: 'sheet_source:entity',
        metadata: { note: 'Inspection complete' }
      }
    }));
    expect(result).toEqual(expect.objectContaining({ _id: 'sheet-1' }));
    expect(result).not.toHaveProperty('actions');
  });

  it('executes a native transition record through its declared state reference', async () => {
    const entity = { _id: 'panel-1', type: 'panel', states: { main: 'production.cut', quality: 'open' } };
    stateService.transitionWithResult.mockResolvedValue({
      entity: { ...entity, states: { main: 'production.cut', quality: 'verified' } },
      actions: [],
      effects: []
    });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'panel' ? {} : organizationService
    });

    const result = await performDurableEffect({
      kind: 'cts.transition',
      record: {
        kind: 'cts.transition',
        id: 'verify',
        typeId: 'panel',
        state: { axis: 'quality', from: 'open', to: 'verified' }
      },
      inputs: { entity: { type: 'panel', id: 'panel-1' } }
    }, adminAuth());

    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      targetState: 'verified',
      context: {
        source: { kind: 'process-run', actionId: 'verify' },
        region: 'quality'
      }
    }));
    expect(result).toMatchObject({ _id: 'panel-1', states: { main: 'production.cut', quality: 'verified' } });
  });

  it('archives through a compiled domain intent and hard-deletes only through the runtime adapter', async () => {
    const processDelete = vi.fn().mockResolvedValue({ success: true });
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'queue'
        ? { processCapabilities: { archive: true, delete: true }, processDelete }
        : organizationService
    });
    stateService.transitionWithResult.mockResolvedValue({ entity: { _id: 'queue-1', states: { main: 'ARCHIVED' } } });

    await expect(performDurableEffect({
      kind: 'effect.archiveEntity',
      record: { kind: 'effect.archiveEntity', typeId: 'queue', archiveIntent: 'archiveQueue' },
      inputs: { entity: { type: 'queue', id: 'queue-1' } }
    }, adminAuth())).resolves.toMatchObject({ _id: 'queue-1' });
    expect(stateService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({ intent: 'archiveQueue' }));

    await expect(performDurableEffect({
      kind: 'effect.deleteEntity',
      record: { kind: 'effect.deleteEntity', typeId: 'queue' },
      inputs: { entity: { type: 'queue', id: 'queue-1' } }
    }, adminAuth())).resolves.toEqual({ success: true });
    expect(processDelete).toHaveBeenCalledWith('queue-1', adminAuth());
  });

  it('denies archive and hard delete when runtime capabilities do not allow them', async () => {
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'sheet_design'
        ? { processCapabilities: { archive: false, delete: false } }
        : organizationService
    });

    for (const kind of ['effect.archiveEntity', 'effect.deleteEntity']) {
      await expect(performDurableEffect({
        kind,
        record: { kind, typeId: 'sheet_design' },
        inputs: { entity: { type: 'sheet_design', id: 'sheet-1' } }
      }, adminAuth())).rejects.toThrow('does not support process');
    }
  });

  it('persists v5 leaf field inputs as direct field writes without block composition', async () => {
    const processUpdate = vi.fn(async (id, patch) => ({ _id: id, ...patch }));
    getAppRegistry.mockReturnValue({
      getInstanceService: type => type === 'sheet'
        ? { processGetById: vi.fn(), processUpdate, processCapabilities: { processUpdate: true } }
        : organizationService
    });

    await performDurableEffect({
      kind: 'effect.updateEntity',
      record: { id: 'n1', kind: 'effect.updateEntity', typeId: 'sheet', blocks: [] },
      inputs: {
        entity: { type: 'sheet', id: 'sheet-1' },
        'data.serial': 'SH-42'
      }
    }, relationAuth(), {});

    expect(processUpdate).toHaveBeenCalledTimes(1);
    expect(processUpdate).toHaveBeenCalledWith('sheet-1', { 'data.serial': 'SH-42' }, expect.objectContaining({ organizationId: 'org-acceptance' }));
  });


function relationActionProcessData() {
  const data = relationEffectProcessData('effect.updateEntity', 'libraries', 'many');
  data.processNodes.effect.id = 'update';
  data.processNodes.effect.producerOutputId = 'facade_context:entity';
  data.processNodes.effect.access.grants = [{ roleId: 'role_admin', level: 'write' }];
  data.processNodes.update = data.processNodes.effect;
  delete data.processNodes.effect;
  data.graph.nodes.find(node => node.id === 'effect').data.refId = 'update';
  data.graph.edges[0].target = 'effect';
  return data;
}

function libraryRef(id) {
  return { type: 'material', id };
}

function library(id) {
  return { _id: id, type: 'material', lineage: { organizationId: 'org-acceptance' } };
}

function relationAuth(actionIds = []) {
  return {
    userId: 'admin',
    organizationId: 'org-acceptance',
    effectivePermissions: { groups: { level: 'write' }, materials: { level: 'read' } },
    roleAssignments: { actions: actionIds.map(actionId => ({ actionId })) }
  };
}

function previewProcessData() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['entity', 'present', 'absent'].map(id => ({
        id,
        type: 'processNode',
        position: { x: 0, y: 0 },
        data: { refId: id }
      })),
      edges: [
        {
          id: 'entity-present',
          source: 'entity',
          sourceHandle: 'data:value',
          target: 'present',
          targetHandle: 'data:entity',
          role: 'data'
        },
        {
          id: 'entity-absent',
          source: 'entity',
          sourceHandle: 'data:value',
          target: 'absent',
          targetHandle: 'data:entity',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      entity: { id: 'entity', kind: 'source.literalItem', value: { fields: { serial: null } } },
      present: { id: 'present', kind: 'cts.field', typeId: 'part', inputDefaults: { field: 'fields.serial' } },
      absent: { id: 'absent', kind: 'cts.field', typeId: 'part', inputDefaults: { field: 'fields.design' } }
    }
  };
}

function readModifyWriteProcessData() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['deconstruct', 'names', 'refs', 'modify', 'update'].map(id => ({
        id,
        type: 'processNode',
        position: { x: 0, y: 0 },
        data: { refId: id }
      })),
      edges: [
        {
          id: 'deconstruct-modify',
          source: 'deconstruct',
          sourceHandle: 'data:data',
          target: 'modify',
          targetHandle: 'data:block',
          role: 'data'
        },
        {
          id: 'names-modify',
          source: 'names',
          sourceHandle: 'data:value',
          target: 'modify',
          targetHandle: 'data:data.label',
          role: 'data'
        },
        {
          id: 'refs-modify',
          source: 'refs',
          sourceHandle: 'data:value',
          target: 'modify',
          targetHandle: 'data:data.reference',
          role: 'data'
        },
        {
          id: 'modify-update',
          source: 'modify',
          sourceHandle: 'data:block',
          target: 'update',
          targetHandle: 'data:data',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    producerOutputs: {
      'machine_context:entity': {
        id: 'machine_context:entity', producerOutputId: 'machine_context:entity', nodeId: 'machine_context', outputSocketId: 'entity',
        typeId: 'machine', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*', 'data.*'], write: ['identity.*', 'data.*'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      deconstruct: { id: 'deconstruct', kind: 'record.deconstruct', typeId: 'machine', blocks: ['data'] },
      names: { id: 'names', kind: 'source.literalList', access: 'list', value: ['Renamed machine'] },
      refs: {
        id: 'refs',
        kind: 'source.literalTree',
        access: 'tree',
        value: { branches: [{ path: [], items: [{ code: 'M-01', location: 'Hall A' }] }] }
      },
      modify: {
        id: 'modify',
        kind: 'record.modifyBlock',
        block: 'data',
        fields: ['data.label', 'data.reference']
      },
      update: {
        id: 'update',
        kind: 'effect.updateEntity',
        typeId: 'machine',
        producerOutputId: 'machine_context:entity',
        label: 'Update machine',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [] },
        blocks: ['data']
      }
    }
  };
}

// The ad-hoc `machine` type both update-path tests run against: the
// identifier row plus the data rows their field patches write. The legacy
// identity.reference vocabulary died with the legacy domain tables — row
// fields project onto the data block. The registry swap returns a restore
// callback: validation, compilation, and runtime projection each re-resolve
// the organization registry, so a single mockResolvedValueOnce is not enough.
function mockMachineRegistry() {
  const machineRegistry = createTypeRegistry({ id: 'spec-machine' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) machineRegistry.defineType(declaration);
  machineRegistry.defineType({
    id: 'machine', class: 'item', name: 'Machine',
    fields: {
      name: { base: 'string' },
      label: { base: 'string', nullable: true },
      reference: { base: 'json', nullable: true }
    },
    states: { main: { initial: 'ACTIVE', states: { ACTIVE: {}, MAINTENANCE: {} } } },
    transitions: [{ axis: 'main', from: 'ACTIVE', to: 'MAINTENANCE', intent: 'maintain' }]
  });
  const mocked = vi.mocked(ctsTypes.compileRegistryForOrganization);
  const previous = mocked.getMockImplementation();
  mocked.mockImplementation(async () => machineRegistry);
  return () => mocked.mockImplementation(previous);
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.');
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    cursor[key] ||= {};
    cursor = cursor[key];
  }
  cursor[parts[0]] = value;
}

function adminAuth() {
  return {
    userId: 'admin',
    organizationId: 'org-acceptance',
    // files covers pack file types (e.g. material) as relation targets
    effectivePermissions: { organizations: { level: 'admin' }, materials: { level: 'admin' } }
  };
}

function draftRecord(data) {
  return {
    _id: 'process-draft',
    identity: { uid: 'process-draft', name: 'Acceptance process', slug: 'acceptance-process' },
    lineage: { organizationId: 'org-acceptance' },
    status: { state: 'DRAFT', userId: 'admin', timestamp: '2026-01-01T00:00:00.000Z', metadata: {}, eventId: null, lifecycle: { actors: [], attachments: {}, data: {} } },
    data
  };
}

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
});
