/**
 * Mock Data Factories for UI Lab - v24 Standardized
 */
import { ObjectId } from 'bson';

const createStatusBlock = (state, userId = 'user-123', meta = {}) => ({
  state,
  userId,
  timestamp: new Date(),
  metadata: meta,
  eventId: new ObjectId()
});

// Stable mock IDs shared across all factories so TraceChain links are consistent
const MOCK_IDS = {
  orgId: 'mock-org-acme',
  warehouseId: 'mock-warehouse-main',
  projectId: 'mock-project-downtown',
  queueId: 'mock-queue-morning',
  catalogId: 'mock-catalog-primary',
  runId: 'mock-run-001',
};

export function createMockProject(overrides = {}) {
  const origin = createStatusBlock('DRAFT');
  return {
    _id: new ObjectId(),
    identity: { slug: 'mock-project', name: 'Downtown Complex' },
    origin,
    status: origin,
    lineage: { organizationId: MOCK_IDS.orgId },
    summary: { totalArea: 150.5, queueCount: 3 },
    ...overrides
  };
}

export function createMockQueue(overrides = {}) {
  const origin = createStatusBlock('PENDING');
  return {
    _id: new ObjectId(),
    identity: { name: 'Morning Production Run', queueNumber: 1 },
    origin,
    status: origin,
    lineage: { organizationId: MOCK_IDS.orgId, projectId: MOCK_IDS.projectId },
    job: {
      items: [{ designId: new ObjectId(), quantity: 10, parameters: { A: 1200, B: 400 } }],
      materialPool: [{ type: 'PILE', id: new ObjectId() }]
    },
    ...overrides
  };
}

export function createMockSheet(overrides = {}) {
  const origin = createStatusBlock('AVAILABLE');
  return {
    _id: new ObjectId(),
    identity: { name: 'Sheet SH-2025-001', serial: 'SH-2025-001' },
    origin,
    status: origin,
    lineage: { 
      organizationId: MOCK_IDS.orgId,
      warehouseId: MOCK_IDS.warehouseId,
      queueId: MOCK_IDS.queueId,
      runId: MOCK_IDS.runId
    },
    specs: { width: 2000, length: 1000, area: 2.0 },
    ...overrides
  };
}

export function createMockSheetDesign(overrides = {}) {
  const origin = createStatusBlock('READY');
  return {
    _id: new ObjectId(),
    identity: { name: 'Sheet Design SD-NEST-001', serial: 'SD-NEST-001' },
    origin,
    status: origin,
    lineage: { queueId: MOCK_IDS.queueId, runId: MOCK_IDS.runId },
    specs: { width: 2000, length: 1000, area: 2.0 },
    ...overrides
  };
}

export function createMockCassetteDesign(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { serial: 'CD-FACADE-01', name: 'Standard Type A' },
    lineage: { projectId: MOCK_IDS.projectId },
    parameters: { width: 1200, height: 450, depth: 30 },
    ...overrides
  };
}

export function createMockCassetteInstance(overrides = {}) {
  const status = createStatusBlock('MILLED');
  return {
    _id: new ObjectId(),
    identity: { serial: 'INST-0001', name: 'Instance Panel-A-01', reference: 'Panel-A-01' },
    status,
    lineage: { 
      projectId: MOCK_IDS.projectId,
      queueId: MOCK_IDS.queueId,
      runId: MOCK_IDS.runId
    },
    ...overrides
  };
}

export function createMockRemnant(overrides = {}) {
  const status = createStatusBlock('SCRAP');
  return {
    _id: new ObjectId(),
    identity: { name: 'Remnant REM-2025-X1', serial: 'REM-2025-X1' },
    status,
    lineage: { warehouseId: MOCK_IDS.warehouseId },
    serial: 'REM-2025-X1',
    isReusable: false,
    data: { serial: 'REM-2025-X1', area: 0.45, width: 900, height: 500, isReusable: false },
    ...overrides
  };
}

export function createMockWarehouse(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { name: 'Main Logistic Hub', serial: 'WH-01', reference: 'SEC-A' },
    lineage: { organizationId: MOCK_IDS.orgId },
    address: '123 Industrial Way, Tech City',
    type: 'MAIN',
    ...overrides
  };
}

export function createMockRequisition(overrides = {}) {
  const origin = createStatusBlock('SUBMITTED');
  return {
    _id: new ObjectId(),
    identity: { name: 'Q1 Material Order', serial: 'REQ-2025-001' },
    origin,
    status: origin,
    lineage: { organizationId: MOCK_IDS.orgId, projectId: MOCK_IDS.projectId },
    items: [
      { catalogId: MOCK_IDS.catalogId, quantity: 50, specs: { width: 1500, length: 3000 } },
      { catalogId: MOCK_IDS.catalogId, quantity: 20, specs: { width: 1250, length: 2500 } }
    ],
    metadata: { notes: 'Priority delivery requested for Monday morning.' },
    ...overrides
  };
}

