import { CANONICAL_BLOCK_COMPOSITION, CANONICAL_BLOCK_SCHEMAS } from '../../core/src/index.js';
import { cncEntities } from './entities.js';
import { cncEntityFieldAccess, normalizeFieldAccessTypeId } from './field-access.js';
import { cncInstanceFieldGroups } from './ui-fields.js';
import { cncContainment } from './relationships.js';

const CORE_FIELDS = [
  field('_id', 'json', { writable: false }),
  field('identity.uid', 'string', { constructible: false }),
  field('identity.name', 'string'),
  field('identity.slug', 'string'),
  field('identity.serial', 'string'),
  field('identity.reference', 'string'),
  field('origin.state.primary', 'status', { writable: false, constructible: false }),
  field('origin.userId', 'string', { writable: false, constructible: false }),
  field('origin.timestamp', 'dateTime', { writable: false, constructible: false }),
  field('origin.metadata', 'json', { writable: false, constructible: false }),
  field('origin.eventId', 'string', { writable: false, constructible: false }),
  field('origin.lifecycle', 'json', { writable: false, constructible: false }),
  field('status.state.primary', 'status', { constructible: false }),
  field('status.userId', 'string', { writable: false, constructible: false }),
  field('status.timestamp', 'dateTime', { writable: false, constructible: false }),
  field('status.metadata', 'json', { constructible: false }),
  field('status.eventId', 'string', { writable: false, constructible: false }),
  field('status.lifecycle', 'json', { writable: false, constructible: false }),
  field('lineage.organizationId', 'entityRef', { typeId: 'organization', constructible: false }),
  field('relations.value', 'json'),
  field('provenance.source', 'entityRef', { constructible: false }),
  field('specs.width', 'number', { unit: 'mm' }),
  field('specs.length', 'number', { unit: 'mm' }),
  field('specs.area', 'number', { unit: 'm2' }),
  field('specs.sheetThickness', 'number', { unit: 'mm' }),
  field('specs.foilThickness', 'number', { unit: 'mm' }),
  field('attachments.primary', 'json'),
  field('data.value', 'json'),
  field('summary.value', 'json', { writable: false, constructible: false })
];

const rawEntityFieldSchemas = Object.fromEntries(cncEntities.map(entity => {
  const typeId = entity.type;
  const access = fieldAccessFor(typeId);
  const lineageFields = lineageFieldsFor(typeId);
  const descriptorFields = descriptorsFor(typeId).map(descriptor => descriptorField(descriptor));
  const exactAccessFields = ['read', 'write', 'admin']
    .flatMap(level => access[level] || [])
    .filter(path => !String(path).includes('*'))
    .map(path => field(path, 'json'));
  const allowedBlocks = new Set(entity.blocks || []);
  const fields = uniqueByPath([...CORE_FIELDS, ...lineageFields, ...descriptorFields, ...exactAccessFields])
    .filter(schema => schema.path === '_id' || allowedBlocks.has(schema.block))
    .map(schema => Object.freeze({
      ...schema,
      readable: hasAccess(access, schema.path, 'read'),
      writable: schema.writable !== false && hasAccess(access, schema.path, 'write'),
      constructible: schema.constructible !== false
        && !(typeId === 'cassette_design' && schema.block === 'identity')
    }));
  return [typeId, Object.freeze(fields)];
}));

export const cncBlockFieldSchemas = CANONICAL_BLOCK_SCHEMAS;
export const cncBlockComposition = CANONICAL_BLOCK_COMPOSITION;

export const cncEntityFieldSchemas = Object.freeze(Object.fromEntries(
  Object.entries(rawEntityFieldSchemas).map(([typeId, schemas]) => [
    typeId,
    Object.freeze(schemas.map(schema => Object.freeze({ ...schema })))
  ])
));

export function getEntityFieldSchemas(typeId = '', options = {}) {
  const normalized = normalizeFieldAccessTypeId(typeId);
  const fields = cncEntityFieldSchemas[normalized] || cncEntityFieldSchemas[typeId] || [];
  return fields.filter(schema => (
    (!options.block || schema.block === options.block)
    && (!options.access || schema[options.access] !== false)
  ));
}

export function getEntityFieldSchema(typeId = '', path = '') {
  return getEntityFieldSchemas(typeId).find(schema => schema.path === path) || null;
}

export function getBlockFieldSchemas(block = '') {
  return block
    ? [...(cncBlockFieldSchemas[block] || [])]
    : Object.values(cncBlockFieldSchemas).flat();
}

export function getBlockFieldSchema(path = '') {
  const block = path === '_id' ? 'identity' : String(path).split('.')[0];
  return getBlockFieldSchemas(block).find(schema => schema.path === path) || null;
}

