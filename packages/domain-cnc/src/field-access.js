const COMMON_READ_FIELDS = [
  '_id',
  'identity.*',
  'origin.*',
  'states.*',
  'lineage.*',
  'relations.*',
  'provenance.*',
  'summary.*'
];

export const cncEntityFieldAccess = {
  facade: { feature: 'facades', read: [...COMMON_READ_FIELDS, 'data.parts', 'data.partAssignments', 'data.revisions'], write: ['relations.*', 'data.parts', 'data.partAssignments', 'data.revisions'], admin: ['identity.*', 'data.*', 'attachments.*'] },
  facade_pattern: { feature: 'facade_patterns', read: [...COMMON_READ_FIELDS, 'data.graph', 'data.revisions'], write: ['identity.name', 'data.graph', 'data.revisions'], admin: ['identity.*', 'data.*', 'attachments.*'] },
  project: {
    feature: 'projects',
    read: [...COMMON_READ_FIELDS, 'data.address', 'data.thumbnailUrl'],
    write: ['data.metadata', 'data.name'],
    admin: ['data.*', 'attachments.*']
  },
  queue: {
    feature: 'queues',
    read: [...COMMON_READ_FIELDS, 'data.queueNumber', 'data.job.items', 'data.job.materialPool', 'data.materialConsumption', 'data.physicalOutputs'],
    write: ['relations.cassettes', 'data.job.items', 'data.job.materialPool', 'data.nestingSettings.*'],
    admin: ['data.*', 'attachments.*']
  },
  nestingRun: {
    feature: 'nesting_runs',
    read: [...COMMON_READ_FIELDS, 'data.results.*', 'data.materialPool', 'data.sheetDesignIds'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  sheetDesign: {
    feature: 'sheet_designs',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.geometry.*', 'data.cassetteDesigns', 'data.materialPool', 'data.instanceIds', 'data.sheetIndex'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  cassette: {
    feature: 'cassettes',
    read: [...COMMON_READ_FIELDS, 'data.type', 'data.parameters', 'data.definition', 'data.revisions', 'data.geometry.*', 'data.layerData', 'data.polygonParts'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  library: {
    feature: 'libraries',
    read: [...COMMON_READ_FIELDS, 'data.material', 'data.description'],
    write: ['data.material', 'data.description'],
    admin: ['data.*', 'attachments.*']
  },
  cassetteTemplate: {
    feature: 'cassettes',
    read: [...COMMON_READ_FIELDS, 'data.type', 'data.parameters', 'data.definition', 'data.revisions', 'data.geometry.*', 'data.layerData', 'data.polygonParts'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  cassetteDesign: {
    feature: 'cassette_designs',
    read: [...COMMON_READ_FIELDS, 'data.parameters', 'data.geometry.*', 'data.layerData', 'data.polygonParts'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  cassetteInstance: {
    feature: 'projects',
    read: [...COMMON_READ_FIELDS, 'data.cassetteDesignId'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  material: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'data.code', 'data.description', 'data.type', 'data.color', 'data.thickness'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  materialPile: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.material', 'data.catalog', 'data.serial', 'data.stock', 'data.stockMovements'],
    write: ['data.*', 'specs.*'],
    admin: ['data.*', 'attachments.*']
  },
  processDefinition: {
    feature: 'organizations',
    read: [...COMMON_READ_FIELDS, 'data.schemaVersion', 'data.graph.*', 'data.roleGrants.*', 'data.entityProfiles.*', 'data.services.*', 'data.sockets.*', 'data.compiled.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  process_definition: {
    feature: 'organizations',
    read: [...COMMON_READ_FIELDS, 'data.schemaVersion', 'data.graph.*', 'data.roleGrants.*', 'data.entityProfiles.*', 'data.services.*', 'data.sockets.*', 'data.compiled.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  batchPile: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.serial', 'data.stock', 'data.batch', 'data.supplier', 'data.receivedAt'],
    write: ['data.*', 'specs.*'],
    admin: ['data.*', 'attachments.*']
  },
  sheet: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.specs.*'],
    write: ['data.*', 'specs.*'],
    admin: ['data.*', 'attachments.*']
  },
  remnant: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.geometry.*', 'data.source.*'],
    write: ['data.*', 'specs.*'],
    admin: ['data.*', 'attachments.*']
  },
  catalog: {
    feature: 'catalogs',
    read: [...COMMON_READ_FIELDS, 'data.material', 'data.description', 'data.options.*', 'data.pricing.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  color: {
    feature: 'catalogs',
    read: [...COMMON_READ_FIELDS, 'data.code', 'data.visuals.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  requisition: {
    feature: 'requisitions',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.items', 'data.totalPrice', 'data.currency', 'data.manufacturerId', 'data.projectId'],
    write: ['data.*', 'specs.*'],
    admin: ['data.*', 'attachments.*']
  },
  warehouse: {
    feature: 'warehouses',
    read: [...COMMON_READ_FIELDS, 'data.type', 'data.address', 'data.contactPerson', 'data.stats.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  artifact: {
    feature: 'artifacts',
    read: [...COMMON_READ_FIELDS, 'data.type', 'data.mimeType', 'data.size', 'data.filename', 'data.layout.*', 'data.values.*', 'data.activeRevisionId', 'data.revisions.*', 'attachments.primary.*'],
    write: ['data.*', 'attachments.*'],
    admin: ['data.*', 'attachments.*']
  },
  artifactTemplate: {
    feature: 'artifact_templates',
    read: [...COMMON_READ_FIELDS, 'data.format', 'data.layout.*', 'data.variables.*', 'data.activeRevisionId', 'data.revisions.*', 'attachments.source.*'],
    write: ['identity.name', 'data.layout.*', 'data.variables.*', 'data.activeRevisionId', 'data.revisions.*'],
    admin: ['identity.*', 'data.*', 'attachments.*']
  },
  user: {
    feature: 'users',
    read: [
      '_id',
      'identity.uid',
      'identity.name',
      'identity.reference',
      'origin.*',
      'states.*',
      'lineage.*',
      'data.email',
      'data.role',
      'data.avatarUrl',
      'data.memberships.organizationId',
      'data.memberships.role',
      'data.memberships.roleIds',
      'data.memberships.status'
    ],
    write: ['data.email'],
    admin: ['identity.*', 'data.*', 'summary.*', 'attachments.*']
  },
  organization: {
    feature: 'organizations',
    read: ['_id', 'identity.*', 'origin.*', 'states.*', 'lineage.*', 'data.type', 'data.email', 'data.phone'],
    write: ['data.address', 'data.phone'],
    admin: ['data.*', 'summary.*', 'attachments.*']
  },
  entityRevision: {
    feature: 'cassettes',
    read: [...COMMON_READ_FIELDS, 'data.source', 'data.scope', 'data.number', 'data.shortHash', 'data.contentHash', 'data.createdAt'],
    write: [],
    admin: ['data.*', 'attachments.*']
  },
  geometryCapture: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.mode', 'data.activeRevisionId', 'data.revisions.*', 'data.calibration.*', 'data.geometry.*', 'data.extraction.*', 'data.output.*'],
    write: ['data.*', 'specs.*', 'attachments.*'],
    admin: ['data.*', 'specs.*', 'attachments.*']
  },
  profileTemplate: {
    feature: 'cassettes',
    read: [...COMMON_READ_FIELDS, 'data.kind', 'data.process', 'data.parameters', 'data.sketch', 'data.occsProfile', 'data.description'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  toolProfile: {
    feature: 'materials',
    read: [...COMMON_READ_FIELDS, 'data.diameter', 'data.kerf', 'data.angle'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  machine: {
    feature: 'machines',
    read: [...COMMON_READ_FIELDS, 'data.workingArea.*', 'data.boundaryOffset', 'data.description'],
    write: ['identity.name', 'data.workingArea.*', 'data.boundaryOffset', 'data.description'],
    admin: ['identity.*', 'data.*', 'attachments.*']
  },
  penTemplate: {
    feature: 'layer_standards',
    read: [...COMMON_READ_FIELDS, 'data.stroke.*'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  layerStandard: {
    feature: 'layer_standards',
    read: [...COMMON_READ_FIELDS, 'data.code', 'data.category', 'data.defaultPenId', 'data.orgPenId'],
    write: ['data.orgPenId'],
    admin: ['data.*', 'attachments.*']
  }
};

const ENTITY_ALIASES = {
  nesting_run: 'nestingRun',
  sheet_design: 'sheetDesign',
  cassette_template: 'cassetteTemplate',
  artifact_template: 'artifactTemplate',
  cassette_design: 'cassetteDesign',
  cassette_instance: 'cassetteInstance',
  material_pile: 'materialPile',
  batch_pile: 'batchPile',
  entity_revision: 'entityRevision',
  geometry_capture: 'geometryCapture',
  profile_template: 'profileTemplate',
  process_definition: 'processDefinition',
  machine: 'machine',
  tool_profile: 'toolProfile',
  pen_template: 'penTemplate',
  layer_standard: 'layerStandard'
};

export function normalizeFieldAccessTypeId(typeId = '') {
  return ENTITY_ALIASES[typeId] || typeId;
}

export function getEntityFieldAccessPolicy(typeId) {
  return cncEntityFieldAccess[normalizeFieldAccessTypeId(typeId)] || null;
}
