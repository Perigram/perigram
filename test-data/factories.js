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
  facadeId: 'facade-demo-atrium',
  facadePatternId: 'facade-pattern-demo-grid',
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

export function createMockSheetDesign(overrides = {}) {
  const geometry = {
    svgId: 'svg-sheet-demo',
    dxfId: 'dxf-sheet-demo',
    preview: {
      viewBox: '0 0 200 100',
      layers: [
        { name: 'sheet', color: 'currentColor', weight: 2, paths: ['M8 8 H192 V92 H8 Z'] },
        { name: 'cassettes', color: 'var(--p-primary-color)', weight: 1.5, paths: ['M20 20 H80 V55 H20 Z', 'M96 20 H150 V72 H96 Z'] }
      ]
    }
  };
  return {
    ...createEntity({
      uid: MOCK_IDS.sheetDesignId,
      name: 'Sheet Design SD-NEST-001',
      serial: 'SD-NEST-001',
      state: 'READY',
      lineage: { queueId: MOCK_IDS.queueId, runId: MOCK_IDS.runId },
      specs: { width: 2000, length: 1000, area: 2, sheetThickness: 4 },
      data: { geometry }
    }),
    ...overrides
  };
}

export function createMockCassette(overrides = {}) {
  const geometry = {
    preview: {
      viewBox: '0 0 160 90',
      layers: [
        { name: 'outline', color: 'currentColor', weight: 2, paths: ['M12 12 H148 V78 H12 Z'] },
        { name: 'folds', color: 'var(--p-primary-color)', weight: 1.5, paths: ['M38 12 V78', 'M122 12 V78'] }
      ]
    }
  };

  return {
    ...createEntity({
      uid: 'cassette-demo-001',
      name: 'Cassette Type A',
      slug: 'cassette-type-a',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId },
      data: {
        type: 'PARAMETRIC',
        parameters: ['A', 'B', 'C'],
        geometry,
        organizationId: MOCK_IDS.organizationId,
        userId: 'user-demo'
      }
    }),
    ...overrides
  };
}

export function createMockCassetteTemplate(overrides = {}) {
  const definition = {
    params: { A: 600, B: 400, C: 35 },
    extrusions: [{ edge: 0, param: 'C' }]
  };
  const parameters = ['A', 'B', 'C'];

  return {
    ...createEntity({
      uid: MOCK_IDS.cassetteTemplateId,
      name: 'Parametric Type G',
      slug: 'parametric-type-g',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId },
      data: {
        type: 'PARAMETRIC',
        definition,
        parameters,
        organizationId: MOCK_IDS.organizationId,
        userId: 'user-demo'
      },
      attachments: {}
    }),
    ...overrides
  };
}

export function createMockCassetteDesign(overrides = {}) {
  const geometry = { data: null, dxfId: 'dxf-cassette-design-demo' };
  const parameters = { A: 1200, B: 400, C: 35 };
  return {
    ...createEntity({
      uid: MOCK_IDS.cassetteDesignId,
      name: 'Standard Type A',
      serial: 'CD-FACADE-01',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId, projectId: MOCK_IDS.projectId },
      provenance: {
        derivedFrom: {
          source: {
            type: 'cassette',
            id: MOCK_IDS.cassetteTemplateId,
            revisionId: MOCK_IDS.entityRevisionId
          },
          scope: 'geometry',
          revisionNumber: 1,
          contentHash: 'sha256:demo1234567890',
          parameters
        }
      },
      data: {
        geometry,
        parameters
      }
    }),
    ...overrides
  };
}

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
        source: { type: 'cassette', id: MOCK_IDS.cassetteTemplateId },
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

export function createMockToolProfile(overrides = {}) {
  return {
    ...createEntity({
      uid: 'tool-demo-flat-endmill-4',
      name: 'Flat Endmill 4mm',
      state: 'ACTIVE',
      lineage: { userId: 'user-demo' },
      data: { diameter: 4, angle: 180, kerf: 4, description: 'General cutting tool' }
    }),
    ...overrides
  };
}

export function createMockProfileTemplate(overrides = {}) {
  return {
    ...createEntity({
      uid: 'profile-demo-hanger',
      name: 'Hanger profile',
      state: 'ACTIVE',
      lineage: { userId: 'user-demo' },
      data: {
        kind: 'hanger',
        process: 'extruded',
        parameters: { W: 42, H: 28, R: 3, D: 6, L: 120 },
        sketch: {
          version: '0.1',
          units: 'mm',
          parameters: { W: 42, H: 28, R: 3, D: 6, L: 120 },
          points: [
            { id: 'p0', x: 0, y: 0 },
            { id: 'p1', x: 42, y: 0 },
            { id: 'p2', x: 42, y: 28 },
            { id: 'p3', x: 0, y: 28 }
          ],
          edges: [
            { id: 'e0', type: 'line', from: 'p0', to: 'p1' },
            { id: 'e1', type: 'line', from: 'p1', to: 'p2' },
            { id: 'e2', type: 'line', from: 'p2', to: 'p3' },
            { id: 'e3', type: 'line', from: 'p3', to: 'p0' }
          ],
          holes: [{ id: 'h0', type: 'circle', center: [21, 14], diameter: 6 }],
          modifiers: [{ type: 'fillet', vertices: ['p0', 'p1', 'p2', 'p3'], radius: 3 }]
        },
        occsProfile: {
          section: {
            type: 'polygon',
            vertices: [['0', '0'], ['42', '0'], ['42', '28'], ['0', '28']],
            edges: [{ type: 'line' }, { type: 'line' }, { type: 'line' }, { type: 'line' }],
            holes: [{ type: 'circle', center: ['21', '14'], diameter: '6' }],
            modifiers: [{ type: 'fillet', vertices: ['p0', 'p1', 'p2', 'p3'], radius: 3 }]
          },
          sweep: { type: 'linear', length: '120' }
        }
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

export function createMockArtifact(overrides = {}) {
  const attachment = createAttachmentEntry('LAYOUT_DXF', 'file-demo-layout-dxf', 'layout.dxf', {
    bucket: 'nestDxf'
  });
  return {
    ...createEntity({
      uid: 'artifact-demo-layout-dxf',
      name: 'Queue Q-001 - Layout DXF',
      state: 'AVAILABLE',
      lineage: { queueId: MOCK_IDS.queueId, runId: MOCK_IDS.runId },
      attachments: { primary: attachment },
      data: { type: 'LAYOUT_DXF', metadata: { requestedBy: 'ui-lab' } }
    }),
    ...overrides
  };
}

export function createMockArtifactTemplate(overrides = {}) {
  return {
    ...createEntity({
      uid: 'artifact-template-demo',
      name: 'Production passport',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId },
      attachments: {
        source: createAttachmentEntry('ARTIFACT_TEMPLATE_SOURCE', 'file-artifact-template', 'passport.pdf', {
          bucket: 'artifactTemplates'
        })
      },
      data: {
        format: 'PDF',
        variables: [{ name: 'projectName', type: 'string', default: 'Project' }],
        activeRevisionId: 'artifact-template-revision-1',
        layout: { format: 'PDF', unit: 'pt', pages: [] }
      }
    }),
    ...overrides
  };
}

export function createMockMachine(overrides = {}) {
  return {
    ...createEntity({
      uid: 'machine-system-default',
      name: 'Default 3000 × 1500 machine',
      lineage: { scope: 'system', public: true },
      data: {
        workingArea: { width: 3000, length: 1500 },
        boundaryOffset: 0,
        visibility: { public: true }
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
