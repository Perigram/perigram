// Wire DTO -> CTS instance shape (the generator's data layer contract).
// The wire IS the stored §3 document (owner decision 2026-10-11): rows
// live in flat `fields`, the name slot and payload slot travel as
// themselves. Pure; pinned by spec.

function readBlockPath(dto = {}, segments = []) {
  return segments.reduce((value, segment) => (value == null ? undefined : value[segment]), dto);
}

function fieldValue(descriptor = {}, raw) {
  if (descriptor.base === 'quantity' && raw != null && typeof raw !== 'object') {
    return { value: raw, unit: descriptor.unit };
  }
  return raw;
}

function nestedRowValues(source = {}, descriptor = {}, prefix = []) {
  const values = {};
  for (const [name, nested] of Object.entries(descriptor.fields || {})) {
    if (nested.base === 'record') {
      values[name] = nestedRowValues(source, nested, [...prefix, name]);
      continue;
    }
    values[name] = fieldValue(nested, readBlockPath(source, [...prefix, name]));
  }
  return values;
}

export function dtoToScreenInstance(dto = {}, typeRecord = {}) {
  const rows = dto.fields || {};
  const fields = {};
  for (const [name, descriptor] of Object.entries(typeRecord.fields || {})) {
    if (descriptor.base === 'record') {
      fields[name] = nestedRowValues(rows, descriptor, [name]);
      continue;
    }
    fields[name] = fieldValue(descriptor, readBlockPath(rows, [name]));
  }
  // The identifier row absorbs the wire name when its row value is empty,
  // so the one title resolver (titleFor) never needs heuristics — the
  // stored name slot is the explicit rename channel.
  const identifier = typeRecord.identifier;
  if (identifier && fields[identifier] === undefined && dto.name != null) {
    fields[identifier] = dto.name;
  }
  if (dto.name != null && fields.name === undefined) fields.name = dto.name;
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
  // fallbackPaths walk in order, so a type whose renderable source is
  // stored in several shapes previews whichever one the record carries.
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
    id: String(dto._id || ''),
    type: typeRecord.id || '',
    typeVersion: typeRecord.version || 1,
    fields,
    lineage,
    relations: dto.relations || {},
    state,
    // File payload reference: kept verbatim so preview surfaces resolve
    // the payload download URL.
    payload: dto.payload || null,
    previewSource: previewSourceValue
  };
}
