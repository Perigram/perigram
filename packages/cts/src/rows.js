// Rows (SPEC §2, §4): closed field sets. Rows compile to JSON Schema 2020-12
// (the substrate for validators and designer form generation); instance
// checking here is a total walker — no dependency required.
import { describeType, checkValue } from './values.js';

export function normalizeRow(row = {}) {
  const normalized = {};
  for (const [name, descriptor] of Object.entries(row)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) throw new Error(`Field name ${name} must be lowerCamelCase`);
    normalized[name] = describeType(descriptor);
  }
  return Object.freeze(normalized);
}

// JSON Schema substrate: additionalProperties false everywhere, custom
// keywords x-quantity / x-ref carry what JSON Schema cannot express.
export function rowToSchema(typeId, row = {}) {
  const properties = {};
  for (const [name, descriptor] of Object.entries(row)) {
    properties[name] = descriptorToSchema(descriptor);
  }
  const required = Object.entries(row).filter(([, d]) => d.nullable !== true).map(([name]) => name);
  return Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `perigram:${typeId}`,
    type: 'object',
    additionalProperties: false,
    properties,
    required
  });
}

function descriptorToSchema(descriptor = {}) {
  const schema = { ...(descriptor.nullable === true ? {} : {}) };
  switch (descriptor.base) {
    case 'string': case 'id': case 'instant':
      Object.assign(schema, descriptor.base === 'instant' ? { format: 'date-time' } : { type: 'string' });
      break;
    case 'number': schema.type = 'number'; break;
    case 'boolean': schema.type = 'boolean'; break;
    case 'json': schema.description = 'quarantined dynamic value'; break;
    case 'blob': Object.assign(schema, { type: 'object', description: 'storage handle { fileId, mime, size }' }); break;
    case 'quantity':
      Object.assign(schema, { type: 'object', required: ['value', 'unit'], 'x-quantity': descriptor.unit,
        properties: { value: { type: 'number' }, unit: { const: descriptor.unit } } });
      break;
    case 'ref':
      Object.assign(schema, { type: 'object', required: ['type', 'id'], 'x-ref': descriptor.accepts,
        properties: { type: { enum: [...descriptor.accepts] }, id: { type: 'string' } } });
      break;
    case 'record':
      Object.assign(schema, { type: 'object', additionalProperties: false,
        properties: Object.fromEntries(Object.entries(descriptor.fields || {}).map(([n, d]) => [n, descriptorToSchema(d)])) });
      break;
    case 'list':
      Object.assign(schema, { type: 'array', items: descriptorToSchema(descriptor.itemType) });
      break;
    case 'map':
      Object.assign(schema, { type: 'object', additionalProperties: descriptorToSchema(descriptor.itemType) });
      break;
    case 'variant':
      Object.assign(schema, { oneOf: descriptor.tags.map(tag => ({
        type: 'object', required: ['tag'],
        properties: { tag: { const: tag }, value: descriptor.payloads?.[tag] ? descriptorToSchema(descriptor.payloads[tag]) : true }
      })) });
      break;
    case 'enum':
      schema.enum = [...descriptor.values];
      break;
    default: break;
  }
  if (descriptor.nullable === true) {
    return { anyOf: [schema, { type: 'null' }] };
  }
  return schema;
}

// R1: closed rows — unknown or ill-typed fields are errors, not passthrough.
export function checkFields(row, fields) {
  const errors = [];
  for (const name of Object.keys(fields || {})) {
    if (!Object.hasOwn(row, name)) errors.push(`closed row: unknown field ${name}`);
  }
  for (const [name, descriptor] of Object.entries(row)) {
    errors.push(...checkValue(descriptor, (fields || {})[name]).map(e => `fields.${name}: ${e}`));
  }
  return errors;
}
