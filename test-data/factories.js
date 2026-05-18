/**
 * v24 DTO factories used by UI lab and lightweight component tests.
 *
 * Factories model API DTOs, not raw MongoDB documents. They keep only
 * canonical blocks (`identity`, `origin`, `status`, `lineage`, `attachments`,
 * `data`, `summary`, `specs`) plus root `_id`.
 */
import { ObjectId } from 'bson';

const now = () => new Date();
const id = (prefix) => `${prefix}-${new ObjectId().toString().slice(-8)}`;

const createStatusBlock = (state = 'DRAFT', userId = 'user-demo', metadata = {}) => ({
  state,
  userId,
  timestamp: now(),
  metadata,
  eventId: new ObjectId()
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
  summary = {}
}) => {
  const origin = createStatusBlock(state, 'user-demo', { note: 'Demo entity created' });
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
  warehouseId: 'wh-demo-main',
  projectId: 'project-demo-downtown',
  queueId: 'queue-demo-morning',
  runId: 'run-demo-001',
  catalogId: 'catalog-demo-acm',
  sheetDesignId: 'sheet-design-demo-001',
  cassetteTemplateId: 'cassette-template-demo-001',
  cassetteDesignId: 'cassette-design-demo-001'
};

export function createMockProject(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.projectId,
      name: 'Downtown Complex',
      slug: 'downtown-complex',
      state: 'DRAFT',
      lineage: { organizationId: MOCK_IDS.organizationId },
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
  const geometry = { svgId: 'svg-sheet-demo', dxfId: 'dxf-sheet-demo', data: null };
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
      data: { geometry, parameters }
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
      data: {}
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
      data: {}
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
      state: 'IN_STOCK',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        warehouseId: MOCK_IDS.warehouseId,
        catalogId: MOCK_IDS.catalogId
      },
      specs,
      data: { specs, stock, quantity: stock.total }
    }),
    ...overrides
  };
}

export function createMockBatchPile(overrides = {}) {
  return createMockPile({
    _id: 'batch-pile-demo-001',
    identity: { uid: 'batch-pile-demo-001', name: 'Pile #3', slug: 'pile-3', serial: 'P-003' },
    ...overrides
  });
}

export function createMockRemnant(overrides = {}) {
  return {
    ...createEntity({
      uid: 'remnant-demo-001',
      name: 'Remnant REM-2025-X1',
      serial: 'REM-2025-X1',
      state: 'SCRAP',
      lineage: { warehouseId: MOCK_IDS.warehouseId, sheetId: 'sheet-demo-001' },
      specs: { width: 900, length: 500, area: 0.45, sheetThickness: 4 },
      data: { isReusable: false }
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
      lineage: { organizationId: MOCK_IDS.organizationId },
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
  return {
    ...createEntity({
      uid: 'user-demo',
      name: 'John Doe',
      state: 'ACTIVE',
      data: {
        email: 'john@example.com',
        role: 'ManufacturerAdmin',
        isActive: true,
        permissions: {}
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
