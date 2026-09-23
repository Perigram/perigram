// Residual fact vocabulary for types that are NOT yet declared in the
// type system (Phase 6, one fact vocabulary). Every type that IS declared
// — framework, tech-drawing, documents, the CNC pack — carries its fact
// groups as authored `render.groups` on its declaration, compiled into
// the served CTS client bundle. This map remains only for legacy domain
// entities with no CTS declaration yet:
//
// - production entity family (project, queue, nestingRun, sheet, remnant,
//   catalog, material, library, materialPile, batchPile, requisition,
//   cassetteDesign, cassetteInstance, geometryCapture) — their type
//   declarations do not exist; they migrate as the entities are declared.
// - master-data and artifact entities (toolProfile, machine,
//   profileTemplate, cassetteTemplate, artifactTemplate) — same: no
//   declaration; the artifact family lands with Phase 7's file-paper cut.
//
// Nothing new may be added here: declare the type and author its
// `render.groups` instead. `utils/instance-display-contract.js` resolves
// bundle-declared groups FIRST; this map is the fallback for the keys
// above only.
export const cncInstanceFieldGroups = {
  project: {
    summary: [
      { path: 'summary.queueCount', i18n: 'project.queues', display: 'count', role: 'childCount', priority: 10 },
      { path: 'summary.queuePreview', i18n: 'project.queues', display: 'entityRefList', typeId: 'queue', replacesCountPath: 'summary.queueCount', priority: 15 },
      { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²', display: 'area', priority: 20 }
    ]
  },
  queue: {
    identity: [
      { path: 'data.queueNumber', i18n: 'queue.name', display: 'text', priority: 10 }
    ],
    summary: [
      { path: 'relations.cassettes', i18n: 'queue.jobItems', display: 'entityRefList', typeId: 'cassetteDesign', priority: 10 },
      { path: 'summary.runCount', i18n: 'queue.nestingRuns', display: 'count', role: 'childCount', priority: 20 },
      { path: 'summary.runPreview', i18n: 'queue.nestingRuns', display: 'entityRefList', typeId: 'nestingRun', replacesCountPath: 'summary.runCount', priority: 25 },
      { path: 'summary.sheetCount', i18n: 'results.sheets', display: 'count', role: 'childCount', priority: 30 },
      { path: 'summary.sheetPreview', i18n: 'results.sheets', display: 'entityRefList', typeId: 'sheet', replacesCountPath: 'summary.sheetCount', priority: 35 },
      { path: 'summary.totalArea', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 40 }
    ],
    production: [
      { path: 'data.job.materialPool', i18n: 'queue.materialConsumption', display: 'entityRefList', priority: 50 },
      { path: 'data.physicalOutputs', i18n: 'common.source', display: 'entityRefList', priority: 60 }
    ]
  },
  nestingRun: {
    summary: [
      { path: 'data.results.sheetCount', i18n: 'results.sheets', display: 'count', priority: 10 },
      { path: 'data.results.efficiency', i18n: 'sheetDesign.utilization', suffix: '%', display: 'percent', priority: 20 },
      { path: 'data.results.remnantArea', i18n: 'results.area', suffix: ' m²', display: 'area', priority: 30 }
    ],
    production: [
      { path: 'data.materialPool', i18n: 'queue.materialConsumption', display: 'entityRefList', priority: 40 },
      { path: 'data.sheetDesignIds', i18n: 'entities.sheetDesign', display: 'entityRefList', typeId: 'sheetDesign', priority: 50 }
    ]
  },
  cassetteTemplate: {
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
    ],
    provenance: [
      { path: 'data.geometryRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', typeId: 'entityRevision', priority: 30 }
    ]
  },
  cassetteDesign: {
    summary: [
      {
        path: 'data.parameters',
        fallbackPaths: ['provenance.derivedFrom.parameters'],
        i18n: 'cassette.parametersTitle',
        display: 'parameterMap',
        priority: 10
      }
    ],
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
    ],
    provenance: [
      { path: 'provenance.derivedFrom.source', i18n: 'revision.sourceRevision', display: 'entityRef', priority: 40 }
    ]
  },
  cassetteInstance: {
    summary: [
      { path: 'identity.reference', i18n: 'common.reference', display: 'text', priority: 10 }
    ],
    relations: [
      { path: 'data.cassetteDesignId', i18n: 'entities.cassetteDesign', display: 'entityRef', typeId: 'cassetteDesign', priority: 20 }
    ]
  },
  requisition: {
    summary: [
      { path: 'data.items.length', i18n: 'requisition.items', display: 'count', priority: 10 },
      { path: 'data.totalPrice', i18n: 'common.subtotal', prefix: '$', display: 'money', priority: 20 }
    ],
    relations: [
      { path: 'data.manufacturerId', i18n: 'entities.organization', display: 'entityRef', typeId: 'organization', priority: 30 },
      { path: 'data.projectId', i18n: 'entities.project', display: 'entityRef', typeId: 'project', priority: 40 }
    ]
  },
  material: {
    summary: [
      { path: 'data.code', i18n: 'common.code', display: 'text', priority: 10 },
      { path: 'data.description', i18n: 'common.description', display: 'text', priority: 20 }
    ]
  },
  library: {
    summary: [
      { path: 'summary.cassetteCount', i18n: 'entities.cassette', display: 'count', role: 'childCount', priority: 10 },
      { path: 'summary.cassettePreview', i18n: 'entities.cassette', display: 'entityRefList', typeId: 'cassette', replacesCountPath: 'summary.cassetteCount', priority: 15 },
      { path: 'data.material', i18n: 'entities.material', display: 'objectSummary', priority: 20 },
      { path: 'data.description', i18n: 'common.description', display: 'text', priority: 30 }
    ]
  },
  materialPile: {
    stock: [
      { path: 'data.stock.total', i18n: 'piles.stockTotal', display: 'count', priority: 10 },
      { path: 'data.stock.used', i18n: 'piles.stockUsed', display: 'count', priority: 20 }
    ],
    relations: [
      { path: 'data.catalog', i18n: 'entities.catalog', display: 'entityRef', typeId: 'catalog', priority: 30 }
    ]
  },
  batchPile: {
    stock: [
      { path: 'data.serial', i18n: 'piles.receiptId', display: 'text', priority: 10 },
      { path: 'data.stock.total', i18n: 'piles.stockTotal', display: 'count', priority: 20 },
      { path: 'data.stock.used', i18n: 'piles.stockUsed', display: 'count', priority: 30 }
    ],
    relations: [
      { path: 'lineage.requisitionId', i18n: 'entities.requisition', display: 'entityRef', typeId: 'requisition', priority: 40 }
    ]
  },
  sheet: {
    identity: [
      { path: 'specs.color', i18n: 'sheets.materialColor', display: 'text', priority: 10 },
      { path: 'specs.material', i18n: 'sheets.material', display: 'text', priority: 20 }
    ],
    specs: [
      { path: 'specs.width', i18n: 'queue.width', suffix: ' mm', display: 'dimension', priority: 10 },
      { path: 'specs.length', i18n: 'queue.length', suffix: ' mm', display: 'dimension', priority: 20 },
      { path: 'specs.area', i18n: 'common.area', suffix: ' m²', display: 'area', priority: 30 }
    ]
  },
  remnant: {
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 10 }
    ],
    specs: [
      { path: 'specs.area', i18n: 'results.area', suffix: ' m²', display: 'area', priority: 15 }
    ],
    relations: [
      { path: 'data.source.sheetId', i18n: 'entities.sheet', display: 'entityRef', typeId: 'sheet', priority: 20 }
    ]
  },
  catalog: {
    summary: [
      { path: 'summary.colorCount', i18n: 'catalog.colorsAvailable', display: 'count', role: 'childCount', priority: 10 },
      { path: 'summary.colorPreview', i18n: 'catalog.colorsAvailable', display: 'entityRefList', typeId: 'color', replacesCountPath: 'summary.colorCount', priority: 15 },
      { path: 'data.options.sheetThicknesses', i18n: 'catalog.sheetThicknessOptions', suffix: ' mm', display: 'list', priority: 20 },
      { path: 'data.options.foilThicknesses', i18n: 'catalog.foilThicknessOptions', suffix: ' mm', display: 'list', priority: 30 },
      { path: 'data.pricing.pricePerSqm', i18n: 'catalog.pricePerSqm', prefix: '$', display: 'money', priority: 40 }
    ],
    relations: [
      { path: 'lineage.manufacturerId', i18n: 'entities.organization', display: 'entityRef', typeId: 'organization', priority: 50 }
    ]
  },
  geometryCapture: {
    summary: [
      { path: 'data.mode', i18n: 'geometryCapture.mode', display: 'text', priority: 10 },
      { path: 'data.extraction.preset', i18n: 'geometryCapture.detectorPreset', display: 'text', priority: 20 },
      { path: 'data.extraction.confidence', i18n: 'geometryCapture.confidence', display: 'percent', priority: 30 },
      { path: 'specs.area', i18n: 'results.area', suffix: ' m²', display: 'area', priority: 40 },
      { path: 'specs.width', i18n: 'geometryCapture.width', suffix: ' mm', display: 'dimension', priority: 50 },
      { path: 'specs.height', i18n: 'geometryCapture.height', suffix: ' mm', display: 'dimension', priority: 60 }
    ],
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 10 }
    ],
    relations: [
      { path: 'data.output.warehouseId', i18n: 'entities.warehouse', display: 'entityRef', typeId: 'warehouse', priority: 70 },
      { path: 'data.output.projectId', i18n: 'entities.project', display: 'entityRef', typeId: 'project', priority: 80 }
    ]
  },
  profileTemplate: {
    summary: [
      { path: 'data.kind', i18n: 'cassette.v2.profileEditor.kind', display: 'text', priority: 10 },
      { path: 'data.process', i18n: 'cassette.v2.profileEditor.process', display: 'text', priority: 20 }
    ]
  },
  warehouse: {
    summary: [
      { path: 'data.type', i18n: 'warehouse.type', display: 'text', priority: 10 },
      { path: 'data.address', i18n: 'warehouse.address', display: 'text', priority: 20 },
      { path: 'data.contactPerson', i18n: 'warehouse.contactPerson', display: 'text', priority: 30 },
      { path: 'data.stats.totalSheets', i18n: 'warehouse.rawSheets', display: 'count', priority: 40 },
      { path: 'data.stats.totalRemnants', i18n: 'warehouse.remnants', display: 'count', priority: 50 }
    ]
  },
  toolProfile: {
    summary: [
      { path: 'data.diameter', i18n: 'toolProfile.diameter', suffix: ' mm', display: 'dimension', priority: 10 },
      { path: 'data.angle', i18n: 'toolProfile.angle', suffix: '°', display: 'angle', priority: 20 },
      { path: 'data.kerf', i18n: 'toolProfile.kerf', suffix: ' mm', display: 'dimension', priority: 30 }
    ]
  },
  machine: {
    summary: [
      { path: 'data.workingArea.width', i18n: 'machine.width', suffix: ' mm', display: 'dimension', priority: 10 },
      { path: 'data.workingArea.length', i18n: 'machine.length', suffix: ' mm', display: 'dimension', priority: 20 },
      { path: 'data.boundaryOffset', i18n: 'machine.boundaryOffset', suffix: ' mm', display: 'dimension', priority: 30 }
    ]
  },
  artifactTemplate: {
    summary: [
      { path: 'data.format', i18n: 'file.type', display: 'text', priority: 10 },
      { path: 'data.variables.length', i18n: 'artifactTemplates.variables', display: 'count', priority: 20 }
    ],
    provenance: [
      { path: 'data.activeRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', typeId: 'entityRevision', priority: 30 }
    ]
  }
};


const PARENT_REVISION_FIELD = {
  path: 'provenance.parent.source',
  i18n: 'revision.parentRevision',
  display: 'entityRef',
  priority: 90
};

const PINNED_PARENT_ENTITY_KEYS = [
  'cassetteInstance',
  'nestingRun',
  'queue',
  'remnant'
];

for (const key of PINNED_PARENT_ENTITY_KEYS) {
  const groups = cncInstanceFieldGroups[key];
  if (!groups) continue;
  groups.provenance = [
    ...(groups.provenance || []),
    ...(groups.provenance?.some(field => field.path === PARENT_REVISION_FIELD.path) ? [] : [PARENT_REVISION_FIELD])
  ];
}

export function getEntityFieldGroups(entityKey) {
  return cncInstanceFieldGroups[entityKey] || {};
}
