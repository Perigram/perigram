import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activate,
  executeActiveProcessAction,
  hasProcessDefinitionMembershipAccess,
  performDurableEffect,
  preview,
  resolveProcessGraphEntity,
  startRun,
  update
} from './service.js';
import * as processRepository from './repository.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { statusService } from '~/server/core/machines/service.js';
import { PROCESS_DATAFLOW_VERSION } from '~/packages/processes/src/index.js';
import { createPersistedAcceptanceFixture } from '~/test-data/persisted-acceptance.js';

vi.mock('./repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  create: vi.fn(),
  updateById: vi.fn(),
  archiveActiveByOrganization: vi.fn()
}));

vi.mock('~/server/runtime/app-registry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAppRegistry: vi.fn()
}));

vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    statusService: { ...actual.statusService, transitionWithResult: vi.fn() }
  };
});

describe('current process-definition service contract', () => {
  const organizationService = {
    getProcessConfiguration: vi.fn(),
    setActiveProcessDefinition: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    organizationService.getProcessConfiguration.mockResolvedValue({
      roles: createPersistedAcceptanceFixture().organization.data.roles,
      roleAssignments: {}
    });
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'organization' ? organizationService : null
    });
  });

  it('reads entities through registered process adapters with the complete auth context', async () => {
    const processGetById = vi.fn().mockResolvedValue({
      _id: 'library-1',
      lineage: { organizationId: 'org-1' }
    });
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'library' ? { processGetById } : organizationService
    });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: { libraries: [{ level: 'read' }] }
    };

    await expect(resolveProcessGraphEntity('library', 'library-1', { auth }))
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
    organizationService.getProcessConfiguration.mockResolvedValueOnce({
      roles: fixture.organization.data.roles,
      roleAssignments: {}
    });

    await expect(executeActiveProcessAction({ actionId: 'project_source' }, {
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
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT' },
      data: { schemaVersion: 1, dataflowVersion: 2, graph: { nodes: [], edges: [] } }
    });

    await expect(activate('process-old', adminAuth())).rejects.toThrow('Process dataflow version 4 is required');
    expect(processRepository.updateById).not.toHaveBeenCalled();
  });

  it('persists structurally serializable drafts without compiling them', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    processRepository.findById.mockResolvedValue(draftRecord(authored));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const result = await update('process-draft', { data: authored }, adminAuth());

    expect(processRepository.updateById.mock.calls[0][1].data).toEqual({ ...authored, compiled: null });
    expect(result.data.graph).toEqual(authored.graph);
  });

  it('activates a valid current fixture and records it through the organization service boundary', async () => {
    const authored = createPersistedAcceptanceFixture().processDefinition.data;
    processRepository.findById.mockResolvedValue(draftRecord(authored));
    processRepository.updateById.mockImplementation(async (id, process) => ({ ...process.toJSON(), _id: id }));

    const result = await activate('process-draft', adminAuth());

    expect(result.status.state.primary).toBe('ACTIVE');
    expect(result.data.compiled.lineageBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ childEntityType: 'artifact', ancestorEntityType: 'project', lineageKey: 'projectId' })
    ]));
    expect(organizationService.setActiveProcessDefinition).toHaveBeenCalledWith('org-acceptance', 'process-draft');
  });

  it('round-trips the missing-field tag and present null through the preview response', async () => {
    const result = await preview({ definition: { data: previewProcessData() } }, adminAuth());

    expect(result.nodes.present.outputs.value.branches[0].items).toEqual([null]);
    expect(result.nodes.absent.outputs.value.branches[0].items).toEqual([
      { missing: true, path: 'identity.reference' }
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
      data: { workingArea: { width: 1300, depth: 2500 } },
      attachments: {},
      status: { state: { primary: 'ACTIVE' }, timestamp: '2026-01-01T00:00:00.000Z', userId: 'admin' }
    };
    const processUpdate = vi.fn(async (id, patch) => {
      const persisted = structuredClone(machine);
      for (const [path, value] of Object.entries(patch)) {
        setByPath(persisted, path, value);
      }
      return persisted;
    });
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'machine'
        ? { processUpdate }
        : type === 'organization' ? organizationService : null
    });
    processRepository.findById.mockResolvedValue(draftRecord(readModifyWriteProcessData()));

    const run = await startRun('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: machine }
    }, adminAuth());

    expect(run.status).toBe('succeeded');
    expect(processUpdate).toHaveBeenCalledTimes(1);
    expect(processUpdate).toHaveBeenCalledWith(
      'machine-1',
      expect.objectContaining({
        'identity.uid': 'machine-1',
        'identity.name': 'Renamed machine',
        'identity.slug': 'cnc-router',
        'identity.reference': { code: 'M-01', location: 'Hall A' }
      }),
      expect.objectContaining({ userId: 'admin', organizationId: 'org-acceptance' })
    );
    const persisted = await processUpdate.mock.results[0].value;
    expect(persisted.identity.name).toBe('Renamed machine');
    expect(persisted.identity.slug).toBe('cnc-router');
    expect(persisted.identity.reference).toEqual({ code: 'M-01', location: 'Hall A' });
  });

  it('emits the updated typed entity DTO from a modify entity node that combines writable blocks with a status target', async () => {
    const machine = {
      type: 'machine',
      id: 'machine-1',
      _id: 'machine-1',
      identity: { uid: 'machine-1', name: 'CNC Router', slug: 'cnc-router' },
      lineage: { organizationId: 'org-acceptance' },
      data: { workingArea: { width: 1300, depth: 2500 } },
      attachments: {},
      status: { state: { primary: 'ACTIVE' }, timestamp: '2026-01-01T00:00:00.000Z', userId: 'admin' }
    };
    statusService.transitionWithResult.mockImplementation(async ({ targetState, patch }) => {
      const updated = structuredClone(machine);
      for (const [path, value] of Object.entries(patch || {})) {
        setByPath(updated, path, value);
      }
      updated.status = { state: { primary: targetState }, timestamp: '2026-01-02T00:00:00.000Z', userId: 'admin' };
      return { entity: updated, status: updated.status, actions: [], effects: [] };
    });
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'machine'
        ? {}
        : type === 'organization' ? organizationService : null
    });
    const data = readModifyWriteProcessData();
    data.processNodes.update.inputDefaults = { 'status.state.primary': 'MAINTENANCE' };
    processRepository.findById.mockResolvedValue(draftRecord(data));

    const run = await startRun('process-draft', {
      trigger: { nodeId: 'update' },
      inputs: { entity: machine }
    }, adminAuth());

    expect(run.status).toBe('succeeded');
    expect(statusService.transitionWithResult).toHaveBeenCalledTimes(1);
    expect(statusService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'machine',
      targetId: 'machine-1',
      targetState: 'MAINTENANCE',
      patch: expect.objectContaining({
        'identity.name': 'Renamed machine',
        'identity.slug': 'cnc-router',
        'identity.reference': { code: 'M-01', location: 'Hall A' }
      })
    }));
    const emitted = run.steps.find(step => step.nodeId === 'update')?.output;
    expect(emitted).toMatchObject({
      _id: 'machine-1',
      identity: {
        uid: 'machine-1',
        name: 'Renamed machine',
        slug: 'cnc-router',
        reference: { code: 'M-01', location: 'Hall A' }
      },
      status: { state: { primary: 'MAINTENANCE' } }
    });
    expect(emitted).not.toHaveProperty('actions');
    expect(emitted).not.toHaveProperty('effects');
  });

  it('validates graph-declared Create relations before invoking the owning constructor', async () => {
    const data = relationEffectProcessData('effect.createEntity', 'sourceLibrary', 'one');
    const create = vi.fn().mockResolvedValue({ _id: 'facade-1' });
    const targetGet = vi.fn().mockResolvedValue(library('library-1'));
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'facade'
        ? { constructionHandlers: { genericCreate: create } }
        : type === 'library' ? { processGetById: targetGet } : organizationService
    });

    await performDurableEffect({
      kind: 'effect.createEntity',
      record: data.processNodes.effect,
      inputs: { relations: { sourceLibrary: { type: 'library', id: 'library-1' } } }
    }, relationAuth(), data);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { sourceLibrary: { type: 'library', id: 'library-1' } } }),
      expect.any(Object)
    );

    await expect(performDurableEffect({
      kind: 'effect.createEntity',
      record: data.processNodes.effect,
      inputs: { relations: { sourceLibrary: { type: 'project', id: 'project-1' } } }
    }, relationAuth(), data)).rejects.toThrow('Relation target must be library');
    await expect(performDurableEffect({
      kind: 'effect.createEntity',
      record: data.processNodes.effect,
      inputs: { relations: { sourceLibrary: [libraryRef('library-1'), libraryRef('library-2')] } }
    }, relationAuth(), data)).rejects.toThrow('accepts exactly one entity');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('normalizes graph-declared Modify relation arrays and rejects missing or inaccessible targets before persistence', async () => {
    const data = relationEffectProcessData('effect.updateEntity', 'reviewLibraries', 'many');
    const processUpdate = vi.fn().mockResolvedValue({ _id: 'facade-1' });
    const targetGet = vi.fn(async id => id === 'missing'
      ? null
      : id === 'foreign' ? { ...library(id), lineage: { organizationId: 'org-other' } } : library(id));
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'facade'
        ? { processUpdate }
        : type === 'library' ? { processGetById: targetGet } : organizationService
    });

    await performDurableEffect({
      kind: 'effect.updateEntity',
      record: data.processNodes.effect,
      inputs: {
        entity: { type: 'facade', id: 'facade-1' },
        relations: { reviewLibraries: [libraryRef('library-1'), libraryRef('library-1'), libraryRef('library-2')] }
      }
    }, relationAuth(), data);

    expect(processUpdate).toHaveBeenCalledWith('facade-1', {
      'relations.reviewLibraries': [libraryRef('library-1'), libraryRef('library-2')]
    }, relationAuth());

    await expect(performDurableEffect({
      kind: 'effect.updateEntity',
      record: data.processNodes.effect,
      inputs: { entity: { type: 'facade', id: 'facade-1' }, relations: { reviewLibraries: [libraryRef('missing')] } }
    }, relationAuth(), data)).rejects.toMatchObject({ statusCode: 404 });
    await expect(performDurableEffect({
      kind: 'effect.updateEntity',
      record: data.processNodes.effect,
      inputs: { entity: { type: 'facade', id: 'facade-1' }, relations: { reviewLibraries: [libraryRef('library-3')] } }
    }, { ...relationAuth(), effectivePermissions: { facades: { level: 'write' } } }, data)).rejects.toMatchObject({ statusCode: 403 });
    await expect(performDurableEffect({
      kind: 'effect.updateEntity',
      record: data.processNodes.effect,
      inputs: { entity: { type: 'facade', id: 'facade-1' }, relations: { reviewLibraries: [libraryRef('foreign')] } }
    }, relationAuth(), data)).rejects.toMatchObject({ statusCode: 403 });
    expect(processUpdate).toHaveBeenCalledTimes(1);
  });

  it('runs Link, Unlink, and replacement with target access and duplicate guarantees', async () => {
    const data = relationActionProcessData();
    const owner = {
      _id: 'facade-1',
      type: 'facade',
      lineage: { organizationId: 'org-acceptance' },
      relations: { libraries: [libraryRef('library-1'), libraryRef('library-2')] }
    };
    const processUpdate = vi.fn(async (id, patch) => {
      owner.relations.libraries = patch['relations.libraries'];
      return structuredClone(owner);
    });
    const targetGet = vi.fn(async id => id === 'missing' ? null : library(id));
    processRepository.findActiveByOrganization.mockResolvedValue(draftRecord(data));
    organizationService.getProcessConfiguration.mockResolvedValue({
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      roleAssignments: {}
    });
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'facade'
        ? { processGetById: vi.fn().mockImplementation(async () => structuredClone(owner)), processUpdate }
        : type === 'library' ? { processGetById: targetGet } : organizationService
    });
    const auth = relationAuth([
      'update:link:libraries',
      'update:unlink:libraries'
    ]);

    await executeActiveProcessAction({
      actionId: 'update:link:libraries',
      entityId: 'facade-1',
      data: { relations: { libraries: libraryRef('library-2') } }
    }, auth);
    expect(owner.relations.libraries).toEqual([libraryRef('library-1'), libraryRef('library-2')]);

    await executeActiveProcessAction({
      actionId: 'update:link:libraries',
      entityId: 'facade-1',
      data: { relations: { libraries: libraryRef('library-3') }, relationReplaces: libraryRef('library-1') }
    }, auth);
    expect(owner.relations.libraries).toEqual([libraryRef('library-2'), libraryRef('library-3')]);

    await executeActiveProcessAction({
      actionId: 'update:unlink:libraries',
      entityId: 'facade-1',
      data: { relations: { libraries: libraryRef('library-2') } }
    }, auth);
    expect(owner.relations.libraries).toEqual([libraryRef('library-3')]);

    await expect(executeActiveProcessAction({
      actionId: 'update:link:libraries',
      entityId: 'facade-1',
      data: { relations: { libraries: libraryRef('missing') } }
    }, auth)).rejects.toMatchObject({ statusCode: 404 });
    expect(processUpdate).toHaveBeenCalledTimes(3);
  });
});

