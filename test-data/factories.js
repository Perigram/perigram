/**
 * v24 DTO factories used by UI lab and lightweight component tests.
 *
 * Factories model API DTOs, not raw MongoDB documents. They keep only
 * canonical blocks (`identity`, `origin`, `status`, `lineage`, `attachments`,
 * `relations`, `data`, `summary`, `specs`) plus root `_id`.
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
  queueRevisionId: 'entity-revision-nesting-demo-001',
  libraryId: 'library-demo-acm',
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
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
      relations: { libraries: [{ entityType: 'library', entityId: MOCK_IDS.libraryId }] },
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
      lineage: {
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        project: { entityType: 'project', entityId: MOCK_IDS.projectId }
      },
      data: { job, queueNumber: 'Q-001' },
      summary: { revisionCount: 2, sheetCount: 12, totalArea: 45.6 }
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
      lineage: { queue: { entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId } },
      specs: { width: 2000, length: 1000, area: 2, sheetThickness: 4 },
      data: { geometry }
    }),
    ...overrides
  };
}

export function createMockSheetInstance(overrides = {}) {
  return {
    ...createEntity({
      uid: 'sheet-instance-demo-001',
      name: 'Planned sheet #1',
      state: 'PLANNED',
      lineage: {
        queue: { entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId },
        sheetDesign: { entityType: 'sheet_design', entityId: MOCK_IDS.sheetDesignId }
      },
      specs: { width: 2000, length: 1000, area: 2, sheetThickness: 4 },
      data: { sheetDesignId: MOCK_IDS.sheetDesignId, sequence: 1, physicalSheetId: null }
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
      lineage: {
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        cassette: { entityType: 'cassette', entityId: MOCK_IDS.cassetteTemplateId }
      },
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
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
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
      lineage: {
        project: { entityType: 'project', entityId: MOCK_IDS.projectId },
        cassette: { entityType: 'cassette', entityId: MOCK_IDS.cassetteTemplateId, revisionId: MOCK_IDS.entityRevisionId }
      },
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
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        cassette: { entityType: 'cassette', entityId: MOCK_IDS.cassetteTemplateId }
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
        project: { entityType: 'project', entityId: MOCK_IDS.projectId },
        queue: { entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId },
        cassetteDesign: { entityType: 'cassette_design', entityId: MOCK_IDS.cassetteDesignId }
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
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        warehouse: { entityType: 'warehouse', entityId: MOCK_IDS.warehouseId },
        queue: { entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId }
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

export function createMockLibrary(overrides = {}) {
  return {
    ...createEntity({
      uid: MOCK_IDS.libraryId,
      name: 'ACP Cassette Library',
      slug: 'acp-cassette-library',
      state: 'ACTIVE',
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
      data: {
        material: { code: 'ACP', name: 'Aluminum Composite Panel' },
        description: 'Reusable cassette templates for aluminum composite panels'
      },
      summary: { cassetteCount: 4 }
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
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        warehouse: { entityType: 'warehouse', entityId: MOCK_IDS.warehouseId },
        catalog: { entityType: 'catalog', entityId: MOCK_IDS.catalogId }
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
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        warehouse: { entityType: 'warehouse', entityId: MOCK_IDS.warehouseId },
        catalog: { entityType: 'catalog', entityId: MOCK_IDS.catalogId },
        requisition: { entityType: 'requisition', entityId: 'requisition-demo-001' }
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
      lineage: {
        warehouse: { entityType: 'warehouse', entityId: MOCK_IDS.warehouseId },
        sheet: { entityType: 'sheet', entityId: 'sheet-demo-001' }
      },
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

export function createMockGeometryCapture(overrides = {}) {
  const geometry = {
    polygon: {
      outer: [[0, 0], [1200, 0], [1180, 680], [80, 720], [0, 0]],
      inner: [[[420, 180], [680, 180], [680, 360], [420, 360], [420, 180]]]
    },
    preview: {
      viewBox: '-50 -50 1300 820',
      layers: [
        { name: 'capture.outer', standardCode: 'cut.outer', paths: ['M0 0 L1200 0 L1180 680 L80 720 Z'] },
        { name: 'capture.holes', standardCode: 'cut.inner', paths: ['M420 180 L680 180 L680 360 L420 360 Z'] }
      ]
    }
  };
  return {
    ...createEntity({
      uid: 'geometry-capture-demo-001',
      name: 'Captured remnant draft',
      state: 'READY',
      lineage: {
        organizationId: MOCK_IDS.organizationId,
        warehouseId: MOCK_IDS.warehouseId
      },
      specs: { width: 1200, height: 720, area: 0.8172 },
      attachments: {
        primary: createAttachmentEntry('CAPTURE_PHOTO', 'capture-photo-demo-001', 'remnant-photo.jpg', {
          bucketName: 'capturePhotos',
          mimeType: 'image/jpeg'
        })
      },
      data: {
        mode: 'REMNANT',
        calibration: { mode: 'knownDimension', knownWidth: 1200 },
        geometry,
        extraction: {
          status: 'READY',
          confidence: 0.82,
          diagnostics: ['outer_vertices:4', 'holes:1', 'scale_mode:knownDimension']
        },
        output: null
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
      lineage: {
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        manufacturer: { entityType: 'organization', entityId: MOCK_IDS.manufacturerId }
      },
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
      lineage: { catalog: { entityType: 'catalog', entityId: MOCK_IDS.catalogId } },
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
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
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
      lineage: { user: { entityType: 'user', entityId: 'user-demo' } },
      data: { diameter: 4, angle: 180, kerf: 4, description: 'General cutting tool' }
    }),
    ...overrides
  };
}

export function createMockMachine(overrides = {}) {
  return {
    ...createEntity({
      uid: 'machine-demo-router',
      name: 'CNC Router 3000 x 1500',
      state: 'ACTIVE',
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
      data: {
        workArea: { width: 3000, length: 1500 },
        boundaryOffset: { top: 10, right: 10, bottom: 10, left: 10 }
      }
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
      lineage: { user: { entityType: 'user', entityId: 'user-demo' } },
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
      lineage: { user: { entityType: 'user', entityId: 'user-demo' } },
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
      lineage: {
        organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId },
        project: { entityType: 'project', entityId: MOCK_IDS.projectId }
      },
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
      lineage: { organization: { entityType: 'organization', entityId: MOCK_IDS.organizationId } },
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
      lineage: { queue: { entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId } },
      relations: { source: [{ entityType: 'queue', entityId: MOCK_IDS.queueId, revisionId: MOCK_IDS.queueRevisionId }] },
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