function field(path, base, qualifiers = {}) {
  const block = path === '_id' ? 'identity' : String(path).split('.')[0];
  const { writable = true, constructible = true, ...typeQualifiers } = qualifiers;
  return {
    path,
    block,
    label: path,
    type: {
      base,
      shape: typeQualifiers.shape || 'item',
      nullable: true,
      ...(typeQualifiers.typeId ? { typeId: typeQualifiers.typeId } : {}),
      ...(typeQualifiers.unit ? { unit: typeQualifiers.unit } : {}),
      ...(typeQualifiers.itemType ? { itemType: typeQualifiers.itemType } : {})
    },
    writable,
    constructible
  };
}

function lineageFieldsFor(typeId, visited = new Set()) {
  if (!typeId || visited.has(typeId)) return [];
  const nextVisited = new Set(visited).add(typeId);
  return cncContainment
    .filter(relation => relation.childType === typeId)
    .flatMap(relation => [
      field(`lineage.${relation.lineageKey}`, 'entityRef', {
        typeId: relation.parentType,
        writable: false,
        constructible: true
      }),
      ...lineageFieldsFor(relation.parentType, nextVisited)
    ]);
}

function descriptorField(descriptor = {}) {
  const { base, shape, itemType } = descriptorType(descriptor);
  return {
    ...field(descriptor.path, base, {
      shape,
      typeId: base === 'entityRef' ? canonicalTypeId(descriptor.typeId) : '',
      itemType,
      unit: descriptorUnit(descriptor)
    }),
    label: descriptor.i18n || descriptor.path,
    i18n: descriptor.i18n || '',
    display: descriptor.display || '',
    role: descriptor.role || ''
  };
}

function canonicalTypeId(typeId = '') {
  const normalized = normalizeFieldAccessTypeId(typeId);
  return cncEntities.find(entity => normalizeFieldAccessTypeId(entity.type) === normalized)?.type || typeId;
}

function descriptorType(descriptor = {}) {
  if (descriptor.display === 'entityRef') return { base: 'entityRef', shape: 'item' };
  if (descriptor.display === 'entityRefList') return {
    base: 'array',
    shape: 'item',
    itemType: {
      base: 'entityRef',
      shape: 'item',
      nullable: false,
      ...(descriptor.typeId ? { typeId: descriptor.typeId } : {})
    }
  };
  if (['count', 'area', 'percent', 'dimension', 'duration', 'money', 'number', 'angle'].includes(descriptor.display)) {
    return { base: 'number', shape: 'item' };
  }
  if (descriptor.display === 'boolean') return { base: 'boolean', shape: 'item' };
  if (descriptor.display === 'date') return { base: 'date', shape: 'item' };
  if (['text', 'code'].includes(descriptor.display)) return { base: 'string', shape: 'item' };
  return { base: 'json', shape: 'item' };
}

function descriptorUnit(descriptor = {}) {
  if (descriptor.display === 'area') return 'm2';
  if (descriptor.display === 'percent') return 'percent';
  if (descriptor.display === 'duration') return 'minute';
  if (descriptor.display === 'dimension') return 'mm';
  if (descriptor.display === 'angle') return 'degree';
  return '';
}

function descriptorsFor(typeId) {
  const groups = cncInstanceFieldGroups[normalizeFieldAccessTypeId(typeId)]
    || cncInstanceFieldGroups[typeId]
    || {};
  return Object.values(groups)
    .flatMap(group => Array.isArray(group) ? group : [])
    .flatMap(descriptor => [
      descriptor,
      ...(descriptor.fallbackPaths || []).map(path => ({ ...descriptor, path }))
    ])
    .filter(descriptor => descriptor.path);
}

function fieldAccessFor(typeId) {
  const normalized = normalizeFieldAccessTypeId(typeId);
  return cncEntityFieldAccess[normalized] || cncEntityFieldAccess[typeId] || {};
}

function hasAccess(access, path, level) {
  const paths = level === 'read'
    ? [...(access.read || []), ...(access.write || []), ...(access.admin || [])]
    : [...(access.write || []), ...(access.admin || [])];
  return paths.some(pattern => (
    pattern === path
    || (pattern.endsWith('.*') && path.startsWith(pattern.slice(0, -1)))
  ));
}

function uniqueByPath(fields) {
  const byPath = new Map();
  for (const schema of fields) {
    const existing = byPath.get(schema.path);
    byPath.set(schema.path, existing && existing.type?.base !== 'json' ? existing : schema);
  }
  return [...byPath.values()];
}
