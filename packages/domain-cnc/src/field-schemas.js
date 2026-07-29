import { cncEntities } from './entities.js';
import { cncEntityFieldAccess, normalizeFieldAccessEntityType } from './field-access.js';
import { cncEntityFieldGroups } from './ui-fields.js';

const CORE_FIELDS = [
  field('_id', 'json', { writable: false }),
  field('identity.uid', 'string'),
  field('identity.name', 'string'),
  field('identity.slug', 'string'),
  field('identity.serial', 'string'),
  field('identity.reference', 'string'),
  field('origin.state.primary', 'status', { writable: false }),
  field('origin.userId', 'string', { writable: false }),
  field('origin.timestamp', 'dateTime', { writable: false }),
  field('origin.metadata', 'json', { writable: false }),
  field('origin.eventId', 'string', { writable: false }),
  field('origin.lifecycle', 'json', { writable: false }),
  field('status.state.primary', 'status'),
  field('status.userId', 'string', { writable: false }),
  field('status.timestamp', 'dateTime', { writable: false }),
  field('status.metadata', 'json'),
  field('status.eventId', 'string', { writable: false }),
  field('status.lifecycle', 'json', { writable: false }),
  field('lineage.organizationId', 'entityRef', { entityType: 'organization' }),
  field('relations.value', 'json'),
  field('provenance.source', 'entityRef'),
  field('specs.width', 'number', { unit: 'mm' }),
  field('specs.length', 'number', { unit: 'mm' }),
  field('specs.area', 'number', { unit: 'm2' }),
  field('specs.sheetThickness', 'number', { unit: 'mm' }),
  field('specs.foilThickness', 'number', { unit: 'mm' }),
  field('attachments.primary', 'json'),
  field('data.value', 'json'),
  field('summary.value', 'json', { writable: false })
];

export const cncEntityFieldSchemas = Object.freeze(Object.fromEntries(cncEntities.map(entity => {
  const entityType = entity.type;
  const access = fieldAccessFor(entityType);
  const descriptorFields = descriptorsFor(entityType).map(descriptor => descriptorField(descriptor));
  const exactAccessFields = ['read', 'write', 'admin']
    .flatMap(level => access[level] || [])
    .filter(path => !String(path).includes('*'))
    .map(path => field(path, 'json'));
  const allowedBlocks = new Set(entity.blocks || []);
  const fields = uniqueByPath([...CORE_FIELDS, ...descriptorFields, ...exactAccessFields])
    .filter(schema => schema.path === '_id' || allowedBlocks.has(schema.block))
    .map(schema => Object.freeze({
      ...schema,
      readable: hasAccess(access, schema.path, 'read'),
      writable: schema.writable !== false && hasAccess(access, schema.path, 'write')
    }));
  return [entityType, Object.freeze(fields)];
})));

export function getEntityFieldSchemas(entityType = '', options = {}) {
  const normalized = normalizeFieldAccessEntityType(entityType);
  const fields = cncEntityFieldSchemas[normalized] || cncEntityFieldSchemas[entityType] || [];
  return fields.filter(schema => (
    (!options.block || schema.block === options.block)
    && (!options.access || schema[options.access] !== false)
  ));
}

export function getEntityFieldSchema(entityType = '', path = '') {
  return getEntityFieldSchemas(entityType).find(schema => schema.path === path) || null;
}

function field(path, base, qualifiers = {}) {
  const block = path === '_id' ? 'identity' : String(path).split('.')[0];
  const { writable = true, ...typeQualifiers } = qualifiers;
  return {
    path,
    block,
    label: path,
    type: {
      base,
      shape: typeQualifiers.shape || 'item',
      nullable: true,
      ...(typeQualifiers.entityType ? { entityType: typeQualifiers.entityType } : {}),
      ...(typeQualifiers.unit ? { unit: typeQualifiers.unit } : {})
    },
    writable
  };
}

function descriptorField(descriptor = {}) {
  const { base, shape } = descriptorType(descriptor);
  return {
    ...field(descriptor.path, base, {
      shape,
      entityType: descriptor.entityType || '',
      unit: descriptorUnit(descriptor)
    }),
    label: descriptor.i18n || descriptor.path,
    i18n: descriptor.i18n || '',
    display: descriptor.display || '',
    role: descriptor.role || ''
  };
}

function descriptorType(descriptor = {}) {
  if (descriptor.display === 'entityRef') return { base: 'entityRef', shape: 'item' };
  if (descriptor.display === 'entityRefList') return { base: 'entityRef', shape: 'list' };
  if (['count', 'area', 'percent', 'dimension', 'duration', 'money', 'number', 'angle'].includes(descriptor.display)) {
    return { base: 'number', shape: 'item' };
  }
  if (descriptor.display === 'boolean') return { base: 'boolean', shape: 'item' };
  if (descriptor.display === 'date') return { base: 'date', shape: 'item' };
  if (['text', 'code'].includes(descriptor.display)) return { base: 'string', shape: 'item' };
  return { base: 'json', shape: descriptor.display?.endsWith('List') ? 'list' : 'item' };
}

function descriptorUnit(descriptor = {}) {
  if (descriptor.display === 'area') return 'm2';
  if (descriptor.display === 'percent') return 'percent';
  if (descriptor.display === 'duration') return 'minute';
  if (descriptor.display === 'dimension') return 'mm';
  if (descriptor.display === 'angle') return 'degree';
  return '';
}

function descriptorsFor(entityType) {
  const groups = cncEntityFieldGroups[normalizeFieldAccessEntityType(entityType)]
    || cncEntityFieldGroups[entityType]
    || {};
  return Object.values(groups)
    .flatMap(group => Array.isArray(group) ? group : [])
    .flatMap(descriptor => [
      descriptor,
      ...(descriptor.fallbackPaths || []).map(path => ({ ...descriptor, path }))
    ])
    .filter(descriptor => descriptor.path);
}

function fieldAccessFor(entityType) {
  const normalized = normalizeFieldAccessEntityType(entityType);
  return cncEntityFieldAccess[normalized] || cncEntityFieldAccess[entityType] || {};
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
