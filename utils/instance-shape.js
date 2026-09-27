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

export function dtoToScreenInstance(dto = {}, typeRecord = {}) {
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
  // even for types whose rows carry no name-like field. The declared
  // identifier field also absorbs the wire display name when its row is
  // empty, so the one title resolver (titleFor) never needs heuristics —
  // legacy DTOs keep their user-authored name in the identity block.
  const identifier = typeRecord.identifier;
  if (identifier && fields[identifier] === undefined && dto.identity?.name != null) {
    fields[identifier] = dto.identity.name;
  }
  if (dto.identity?.name != null && fields.name === undefined) fields.name = dto.identity.name;
  if (dto.identity?.serial != null && fields.serial === undefined) fields.serial = dto.identity.serial;
  const lineage = {};
  for (const [key, value] of Object.entries(dto.lineage || {})) {
    if (value == null) continue;
    lineage[key] = typeof value === 'object' ? value : { id: String(value) };
  }
  // One flat state string rides verbatim from the wire (SPEC §3/§7); no
  // axis map is projected and nothing synthesizes a value.
  const state = typeof dto.state === 'string' && dto.state ? dto.state : null;
  // Declared preview field (type.previewSource — the authored
  // previewSource group row): the value reads straight off the wire DTO,
  // so generated previews render the declared channel (for example
  // cassette geometry) even while the payload is absent. The declared
  // fallbackPaths walk in order — the same resolution DataBlock rows use
  // — so a type whose renderable source is stored in several shapes
  // previews whichever one the record carries.
  const previewSourcePaths = [
    typeRecord.previewSource?.path,
    ...(typeRecord.previewSource?.fallbackPaths || [])
  ].filter(Boolean);
  let previewSourceValue = null;
  for (const previewPath of previewSourcePaths) {
    const value = readBlockPath(dto, previewPath.split('.'));
    if (value !== null && value !== undefined
      && (Array.isArray(value) ? value.length > 0 : true)) {
      previewSourceValue = value;
      break;
    }
  }
  return {
    id: String(dto._id || dto.identity?.uid || ''),
    type: typeRecord.id || '',
    typeVersion: typeRecord.version || 1,
    fields,
    lineage,
    relations: dto.relations || {},
    state,
    // File payload reference (wire `attachments.primary`): kept verbatim
    // so preview surfaces resolve the payload download URL.
    payload: dto.attachments?.primary || null,
    previewSource: previewSourceValue
  };
}
