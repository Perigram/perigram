import { slotFor } from '~/packages/cts/src/compat/field-schema-rows.js';

// Wire DTO -> CTS instance shape (the generator's data layer contract).
// The row-slot convention (data/specs blocks, item quantities in specs) is
// the same seam the domain projection uses — imported, not duplicated.
// Pure; pinned by spec.

function readBlockPath(dto = {}, segments = []) {
  return segments.reduce((value, segment) => (value == null ? undefined : value[segment]), dto);
}

function fieldValue(descriptor = {}, raw) {
  if (descriptor.base === 'quantity' && raw != null && typeof raw !== 'object') {
    return { value: raw, unit: descriptor.unit };
  }
  return raw;
}

function nestedRowValues(dto = {}, descriptor = {}, prefix = []) {
  const values = {};
  for (const [name, nested] of Object.entries(descriptor.fields || {})) {
    if (nested.base === 'record') {
      values[name] = nestedRowValues(dto, nested, [...prefix, name]);
      continue;
    }
    values[name] = fieldValue(nested, readBlockPath(dto, [...prefix, name]));
  }
  return values;
}

export function entityDtoToScreenInstance(dto = {}, typeRecord = {}) {
  const fields = {};
  const classOf = typeRecord.class || '';
  for (const [name, descriptor] of Object.entries(typeRecord.fields || {})) {
    if (descriptor.base === 'record') {
      fields[name] = nestedRowValues(dto, descriptor, [slotFor(descriptor, classOf), name]);
      continue;
    }
    fields[name] = fieldValue(descriptor, readBlockPath(dto, [slotFor(descriptor, classOf), name]));
  }
  // Identity core fields ride as plain values so labels and pickers work
  // even for types whose rows carry no name-like field.
  if (dto.identity?.name != null && fields.name === undefined) fields.name = dto.identity.name;
  if (dto.identity?.serial != null && fields.serial === undefined) fields.serial = dto.identity.serial;
  const lineage = {};
  for (const [key, value] of Object.entries(dto.lineage || {})) {
    if (value == null) continue;
    lineage[key] = typeof value === 'object' ? value : { id: String(value) };
  }
  const primary = dto.status?.state?.primary;
  return {
    id: String(dto._id || dto.identity?.uid || ''),
    type: typeRecord.id || '',
    typeVersion: typeRecord.version || 1,
    fields,
    lineage,
    relations: dto.relations || {},
    states: primary ? { main: primary } : {},
    payload: null
  };
}
