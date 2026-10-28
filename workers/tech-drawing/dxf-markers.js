// The DXF pair model and the {spot:name} marker operations (SPEC §24):
// the placement engine and the marker editor share this home. A marker is
// a TEXT entity whose whole text is {spot:<name>} — the part-matching
// vocabulary, authored where the drawing is drawn.
const SPOT = /^\{spot:([^}]+)\}$/;

export function dxfPairs(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (Number.isFinite(code)) pairs.push({ code, value: lines[index + 1] });
  }
  return pairs;
}

// Locates the ENTITIES section body: [firstEntityPairIndex, endsecPairIndex).
export function entitiesBounds(pairs) {
  let pendingSection = false;
  let inEntities = false;
  let start = -1;
  let end = -1;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.code === 0 && pair.value.trim() === 'SECTION') pendingSection = true;
    else if (pendingSection && pair.code === 2) {
      inEntities = pair.value.trim() === 'ENTITIES';
      pendingSection = false;
      if (inEntities) start = index + 1;
      continue;
    }
    if (inEntities && pair.code === 0 && pair.value.trim() === 'ENDSEC') {
      end = index;
      return { start, end };
    }
  }
  return { start, end };
}

export function entityRecords(pairs, start, end) {
  const records = [];
  let recordStart = -1;
  for (let index = start; index < end; index += 1) {
    if (pairs[index].code !== 0) continue;
    if (recordStart >= 0) records.push({ start: recordStart, end: index });
    recordStart = index;
  }
  if (recordStart >= 0) records.push({ start: recordStart, end });
  return records;
}

export const fieldValue = (pairs, record, code) => pairs
  .slice(record.start, record.end).find(pair => pair.code === code)?.value;

const rounded = value => Math.round(value * 1e6) / 1e6;

export function pairsToText(pairs) {
  return pairs.map(pair => `${pair.code}\n${pair.value}`).join('\n') + '\n';
}

// Every marker in the template, with its insertion point, height, layer,
// and the record span it occupies in the pair list.
export function spotMarkersOf(text) {
  const pairs = dxfPairs(text);
  const { start, end } = entitiesBounds(pairs);
  if (start < 0) return [];
  const markers = [];
  for (const record of entityRecords(pairs, start, end)) {
    if (pairs[record.start].value.trim() !== 'TEXT' && pairs[record.start].value.trim() !== 'MTEXT') continue;
    const content = fieldValue(pairs, record, 1);
    const match = SPOT.exec(String(content ?? '').trim());
    if (!match) continue;
    markers.push({
      name: match[1],
      x: Number(fieldValue(pairs, record, 10)),
      y: Number(fieldValue(pairs, record, 20)),
      height: Number(fieldValue(pairs, record, 40)) || null,
      layer: (fieldValue(pairs, record, 8) || '').trim(),
      record
    });
  }
  return markers;
}

// New markers copy the drawing's own conventions: the height of the first
// existing marker, else a span derived from the header extents (viewers
// recompute extents; the header value is the authored hint).
export function defaultMarkerHeight(text) {
  const existing = spotMarkersOf(text).find(marker => marker.height);
  if (existing) return existing.height;
  const pairs = dxfPairs(text);
  const extents = [];
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code === 0 && pairs[index].value.trim() === 'ENDSEC' && extents.length) break;
    if (pairs[index].code === 9 && /^\$(EXTMIN|EXTMAX)$/.test(pairs[index].value.trim())) {
      const x = Number(pairs[index + 1]?.code === 10 ? pairs[index + 1].value : NaN);
      const y = Number(pairs[index + 2]?.code === 20 ? pairs[index + 2].value : NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) extents.push({ x, y });
    }
  }
  if (extents.length === 2) {
    const span = Math.max(
      Math.abs(extents[1].x - extents[0].x),
      Math.abs(extents[1].y - extents[0].y)
    );
    if (span > 0) return rounded(Math.max(span / 50, 0.1));
  }
  return 5;
}

// The anchor names a fill dialog pairs parts against.
export const spotNamesOf = text => spotMarkersOf(text).map(marker => marker.name);

function markerEntityPairs({ name, x, y, height, layer }) {
  return [
    { code: 0, value: 'TEXT' },
    { code: 8, value: layer || 'SPOT' },
    { code: 10, value: String(rounded(x)) },
    { code: 20, value: String(rounded(y)) },
    { code: 30, value: '0.0' },
    { code: 40, value: String(rounded(height)) },
    { code: 1, value: `{spot:${name}}` }
  ];
}

export function addSpotMarker(text, { name, x, y, height, layer } = {}) {
  const clean = String(name ?? '').trim();
  if (!clean || /\}/.test(clean)) {
    throw new Error(`Marker name ${JSON.stringify(name)} is not a valid anchor name`);
  }
  const markers = spotMarkersOf(text);
  if (markers.some(marker => marker.name === clean)) {
    throw new Error(`Marker ${clean} already exists`);
  }
  const pairs = dxfPairs(text);
  const { start, end } = entitiesBounds(pairs);
  if (start < 0) throw new Error('The template DXF carries no ENTITIES section');
  const entity = markerEntityPairs({
    name: clean,
    x: Number(x) || 0,
    y: Number(y) || 0,
    height: Number(height) || defaultMarkerHeight(text),
    layer: layer ?? markers[0]?.layer ?? ''
  });
  pairs.splice(end, 0, ...entity);
  return pairsToText(pairs);
}

