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

export const fieldAccessPolicies = {
  facade: { feature: 'facades', read: [...COMMON_READ_FIELDS, 'data.parts', 'data.partAssignments', 'data.revisions'], write: ['relations.*', 'data.parts', 'data.partAssignments', 'data.revisions'], admin: ['identity.*', 'data.*', 'attachments.*'] },
  facade_pattern: { feature: 'facade_patterns', read: [...COMMON_READ_FIELDS, 'data.graph', 'data.revisions'], write: ['identity.name', 'data.graph', 'data.revisions'], admin: ['identity.*', 'data.*', 'attachments.*'] },
  sheetDesign: {
    feature: 'sheet_designs',
    read: [...COMMON_READ_FIELDS, 'specs.*', 'data.geometry.*', 'data.materialPool', 'data.instanceIds', 'data.sheetIndex'],
    write: ['data.*'],
    admin: ['data.*', 'attachments.*']
  },
  cassette: {
    feature: 'cassettes',
    read: [...COMMON_READ_FIELDS, 'data.type', 'data.parameters', 'data.definition', 'data.revisions', 'data.geometry.*', 'data.layerData', 'data.polygonParts'],
    write: ['data.*'],
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
  color: {
    feature: 'catalogs',
    read: [...COMMON_READ_FIELDS, 'data.code', 'data.visuals.*'],
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
  sheet_design: 'sheetDesign',
  artifact_template: 'artifactTemplate',
  entity_revision: 'entityRevision',
  process_definition: 'processDefinition',
  pen_template: 'penTemplate',
  layer_standard: 'layerStandard',
  // Kebab CTS ids of types whose fact vocabulary moved to the bundle but
  // whose field-access policy is still served by this legacy map (the
  // declaration projection's own fieldAccess does not carry the legacy
  // read paths yet — access migrates when the DTO paths become declared
  // rows).
  'entity-revision': 'entityRevision',
  'sheet-design': 'sheetDesign',
  'facade-design': 'facade',
  'facade-pattern': 'facade_pattern'
};

export function normalizeFieldAccessTypeId(typeId = '') {
  return ENTITY_ALIASES[typeId] || typeId;
}

export function getEntityFieldAccessPolicy(typeId) {
  return fieldAccessPolicies[normalizeFieldAccessTypeId(typeId)] || null;
}
