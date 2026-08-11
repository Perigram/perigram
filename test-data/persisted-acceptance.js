import { PROCESS_DATAFLOW_VERSION } from '#packages/processes/src/index.js';

export const PERSISTED_ACCEPTANCE_IDS = Object.freeze({
  organization: 'fixture-org-lineage',
  user: 'fixture-user-operator',
  role: 'fixture-role-operator',
  process: 'fixture-process-lineage',
  project: 'fixture-project-root',
  artifact: 'fixture-artifact-child'
});

const statusBlock = (state = 'CREATED') => ({
  state: { primary: state },
  timestamp: '2026-08-11T00:00:00.000Z',
  userId: PERSISTED_ACCEPTANCE_IDS.user,
  metadata: { note: 'Synthetic acceptance fixture' },
  lifecycle: { actors: [], attachments: {}, data: {} }
});

export function createPersistedAcceptanceFixture() {
  const ids = PERSISTED_ACCEPTANCE_IDS;
  const roles = {
    [ids.role]: { id: ids.role, label: 'Fixture operator' }
  };
  const processData = {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['project_source', 'artifact_lineage', 'create_artifact'].map((id, index) => ({
        id,
        type: 'processNode',
        position: { x: index * 240, y: 120 },
        data: { refId: id }
      })),
      edges: [
        {
          id: 'project-to-artifact-lineage',
          source: 'project_source',
          sourceHandle: 'data:result',
          target: 'artifact_lineage',
          targetHandle: 'entry:project'
        },
        {
          id: 'artifact-lineage-to-create',
          source: 'artifact_lineage',
          sourceHandle: 'data:block',
          target: 'create_artifact',
          targetHandle: 'data:lineage',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    entityProfiles: {
      project: {
        id: 'project',
        entityType: 'project',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
        allowedRoles: { read: [ids.role], write: [ids.role], admin: [] }
      },
      artifact: {
        id: 'artifact',
        entityType: 'artifact',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
        allowedRoles: { read: [ids.role], write: [ids.role], admin: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    statusDefinitions: {},
    valueInputs: {},
    screens: {},
    processNodes: {
      project_source: {
        id: 'project_source',
        kind: 'effect.createEntity',
        entityType: 'project',
        label: 'Create project',
        construction: { mode: 'genericCreate' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: ids.role, level: 'write' }] },
        status: { to: 'CREATED' },
        blocks: []
      },
      artifact_lineage: {
        id: 'artifact_lineage',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        targetEntityType: 'artifact',
        entries: [{ id: 'project' }]
      },
      create_artifact: {
        id: 'create_artifact',
        kind: 'effect.createEntity',
        entityType: 'artifact',
        label: 'Upload artifact',
        construction: { mode: 'uploadArtifact' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: ids.role, level: 'write' }] },
        status: { to: 'CREATED' },
        blocks: ['lineage']
      }
    }
  };

  return structuredClone({
    organization: {
      _id: ids.organization,
      identity: { uid: ids.organization, name: 'Fixture Organization', slug: 'fixture-organization' },
      origin: statusBlock('ACTIVE'),
      status: statusBlock('ACTIVE'),
      attachments: {},
      relations: {},
      data: { roles, activeProcessDefinitionId: ids.process }
    },
    processDefinition: {
      _id: ids.process,
      identity: { uid: ids.process, name: 'Fixture Lineage Process', slug: 'fixture-lineage-process' },
      origin: statusBlock('ACTIVE'),
      status: statusBlock('ACTIVE'),
      lineage: { organizationId: ids.organization },
      attachments: {},
      relations: {},
      data: processData
    },
    hierarchy: {
      project: {
        _id: ids.project,
        identity: { uid: ids.project, name: 'Fixture Project', slug: 'fixture-project' },
        origin: statusBlock(),
        status: statusBlock(),
        lineage: { organizationId: ids.organization },
        attachments: {},
        relations: {},
        data: {}
      },
      artifact: {
        _id: ids.artifact,
        identity: { uid: ids.artifact, name: 'Fixture Drawing', slug: 'fixture-drawing' },
        origin: statusBlock(),
        status: statusBlock(),
        lineage: { organizationId: ids.organization, projectId: ids.project },
        attachments: { primary: { kind: 'DXF_SOURCE', fileId: 'fixture-file-dxf' } },
        relations: {},
        data: { type: 'DXF_SOURCE' }
      }
    },
    assignment: {
      userId: ids.user,
      roleIds: [ids.role],
      bindings: {},
      status: 'active'
    },
    roles
  });
}
