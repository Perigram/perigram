import { PROCESS_DATAFLOW_VERSION } from '#packages/processes';

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
    graphProtocol: 5,
    ctsTypes: {
      st_active: { id: 'st_active', kind: 'state', value: 'ACTIVE' },
      st_archived: { id: 'st_archived', kind: 'state', value: 'ARCHIVED' }
    },
    graph: {
      nodes: [
        { id: 'st_active', type: 'ctsState', position: { x: 0, y: 0 }, data: { refId: 'st_active', value: 'ACTIVE' } },
        { id: 'st_archived', type: 'ctsState', position: { x: 240, y: 0 }, data: { refId: 'st_archived', value: 'ARCHIVED' } },
        { id: 'create_cassette', type: 'processNode', position: { x: 480, y: 120 }, data: { refId: 'create_cassette' } }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    },
    roleGrants: {},
    producerOutputs: {
      'create_cassette:result': {
        id: 'create_cassette:result',
        producerOutputId: 'create_cassette:result',
        nodeId: 'create_cassette',
        outputSocketId: 'result',
        typeId: 'cassette-design',
        lifecycle: { mode: 'domainDefault' },
        fields: { read: ['name'], write: [], private: [] },
        allowedRoles: { read: [ids.role], write: [ids.role], admin: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    stateDefinitions: {},
    valueInputs: {},
    screens: {},
    processNodes: {
      create_cassette: {
        id: 'create_cassette',
        kind: 'cts.construct',
        typeId: 'cassette-design',
        producerOutputId: 'create_cassette:result',
        label: 'Create cassette',
        construction: { mode: 'upload', inputs: [] },
        inputDefaults: { state: 'ACTIVE' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: ids.role, level: 'write' }] }
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
