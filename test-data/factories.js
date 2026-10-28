/**
 * v24 DTO factories used by UI lab and lightweight component tests.
 *
 * Factories model API DTOs, not raw MongoDB documents. They keep only
 * canonical blocks (`identity`, `origin`, `status`, `lineage`, `relations`,
 * `provenance`, `attachments`, `data`, `summary`, `specs`) plus root `_id`.
 */
import { ObjectId } from 'bson';
import { PERMISSION_TEMPLATES } from '#shared/permission-templates.js';

const now = () => new Date();
const id = (prefix) => `${prefix}-${new ObjectId().toString().slice(-8)}`;

const createStatusBlock = (state = 'DRAFT', userId = 'user-demo', metadata = {}, lifecycle = {}) => ({
  state,
  userId,
  timestamp: now(),
  metadata,
  eventId: new ObjectId(),
  lifecycle: {
    actors: Array.isArray(lifecycle.actors) ? lifecycle.actors : [],
    attachments: lifecycle.attachments || {},
    data: lifecycle.data || {}
  }
});

const createAttachmentEntry = (type, fileId, name, metadata = {}) => ({
  type,
  fileId,
  name,
  metadata
});

const createEntity = ({
  uid,
  name,
  slug,
  serial,
  reference,
  state = 'DRAFT',
  lineage = {},
  relations = {},
  provenance = {},
  specs = null,
  attachments = {},
  data = {},
  summary = {},
  lifecycle = {}
}) => {
  const origin = createStatusBlock(state, 'user-demo', { note: 'Demo entity created' }, lifecycle);
  const identity = { uid, name, slug, serial, reference };

  return {
    _id: uid,
    identity,
    origin,
    status: origin,
    lineage,
    relations,
    provenance,
    specs,
    attachments,
    data,
    summary
  };
};

export const MOCK_IDS = {
  organizationId: 'org-demo-acme',
  manufacturerId: 'org-demo-maker',
  warehouseId: 'wh-demo-main',
  projectId: 'project-demo-downtown',
  queueId: 'queue-demo-morning',
  runId: 'run-demo-001',
  libraryId: 'library-demo-acm',
  catalogId: 'catalog-demo-acm',
  sheetDesignId: 'sheet-design-demo-001',
  cassetteTemplateId: 'cassette-template-demo-001',
  cassetteDesignId: 'cassette-design-demo-001',
  entityRevisionId: 'entity-revision-demo-001'
};





export function createMockEntityRevision(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.entityRevisionId,
      name: 'cassette geometry v1',
      state: 'RECORDED',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        cassetteId: MOCK_IDS.cassetteTemplateId
      },
      data: {
        source: { type: 'cassette-template', id: MOCK_IDS.cassetteTemplateId },
        scope: 'geometry',
        number: 1,
        contentHash: 'sha256:demo1234567890',
        snapshot: {
          identity: { name: 'Parametric Type G' },
          data: {
            type: 'PARAMETRIC',
            definition: { params: { A: 600, B: 400, C: 35 } },
            parameters: ['A', 'B', 'C']
          }
        },
        reason: 'template-created'
      }
    }),
    ...overrides
  };
}



export function createMockPenTemplate(overrides = {}) {
  const stroke = { color: '#FF0000', weight: 2, pattern: 'SOLID' };
  return {
    ...createEntity({
      uid: 'pen-demo-cutting',
      name: 'Cutting Pen',
      state: 'ACTIVE',
      lineage: { userId: 'user-demo' },
      data: { stroke }
    }),
    ...overrides
  };
}

export function createMockLayerStandard(overrides = {}) {
  return {
    ...createEntity({
      uid: 'layer-standard-demo-facade-ext',
      name: 'Exterior Facade',
      serial: 'FACADE_EXT',
      state: 'ACTIVE',
      data: {
        code: 'FACADE_EXT',
        category: 'MILLING',
        defaultPenId: 'pen-demo-cutting',
        parameters: [],
        metadata: { color: '#3b82f6' }
      }
    }),
    ...overrides
  };
}

export function createMockUser(overrides = {}) {
  const role = 'ContractorAdmin';
  const permissions = PERMISSION_TEMPLATES[role];
  const memberships = [{
    organizationId: MOCK_IDS.organizationId,
    role,
    permissions,
    status: 'active'
  }];

  return {
    ...createEntity({
      uid: 'user-demo',
      name: 'John Doe',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId },
      data: {
        email: 'john@example.com',
        isActive: true,
        role,
        permissions,
        memberships
      }
    }),
    identity: { uid: 'user-demo', name: 'John Doe', reference: 'john@example.com' },
    ...overrides
  };
}

export function createMockOrganization(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.organizationId,
      name: 'Acme Manufacturing',
      slug: 'acme-mfg',
      state: 'ACTIVE',
      data: {
        type: 'FABRICATOR',
        email: 'ops@example.com',
        phone: '+1 555 0100',
        address: 'Industrial District'
      }
    }),
    ...overrides
  };
}

export function createMockHistory(statuses = ['DRAFT', 'ACTIVE', 'CLOSED']) {
  return statuses.map((state, index) => ({
    _id: `status-event-${index}`,
    targetId: MOCK_IDS.projectId,
    targetType: 'project',
    fromState: index === 0 ? null : statuses[index - 1],
    toState: state,
    timestamp: new Date(Date.now() - (statuses.length - index) * 3600000),
    status: createStatusBlock(state, 'user-demo', { note: `Step ${index + 1}` })
  }));
}

export function createMockStatistics() {
  return {
    sheetsUsed: 12,
    totalAreaUsed: 45.5,
    utilizationRate: 87.4,
    totalCost: 15678.9
  };
}
