export const cncEntityFieldGroups = {
  project: {
    summary: [
      { path: 'summary.queueCount', i18n: 'project.queues', display: 'count', role: 'childCount', priority: 10 },
      { path: 'summary.queuePreview', i18n: 'project.queues', display: 'entityRefList', entityType: 'queue', replacesCountPath: 'summary.queueCount', priority: 15 },
      { path: 'summary.totalArea', i18n: 'project.totalArea', suffix: ' m²', display: 'area', priority: 20 }
    ]
  },
  queue: {
    identity: [
      { path: 'data.queueNumber', i18n: 'queue.name', display: 'text', priority: 10 }
    ],
    summary: [
      { path: 'data.job.items.length', i18n: 'queue.jobItems', display: 'count', priority: 10 },
      { path: 'summary.runCount', i18n: 'queue.nestingRuns', display: 'count', role: 'childCount', priority: 20 },
      { path: 'summary.runPreview', i18n: 'queue.nestingRuns', display: 'entityRefList', entityType: 'nestingRun', replacesCountPath: 'summary.runCount', priority: 25 },
      { path: 'summary.sheetCount', i18n: 'results.sheets', display: 'count', role: 'childCount', priority: 30 },
      { path: 'summary.sheetPreview', i18n: 'results.sheets', display: 'entityRefList', entityType: 'sheet', replacesCountPath: 'summary.sheetCount', priority: 35 },
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
      { path: 'data.sheetDesignIds', i18n: 'entities.sheetDesign', display: 'entityRefList', entityType: 'sheetDesign', priority: 50 }
    ]
  },
  sheetDesign: {
    specs: [
      { path: 'summary.efficiency', i18n: 'sheetDesign.utilization', suffix: '%', display: 'percent', priority: 10 },
      { path: 'summary.placedCount', i18n: 'sheetDesign.parts', display: 'count', priority: 20 },
      { path: 'specs.cuttingLength', i18n: 'sheetDesign.cuttingLength', suffix: ' m', display: 'dimension', priority: 30 },
      { path: 'specs.estimatedTime', i18n: 'sheetDesign.estimatedTime', suffix: ' min', display: 'duration', priority: 40 }
    ],
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 10 }
    ]
  },
  cassette: {
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
    ],
    provenance: [
      { path: 'data.geometryRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', entityType: 'entityRevision', priority: 30 }
    ]
  },
  cassetteTemplate: {
    geometry: [
      { path: 'data.geometry.preview', i18n: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
    ],
    provenance: [
      { path: 'data.geometryRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', entityType: 'entityRevision', priority: 30 }
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
      { path: 'data.cassetteDesignId', i18n: 'entities.cassetteDesign', display: 'entityRef', entityType: 'cassetteDesign', priority: 20 }
    ]
  },
  requisition: {
    summary: [
      { path: 'data.items.length', i18n: 'requisition.items', display: 'count', priority: 10 },
      { path: 'data.totalPrice', i18n: 'common.subtotal', prefix: '$', display: 'money', priority: 20 }
    ],
    relations: [
      { path: 'data.manufacturerId', i18n: 'entities.organization', display: 'entityRef', entityType: 'organization', priority: 30 },
      { path: 'data.projectId', i18n: 'entities.project', display: 'entityRef', entityType: 'project', priority: 40 }
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
      { path: 'summary.cassettePreview', i18n: 'entities.cassette', display: 'entityRefList', entityType: 'cassette', replacesCountPath: 'summary.cassetteCount', priority: 15 },
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
      { path: 'data.catalog', i18n: 'entities.catalog', display: 'entityRef', entityType: 'catalog', priority: 30 }
    ]
  },
  batchPile: {
    stock: [
      { path: 'data.serial', i18n: 'piles.receiptId', display: 'text', priority: 10 },
      { path: 'data.stock.total', i18n: 'piles.stockTotal', display: 'count', priority: 20 },
      { path: 'data.stock.used', i18n: 'piles.stockUsed', display: 'count', priority: 30 }
    ],
    relations: [
      { path: 'lineage.requisitionId', i18n: 'entities.requisition', display: 'entityRef', entityType: 'requisition', priority: 40 }
    ]
  },
  sheet: {
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
    relations: [
      { path: 'data.source.sheetId', i18n: 'entities.sheet', display: 'entityRef', entityType: 'sheet', priority: 20 }
    ]
  },
  catalog: {
    summary: [
      { path: 'summary.colorCount', i18n: 'catalog.colorsAvailable', display: 'count', role: 'childCount', priority: 10 },
      { path: 'summary.colorPreview', i18n: 'catalog.colorsAvailable', display: 'entityRefList', entityType: 'color', replacesCountPath: 'summary.colorCount', priority: 15 },
      { path: 'data.options.sheetThicknesses', i18n: 'catalog.sheetThicknessOptions', suffix: ' mm', display: 'list', priority: 20 },
      { path: 'data.options.foilThicknesses', i18n: 'catalog.foilThicknessOptions', suffix: ' mm', display: 'list', priority: 30 },
      { path: 'data.pricing.pricePerSqm', i18n: 'catalog.pricePerSqm', prefix: '$', display: 'money', priority: 40 }
    ],
    relations: [
      { path: 'lineage.manufacturerId', i18n: 'entities.organization', display: 'entityRef', entityType: 'organization', priority: 50 }
    ]
  },
  color: {
    relations: [
      { path: 'lineage.catalogId', i18n: 'entities.catalog', display: 'entityRef', entityType: 'catalog', priority: 10 }
    ]
  },
  entityRevision: {
    summary: [
      { path: 'data.scope', i18n: 'revision.scope', display: 'text', priority: 10 },
      { path: 'data.number', i18n: 'revision.number', prefix: 'v', display: 'number', priority: 20 },
      { path: 'data.shortHash', i18n: 'revision.hash', display: 'code', priority: 30 }
    ],
    relations: [
      { path: 'data.source', i18n: 'revision.source', display: 'entityRef', priority: 40 }
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
      { path: 'data.output.warehouseId', i18n: 'entities.warehouse', display: 'entityRef', entityType: 'warehouse', priority: 70 },
      { path: 'data.output.projectId', i18n: 'entities.project', display: 'entityRef', entityType: 'project', priority: 80 }
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
  penTemplate: {
    summary: [
      { path: 'data.stroke.color', i18n: 'penTemplate.color', display: 'color', priority: 10 },
      { path: 'data.stroke.weight', i18n: 'penTemplate.weight', suffix: ' mm', display: 'dimension', priority: 20 },
      { path: 'data.stroke.pattern', i18n: 'penTemplate.pattern', display: 'text', priority: 30 }
    ]
  },
  layerStandard: {
    summary: [
      { path: 'data.code', i18n: 'common.code', display: 'code', priority: 10 },
      { path: 'data.category', i18n: 'common.type', display: 'text', priority: 20 }
    ],
    relations: [
      { path: 'data.defaultPenId', i18n: 'entities.penTemplate', display: 'entityRef', entityType: 'penTemplate', priority: 30 },
      { path: 'data.orgPenId', i18n: 'entities.penTemplate', display: 'entityRef', entityType: 'penTemplate', priority: 40 }
    ]
  },
  user: {
    summary: [
      { path: 'data.email', i18n: 'profile.email', display: 'email', priority: 10 },
      { path: 'identity.reference', i18n: 'common.reference', display: 'text', priority: 20 }
    ]
  },
  organization: {
    summary: [
      { path: 'data.type', i18n: 'organization.type', display: 'text', priority: 10 },
      { path: 'data.email', i18n: 'profile.email', display: 'email', priority: 20 },
      { path: 'data.phone', i18n: 'profile.phone', display: 'phone', priority: 30 }
    ]
  },
  artifact: {
    summary: [
      { path: 'data.type', i18n: 'file.type', display: 'text', priority: 10 },
      { path: 'attachments.primary.name', fallbackPaths: ['data.filename'], i18n: 'file.name', display: 'text', priority: 20 }
    ],
    relations: [
      { path: 'lineage.nestingRunId', i18n: 'entities.nestingRun', display: 'entityRef', entityType: 'nestingRun', priority: 40 }
    ]
  },
  artifactTemplate: {
    summary: [
      { path: 'data.format', i18n: 'file.type', display: 'text', priority: 10 },
      { path: 'data.variables.length', i18n: 'artifactTemplates.variables', display: 'count', priority: 20 }
    ],
    provenance: [
      { path: 'data.activeRevisionId', i18n: 'revision.currentGeometry', display: 'entityRef', entityType: 'entityRevision', priority: 30 }
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
  'cassette',
  'cassetteInstance',
  'color',
  'nestingRun',
  'queue',
  'remnant',
  'sheet',
  'sheetDesign'
];

for (const key of PINNED_PARENT_ENTITY_KEYS) {
  const groups = cncEntityFieldGroups[key];
  if (!groups) continue;
  groups.provenance = [
    ...(groups.provenance || []),
    ...(groups.provenance?.some(field => field.path === PARENT_REVISION_FIELD.path) ? [] : [PARENT_REVISION_FIELD])
  ];
}

export function getEntityFieldGroups(entityKey) {
  return cncEntityFieldGroups[entityKey] || {};
}