export function createMockPile(overrides = {}) {
  const origin = createStatusBlock('STOCKED');
  return {
    _id: new ObjectId(),
    identity: { name: 'Alucobond Silver', serial: 'P-101' },
    origin,
    status: origin,
    lineage: { organizationId: MOCK_IDS.orgId, warehouseId: MOCK_IDS.warehouseId, catalogId: MOCK_IDS.catalogId },
    specs: { sheetThickness: 4, foilThickness: 0.5, width: 3000, height: 1500 },
    stock: { total: 100, used: 25 },
    ...overrides
  };
}

export function createMockCatalog(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { name: 'Standard Metals' },
    material: 'ALUMINUM',
    pricing: { pricePerSqm: 45, currency: 'USD' },
    options: { sheetThicknesses: [3, 4, 6], foilThicknesses: [0.3, 0.5] },
    ...overrides
  };
}

export function createMockStatistics() {
  return {
    sheetsUsed: 12,
    totalAreaUsed: 45.5,
    utilizationRate: 87.4,
    totalCost: 15678.90
  };
}

export function createMockHistory(statuses = ['DRAFT', 'ACTIVE', 'CLOSED']) {

  return statuses.map((s, i) => ({

    _id: new ObjectId(),

    targetId: new ObjectId(),

    targetType: 'Project',

    toState: s,

    timestamp: new Date(Date.now() - (statuses.length - i) * 3600000),

    status: createStatusBlock(s, 'user-123', { note: `Step ${i+1}` })

  }));

}



export function createMockUser(overrides = {}) {

  return {

    _id: 'user-123',

    identity: { name: 'John Doe', email: 'john@example.com', avatarUrl: null },

    status: createStatusBlock('ACTIVE'),

    ...overrides

  };

}



export function createMockOrganization(overrides = {}) {

  return {

    _id: new ObjectId(),

    identity: { name: 'Acme Manufacturing', slug: 'acme-mfg' },

    type: 'FABRICATOR',

    ...overrides

  };

}



export function createMockArtifact(overrides = {}) {

  return {

    _id: new ObjectId(),

    identity: { name: 'Drawing_Final_v2.dxf' },

    type: 'DXF',

    fileId: 'file-999',

    ...overrides

  };

}



export function createMockColor(overrides = {}) {

  return {

    _id: new ObjectId(),

    identity: { name: 'Traffic White', serial: 'RAL-9016' },

    data: { code: 'RAL-9016', visuals: { hexCode: '#F6F6F6', textureUrl: null } },

    ...overrides

  };

}



export function createMockNestingRun(overrides = {}) {

  return {

    _id: new ObjectId(),

    identity: { name: 'Run #1' },

    status: createStatusBlock('ACCEPTED'),

    lineage: { organizationId: MOCK_IDS.orgId, projectId: MOCK_IDS.projectId, queueId: MOCK_IDS.queueId },

    results: { efficiency: 92.4, sheetCount: 5, remnantArea: 1.2 },

    ...overrides

  };

}



export function createMockToolProfile(overrides = {}) {



  return {



    _id: new ObjectId(),



    identity: { name: 'Flat Endmill 4mm' },



    diameter: 4,



    angle: 180,



    ...overrides



  };



}







export function createMockPenTemplate(overrides = {}) {



  return {



    _id: new ObjectId(),



    identity: { name: 'Cutting Pen' },



    stroke: {



      color: '#FF0000',



      weight: 2,



      pattern: 'SOLID'



    },



    ...overrides



  };



}







export function createMockLayerStandard(overrides = {}) {

  return {

    _id: new ObjectId(),

    identity: { name: 'Exterior Facade' },

    code: 'FACADE_EXT',

    category: 'MILLING',

    metadata: { color: '#3b82f6' },

    defaultPenId: new ObjectId(),

    ...overrides

  };

}

export function createMockCassetteTemplate(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { uid: 'cassette-tpl-abc123', name: 'Standard 600x400', slug: 'standard-600x400' },
    origin: { userId: 'user-123', timestamp: new Date() },
    status: createStatusBlock('ACTIVE'),
    lineage: { organizationId: new ObjectId().toString() },
    data: {
      definition: 'PARAMETRIC',
      type: 'RECTANGULAR',
      parameters: [{ name: 'width', value: 600 }, { name: 'height', value: 400 }],
      organizationId: 'org-123',
      userId: 'user-123'
    },
    attachments: [],
    ...overrides
  };
}

export function createMockBatchPile(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { uid: 'pile-abc123', name: 'Pile #3', slug: 'pile-abc123' },
    origin: { userId: 'user-123', timestamp: new Date() },
    status: createStatusBlock('AVAILABLE'),
    lineage: { organizationId: new ObjectId().toString(), warehouseId: new ObjectId().toString() },
    specs: { thickness: 18, material: 'MDF', color: 'White' },
    stock: { total: 20, used: 7 },
    ...overrides
  };
}