function markerRecordOf(text, name) {
  const record = spotMarkersOf(text).find(marker => marker.name === name);
  if (!record) throw new Error(`Marker ${name} not found`);
  return record;
}

export function renameSpotMarker(text, name, nextName) {
  const clean = String(nextName ?? '').trim();
  if (!clean || /\}/.test(clean)) {
    throw new Error(`Marker name ${JSON.stringify(nextName)} is not a valid anchor name`);
  }
  const pairs = dxfPairs(text);
  const { record } = markerRecordOf(text, name);
  const at = pairs.slice(record.start, record.end).findIndex(pair => pair.code === 1);
  if (at < 0) throw new Error(`Marker ${name} carries no text pair`);
  pairs[record.start + at].value = `{spot:${clean}}`;
  return pairsToText(pairs);
}

export function removeSpotMarker(text, name) {
  const pairs = dxfPairs(text);
  const { record } = markerRecordOf(text, name);
  pairs.splice(record.start, record.end - record.start);
  return pairsToText(pairs);
}

const layerRecordPairs = name => [
  { code: 0, value: 'LAYER' },
  { code: 2, value: name },
  { code: 70, value: '0' },
  { code: 62, value: '7' },
  { code: 6, value: 'CONTINUOUS' }
];

// Locates the LAYER table: { countAt, endtabAt } — countAt is the
// table's 70-count pair index, endtabAt its ENDTAB pair index. Absent
// when the file carries none.
function layerTableOf(pairs) {
  let inTables = false;
  let pendingSection = false;
  let pendingTable = false;
  let tableKind = '';
  let countAt = -1;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.code === 0 && pair.value.trim() === 'SECTION') {
      pendingSection = true;
      pendingTable = false;
      continue;
    }
    if (pendingSection && pair.code === 2) {
      inTables = pair.value.trim() === 'TABLES';
      pendingSection = false;
      continue;
    }
    if (!inTables) continue;
    if (pair.code === 0 && pair.value.trim() === 'ENDSEC') {
      inTables = false;
      continue;
    }
    if (pair.code === 0 && pair.value.trim() === 'TABLE') {
      pendingTable = true;
      tableKind = '';
      countAt = -1;
      continue;
    }
    if (pendingTable && pair.code === 2) {
      tableKind = pair.value.trim();
      pendingTable = false;
      if (pairs[index + 1]?.code === 70) countAt = index + 1;
      continue;
    }
    if (tableKind === 'LAYER' && pair.code === 0 && pair.value.trim() === 'ENDTAB') {
      return { countAt, endtabAt: index };
    }
  }
  return null;
}

function declaredLayerNames(pairs, endtabAt) {
  const names = new Set();
  let atRecord = false;
  for (let index = 0; index < endtabAt; index += 1) {
    const pair = pairs[index];
    if (pair.code === 0 && pair.value.trim() === 'LAYER') {
      atRecord = true;
      continue;
    }
    if (atRecord && pair.code === 2) {
      names.add(pair.value.trim());
      atRecord = false;
    }
  }
  return names;
}

// The canvas copy's layer law (SPEC §24): every layer an entity
// references — and layer 0 — carries a LAYER table record with the
// CONTINUOUS linetype declared, so strict viewers draw the whole
// template. The stored payload keeps its authored bytes.
export function withLayerTable(text) {
  const pairs = dxfPairs(text);
  const { start, end } = entitiesBounds(pairs);
  if (start < 0) return text;

  const referenced = new Set(['0']);
  for (const record of entityRecords(pairs, start, end)) {
    const layer = fieldValue(pairs, record, 8);
    if (layer && layer.trim()) referenced.add(layer.trim());
  }

  const ltypeTable = [
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'LTYPE' },
    { code: 70, value: '1' },
    { code: 0, value: 'LTYPE' },
    { code: 2, value: 'CONTINUOUS' },
    { code: 70, value: '0' },
    { code: 72, value: '65' },
    { code: 73, value: '0' },
    { code: 40, value: '0.0' },
    { code: 3, value: 'Solid line' },
    { code: 0, value: 'ENDTAB' }
  ];

  const table = layerTableOf(pairs);
  if (table) {
    const missing = [...referenced].filter(name => !declaredLayerNames(pairs, table.endtabAt).has(name));
    if (!missing.length) return text;
    const count = Number.parseInt(pairs[table.countAt].value, 10) || 0;
    pairs[table.countAt] = { ...pairs[table.countAt], value: String(count + missing.length) };
    pairs.splice(table.endtabAt, 0, ...missing.flatMap(layerRecordPairs));
    return pairsToText(pairs);
  }

  const layerTable = [
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'LAYER' },
    { code: 70, value: String(referenced.size) },
    ...[...referenced].flatMap(layerRecordPairs),
    { code: 0, value: 'ENDTAB' }
  ];
  // DXF section order places TABLES before ENTITIES; the section start
  // pair of ENTITIES is the splice point.
  const sectionStart = start - 2;
  pairs.splice(sectionStart, 0,
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    ...ltypeTable,
    ...layerTable,
    { code: 0, value: 'ENDSEC' }
  );
  return pairsToText(pairs);
}