function relationEffectProcessData(kind, key, cardinality) {
  const effect = {
    id: 'effect',
    kind,
    entityType: 'facade',
    blocks: ['relations'],
    construction: { mode: 'genericCreate' },
    trigger: { mode: 'manual' },
    access: { level: 'write', grants: [] }
  };
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['relations', 'effect'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [{ id: 'relations-effect', source: 'relations', sourceHandle: 'data:block', target: 'effect', targetHandle: 'data:relations', role: 'data' }]
    },
    roleGrants: {}, entityProfiles: {}, actions: {}, services: {}, sockets: {}, screens: {},
    processNodes: {
      relations: {
        id: 'relations', kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations',
        entries: [{ id: key, key, entityType: 'library', type: cardinality === 'many'
          ? { base: 'array', itemType: { base: 'entityRef', entityType: 'library' } }
          : { base: 'entityRef', entityType: 'library' } }]
      },
      effect
    }
  };
}

function relationActionProcessData() {
  const data = relationEffectProcessData('effect.updateEntity', 'libraries', 'many');
  data.processNodes.effect.id = 'update';
  data.processNodes.effect.access.grants = [{ roleId: 'role_admin', level: 'write' }];
  data.processNodes.update = data.processNodes.effect;
  delete data.processNodes.effect;
  data.graph.nodes.find(node => node.id === 'effect').data.refId = 'update';
  data.graph.edges[0].target = 'effect';
  return data;
}

