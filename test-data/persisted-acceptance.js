import { PROCESS_DATAFLOW_VERSION } from '#packages/processes/src/index.js';

export const PERSISTED_ACCEPTANCE_IDS = Object.freeze({
  organization: 'fixture-org-lineage',
  user: 'fixture-user-operator',
  role: 'fixture-role-operator',
  process: 'fixture-process-lineage',
  project: 'fixture-project-root',
  facade: 'fixture-facade-child'
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
      nodes: ['project_source', 'facade_lineage', 'create_facade'].map((id, index) => ({
        id,
        type: 'processNode',
        position: { x: index * 240, y: 120 },
        data: { refId: id }
      })),
      edges: [
        {
          id: 'project-to-facade-lineage',
          source: 'project_source',
          sourceHandle: 'data:result',
          target: 'facade_lineage',
          targetHandle: 'entry:project'
        },
        {
          id: 'facade-lineage-to-create',
          source: 'facade_lineage',
          sourceHandle: 'data:block',
          target: 'create_facade',
          targetHandle: 'data:lineage',
          role: 'data'
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    producerOutputs: {
      'project_source:result': {
        id: 'project_source:result',
        producerOutputId: 'project_source:result',
        nodeId: 'project_source',
        outputSocketId: 'result',
        entityType: 'project',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
        allowedRoles: { read: [ids.role], write: [ids.role], admin: [] }
      },
      'create_facade:result': {
        id: 'create_facade:result',
        producerOutputId: 'create_facade:result',
        nodeId: 'create_facade',
        outputSocketId: 'result',
        entityType: 'facade',
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
        producerOutputId: 'project_source:result',
        label: 'Create project',
        construction: { mode: 'genericCreate' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: ids.role, level: 'write' }] },
        status: { to: 'draft' },
        blocks: []
      },
      facade_lineage: {
        id: 'facade_lineage',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        targetEntityType: 'facade',
        entries: [{ id: 'project' }]
      },
      create_facade: {
        id: 'create_facade',
        kind: 'effect.createEntity',
        entityType: 'facade',
        producerOutputId: 'create_facade:result',
        label: 'Create facade',
        construction: { mode: 'genericCreate' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: ids.role, level: 'write' }] },
        status: { to: 'draft' },
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
      facade: {
        _id: ids.facade,
        identity: { uid: ids.facade, name: 'Fixture Facade', slug: 'fixture-facade' },
        origin: statusBlock(),
        status: statusBlock(),
        lineage: { organizationId: ids.organization, projectId: ids.project },
        attachments: {},
        relations: {},
        data: {}
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
