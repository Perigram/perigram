/**
 * v24 DTO factories used by UI lab and lightweight component tests.
 *
 * Factories model API DTOs, not raw MongoDB documents. They keep only
 * canonical blocks (`identity`, `origin`, `status`, `lineage`, `attachments`,
 * `data`, `summary`, `specs`) plus root `_id`.
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
  catalogId: 'catalog-demo-acm',
  sheetDesignId: 'sheet-design-demo-001',
  cassetteTemplateId: 'cassette-template-demo-001',
  cassetteDesignId: 'cassette-design-demo-001',
  entityRevisionId: 'entity-revision-demo-001'
};

export function createMockProject(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.projectId,
      name: 'Downtown Complex',
      slug: 'downtown-complex',
      state: 'DRAFT',
      lineage: { organizationId: MOCK_IDS.organizationId },
      data: {
        address: '42 Riverfront Ave',
        thumbnailUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 600 240%22%3E%3Crect width=%22600%22 height=%22240%22 fill=%22%23f4f4f5%22/%3E%3Cpath d=%22M40 190h520M80 190V80h120v110M230 190V45h150v145M410 190V105h90v85%22 fill=%22none%22 stroke=%22%230f766e%22 stroke-width=%2212%22/%3E%3C/svg%3E'
      },
      summary: { queueCount: 3, totalArea: 150.5 }
    }),
    ...overrides
  };
}

export function createMockQueue(overrides = {}) {
  const job = {
    items: [
      {
        id: MOCK_IDS.cassetteTemplateId,
        type: 'PARAMETRIC',
        quantity: 10,
        parameters: { A: 1200, B: 400 }
      }
    ],
    materialPool: [{ type: 'PILE', id: 'pile-demo-001' }]
  };

  return {
    ...createEntity({
      uid: MOCK_IDS.queueId,
      name: 'Morning Production Run',
      slug: 'morning-production-run',
      state: 'DRAFT',
      lineage: { organizationId: MOCK_IDS.organizationId, projectId: MOCK_IDS.projectId },
      data: { job, queueNumber: 'Q-001' },
      summary: { runCount: 2, sheetCount: 12, totalArea: 45.6 }
    }),
    ...overrides
  };
}

export function createMockNestingRun(overrides = {}) {
  const results = { efficiency: 92.4, sheetCount: 5, remnantArea: 1.2 };
  return {
    ...createEntity({
      uid: MOCK_IDS.runId,
      name: 'Run #1',
      state: 'COMPLETE',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        projectId: MOCK_IDS.projectId,
        queueId: MOCK_IDS.queueId
      },
      data: { results, layoutData: {} }
    }),
    ...overrides
  };
}

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
      lineage: { organizationId: MOCK_IDS.organizationId, templateId: MOCK_IDS.cassetteTemplateId },
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
      state: 'APPROVED',
      lineage: { projectId: MOCK_IDS.projectId, templateId: MOCK_IDS.cassetteTemplateId },
      data: {
        geometry,
        parameters,
        derivedFrom: {
          entityType: 'cassette',
          entityId: MOCK_IDS.cassetteTemplateId,
          scope: 'geometry',
          revisionId: MOCK_IDS.entityRevisionId,
          revisionNumber: 1,
          contentHash: 'sha256:demo1234567890',
          parameters
        }
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
      state: 'ACTIVE',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        cassetteId: MOCK_IDS.cassetteTemplateId
      },
      data: {
        entityType: 'cassette',
        entityId: MOCK_IDS.cassetteTemplateId,
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

export function createMockCassetteInstance(overrides = {}) {
  return {
    ...createEntity({
      uid: 'cassette-instance-demo-001',
      name: 'Instance Panel-A-01',
      serial: 'INST-0001',
      reference: 'Panel-A-01',
      state: 'PRODUCED',
      lineage: {
        projectId: MOCK_IDS.projectId,
        queueId: MOCK_IDS.queueId,
        runId: MOCK_IDS.runId,
        cassetteDesignId: MOCK_IDS.cassetteDesignId
      },
      data: {},
      lifecycle: {
        data: {
          location: { type: 'warehouse', warehouseId: MOCK_IDS.warehouseId, label: 'Main Logistic Hub' }
        }
      }
    }),
    ...overrides
  };
}

export function createMockSheet(overrides = {}) {
  return {
    ...createEntity({
      uid: 'sheet-demo-001',
      name: 'Sheet SH-2025-001',
      serial: 'SH-2025-001',
      state: 'AVAILABLE',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        warehouseId: MOCK_IDS.warehouseId,
        queueId: MOCK_IDS.queueId,
        runId: MOCK_IDS.runId
      },
      specs: { width: 3000, length: 1500, area: 4.5, sheetThickness: 4 },
      data: {},
      lifecycle: {
        data: {
          location: { type: 'warehouse', warehouseId: MOCK_IDS.warehouseId, label: 'Main Logistic Hub' }
        }
      }
    }),
    ...overrides
  };
}

export function createMockMaterial(overrides = {}) {
  return {
    ...createEntity({
      uid: 'material-demo-aluminum',
      name: 'Aluminum Composite Panel',
      slug: 'aluminum-composite-panel',
      state: 'ACTIVE',
      data: {
        code: 'ACP',
        description: 'Aluminum composite panel material'
      }
    }),
    ...overrides
  };
}

export function createMockPile(overrides = {}) {
  const stock = { total: 100, used: 25 };
  const specs = { sheetThickness: 4, foilThickness: 0.5, width: 3000, length: 1500, area: 4.5 };
  return {
    ...createEntity({
      uid: 'pile-demo-001',
      name: 'Alucobond Silver',
      serial: 'P-101',
      state: 'STOCKED',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        warehouseId: MOCK_IDS.warehouseId,
        catalogId: MOCK_IDS.catalogId
      },
      specs,
      data: { serial: 'MAN-P-101', material: 'ALUMINUM', specs, stock, quantity: stock.total }
    }),
    ...overrides
  };
}

export function createMockBatchPile(overrides = {}) {
  const stock = { total: 50, used: 8 };
  const specs = { sheetThickness: 4, foilThickness: 0.5, width: 1500, length: 3000, area: 4.5 };
  return {
    ...createEntity({
      uid: 'batch-pile-demo-001',
      name: 'Batch Pile REQ-2025-001 / P-003',
      slug: 'batch-pile-req-2025-001-p-003',
      serial: 'P-003',
      state: 'STOCKED',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        warehouseId: MOCK_IDS.warehouseId,
        catalogId: MOCK_IDS.catalogId,
        requisitionId: 'requisition-demo-001'
      },
      specs,
      data: { serial: 'REQ-2025-001-P-003', specs, stock, quantity: stock.total }
    }),
    ...overrides
  };
}

export function createMockRemnant(overrides = {}) {
  return {
    ...createEntity({
      uid: 'remnant-demo-001',
      name: 'Remnant REM-2025-X1',
      serial: 'REM-2025-X1',
      state: 'AVAILABLE',
      lineage: { warehouseId: MOCK_IDS.warehouseId, sheetId: 'sheet-demo-001' },
      specs: { width: 900, length: 500, area: 0.45, sheetThickness: 4 },
      data: {
        isReusable: true,
        geometry: {
          preview: {
            viewBox: '0 0 120 80',
            points: [[10, 10], [110, 16], [96, 70], [22, 58]]
          }
        }
      },
      lifecycle: {
        data: {
          location: { type: 'coordinates', coordinates: { x: 12, y: 4, z: 1 } }
        }
      }
    }),
    ...overrides
  };
}

export function createMockCatalog(overrides = {}) {
  const pricing = { pricePerSqm: 45, currency: 'USD' };
  const options = { sheetThicknesses: [3, 4, 6], foilThicknesses: [0.3, 0.5] };
  return {
    ...createEntity({
      uid: MOCK_IDS.catalogId,
      name: 'Standard Metals',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId, manufacturerId: MOCK_IDS.manufacturerId },
      data: { material: 'ALUMINUM', pricing, options },
      summary: { colorCount: 8 }
    }),
    ...overrides
  };
}

export function createMockColor(overrides = {}) {
  return {
    ...createEntity({
      uid: 'color-demo-ral-9016',
      name: 'Traffic White',
      serial: 'RAL-9016',
      state: 'ACTIVE',
      lineage: { catalogId: MOCK_IDS.catalogId },
      data: { code: 'RAL-9016', visuals: { hexCode: '#F6F6F6', textureUrl: null } }
    }),
    ...overrides
  };
}

export function createMockWarehouse(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.warehouseId,
      name: 'Main Logistic Hub',
      serial: 'WH-01',
      reference: 'SEC-A',
      state: 'ACTIVE',
      lineage: { organizationId: MOCK_IDS.organizationId },
      data: {
        type: 'MAIN',
        address: '123 Industrial Way, Tech City',
        contactPerson: 'Warehouse Manager',
        stats: { totalSheets: 120, totalRemnants: 14 }
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

export function createMockRequisition(overrides = {}) {
  const items = [
    { catalogId: MOCK_IDS.catalogId, quantity: 50, specs: { width: 1500, length: 3000, area: 4.5 } },
    { catalogId: MOCK_IDS.catalogId, quantity: 20, specs: { width: 1250, length: 2500, area: 3.125 } }
  ];
  return {
    ...createEntity({
      uid: 'requisition-demo-001',
      name: 'Q1 Material Order',
      serial: 'REQ-2025-001',
      state: 'SENT',
      lineage: { organizationId: MOCK_IDS.organizationId, projectId: MOCK_IDS.projectId },
      data: { items, notes: ['Priority delivery requested.'], requisitionNumber: 'REQ-2025-001', totalPrice: 12500, currency: 'USD' }
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
      state: 'GENERATING',
      lineage: { queueId: MOCK_IDS.queueId, runId: MOCK_IDS.runId },
      attachments: { primary: attachment },
      data: { type: 'LAYOUT_DXF', metadata: { requestedBy: 'ui-lab' } }
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
