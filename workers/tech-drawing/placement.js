// The tech-drawing plugin's DXF placement engine (SPEC §24); the spot
// marker law lives in the plugin README.
const SPOT = /^\{spot:([^}]+)\}$/;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function dxfPairs(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (Number.isFinite(code)) pairs.push({ code, value: lines[index + 1] });
  }
  return pairs;
}

// Locates the ENTITIES section body: [firstEntityPairIndex, endsecPairIndex).
function entitiesBounds(pairs) {
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

function entityRecords(pairs, start, end) {
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

const fieldValue = (pairs, record, code) => pairs
  .slice(record.start, record.end).find(pair => pair.code === code)?.value;

const rounded = value => Math.round(value * 1e6) / 1e6;

export function composeDxfPlacement(templateText, parts) {
  const newline = String(templateText ?? '').includes('\r\n') ? '\r\n' : '\n';
  const pairs = dxfPairs(templateText);
  const { start, end } = entitiesBounds(pairs);
  if (start < 0 || end < 0) badRequest('the template DXF carries no ENTITIES section');

  const render = (from, to) => pairs.slice(from, to)
    .map(pair => `${pair.code}${newline}${pair.value}`).join(newline);

  const spots = new Map();
  const keptRecords = [];
  for (const record of entityRecords(pairs, start, end)) {
    const type = pairs[record.start].value.trim();
    const text = fieldValue(pairs, record, 1);
    const marker = typeof text === 'string' ? text.trim().match(SPOT) : null;
    if (marker && (type === 'TEXT' || type === 'MTEXT')) {
      const x = Number(fieldValue(pairs, record, 10));
      const y = Number(fieldValue(pairs, record, 20));
      spots.set(marker[1], { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
    } else {
      keptRecords.push(record);
    }
  }
  if (!spots.size) badRequest('the template DXF carries no {spot:name} markers');

  const failures = [];
  for (const name of spots.keys()) {
    if (!parts.some(part => part.name === name)) failures.push({ name, message: `spot ${name} has no matching part` });
  }
  for (const part of parts) {
    if (!spots.has(part.name)) failures.push({ name: part.name, message: `part ${part.name} has no matching spot` });
  }
  if (failures.length) return { failures };

  const blocks = keptRecords.map(record => render(record.start, record.end));
  for (const [spotName, anchor] of spots) {
    blocks.push(placedEntities(parts.find(part => part.name === spotName).text, anchor, newline));
  }
  return { dxf: [render(0, start), ...blocks, render(end, pairs.length)].join(newline) + newline };
}

function placedEntities(partText, anchor, newline) {
  const pairs = dxfPairs(partText);
  const { start, end } = entitiesBounds(pairs);
  if (start < 0 || end < 0) badRequest('a placed DXF carries no ENTITIES section');
  let minX = Infinity;
  let minY = Infinity;
  for (let index = start; index < end; index += 1) {
    const numeric = Number(pairs[index].value);
    if (!Number.isFinite(numeric)) continue;
    if (pairs[index].code >= 10 && pairs[index].code <= 18) minX = Math.min(minX, numeric);
    if (pairs[index].code >= 20 && pairs[index].code <= 28) minY = Math.min(minY, numeric);
  }
  const dx = anchor.x - (Number.isFinite(minX) ? minX : 0);
  const dy = anchor.y - (Number.isFinite(minY) ? minY : 0);
  return pairs.slice(start, end).map(pair => {
    const numeric = Number(pair.value);
    if (Number.isFinite(numeric) && pair.code >= 10 && pair.code <= 18) return `${pair.code}${newline}${rounded(numeric + dx)}`;
    if (Number.isFinite(numeric) && pair.code >= 20 && pair.code <= 28) return `${pair.code}${newline}${rounded(numeric + dy)}`;
    return `${pair.code}${newline}${pair.value}`;
  }).join(newline);
}