function libraryRef(id) {
  return { type: 'library', id };
}

function library(id) {
  return { _id: id, type: 'library', lineage: { organizationId: 'org-acceptance' } };
}

function relationAuth(actionIds = []) {
  return {
    userId: 'admin',
    organizationId: 'org-acceptance',
    effectivePermissions: { facades: { level: 'write' }, libraries: { level: 'read' } },
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
          targetHandle: 'data:block',
          role: 'data'
        },
        {
          id: 'entity-absent',
          source: 'entity',
          sourceHandle: 'data:value',
          target: 'absent',
          targetHandle: 'data:block',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    entityProfiles: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      entity: { id: 'entity', kind: 'source.literalItem', value: { name: null } },
      present: { id: 'present', kind: 'record.getField', block: 'identity', path: 'identity.name' },
      absent: { id: 'absent', kind: 'record.getField', block: 'identity', path: 'identity.reference' }
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
          sourceHandle: 'data:identity',
          target: 'modify',
          targetHandle: 'data:block',
          role: 'data'
        },
        {
          id: 'names-modify',
          source: 'names',
          sourceHandle: 'data:value',
          target: 'modify',
          targetHandle: 'data:identity.name',
          role: 'data'
        },
        {
          id: 'refs-modify',
          source: 'refs',
          sourceHandle: 'data:value',
          target: 'modify',
          targetHandle: 'data:identity.reference',
          role: 'data'
        },
        {
          id: 'modify-update',
          source: 'modify',
          sourceHandle: 'data:block',
          target: 'update',
          targetHandle: 'data:identity',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    entityProfiles: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      deconstruct: { id: 'deconstruct', kind: 'record.deconstruct', entityType: 'machine', blocks: ['identity'] },
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
        block: 'identity',
        fields: ['identity.name', 'identity.reference']
      },
      update: {
        id: 'update',
        kind: 'effect.updateEntity',
        entityType: 'machine',
        label: 'Update machine',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [] },
        blocks: ['identity']
      }
    }
  };
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
    effectivePermissions: { organizations: { level: 'admin' } }
  };
}

function draftRecord(data) {
  return {
    _id: 'process-draft',
    identity: { uid: 'process-draft', name: 'Acceptance process', slug: 'acceptance-process' },
    lineage: { organizationId: 'org-acceptance' },
    status: { state: 'DRAFT' },
    data
  };
}
