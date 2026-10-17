import { CLASS_COLLECTIONS } from '#packages/cts/src/index.js';

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
      // The AI attribution marker travels at read level: clients badge the
      // assistant (sender chips, member stacks) from it — users README's
      // marker contract ("DTOs carry the same bare shape").
      'data.bot',
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
    feature: 'files',
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
  artifact_template: 'artifactTemplate',
  entity_revision: 'entityRevision',
  process_definition: 'processDefinition',
  pen_template: 'penTemplate',
  layer_standard: 'layerStandard',
  // Kebab CTS ids of framework types whose field-access policy is still
  // served by this legacy map: they keep explicit feature services and
  // never enter the declaration projection's own fieldAccess.
  'entity-revision': 'entityRevision',
};

export function normalizeFieldAccessTypeId(typeId = '') {
  return ENTITY_ALIASES[typeId] || typeId;
}

export function getEntityFieldAccessPolicy(typeId) {
  return fieldAccessPolicies[normalizeFieldAccessTypeId(typeId)] || null;
}

// The client twin of the server's instance-feature resolution (the
// transports gate per class-collection feature; a field policy may pin a
// type to another feature): field-policy feature, else the type's class
// collection, else the type id. Callers pass the bundle type record for
// its class.
export function resolveTypeFeature(typeId = '', typeRecord = null) {
  const policy = getEntityFieldAccessPolicy(typeId);
  if (policy?.feature) return policy.feature;
  const collection = typeRecord?.class ? CLASS_COLLECTIONS[typeRecord.class] : null;
  return collection || typeId;
}
