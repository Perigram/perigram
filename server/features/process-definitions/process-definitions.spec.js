import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activate,
  hasProcessDefinitionMembershipAccess,
  resolveProcessGraphEntity,
  startRun,
  update
} from './service.js';
import * as processRepository from './repository.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
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

  it('persists a deconstruct -> modify block -> update entity read-modify-write chain through processUpdate', async () => {
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
        'identity.slug': 'cnc-router'
      }),
      expect.objectContaining({ userId: 'admin', organizationId: 'org-acceptance' })
    );
    const persisted = await processUpdate.mock.results[0].value;
    expect(persisted.identity.name).toBe('Renamed machine');
    expect(persisted.identity.slug).toBe('cnc-router');
  });
});

function readModifyWriteProcessData() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['deconstruct', 'names', 'modify', 'update'].map(id => ({
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
      modify: { id: 'modify', kind: 'record.modifyBlock', block: 'identity', fields: ['identity.name'] },
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
