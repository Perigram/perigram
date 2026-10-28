// The tech-drawing plugin's DXF placement engine (SPEC §24); the spot
// marker law and the pair model live in ./dxf-markers.js.
import { dxfPairs, entitiesBounds, entityRecords, fieldValue } from './dxf-markers.js';

const SPOT = /^\{spot:([^}]+)\}$/;
const rounded = value => Math.round(value * 1e6) / 1e6;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

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

  // The assignment: a part carrying `spot` claims that anchor explicitly
  // (the dialog's per-spot pairing); a part without one matches by name —
  // the authored default, never a gate.
  const claimed = new Map();
  const failures = [];
  const unassigned = [];
  for (const part of parts) {
    const spotName = part.spot != null && String(part.spot).trim() !== '' ? String(part.spot).trim() : null;
    if (spotName == null) {
      unassigned.push(part);
      continue;
    }
    if (!spots.has(spotName)) {
      failures.push({ name: spotName, message: `part ${part.name || part.id || ''} is assigned to spot ${spotName}, which the template does not carry`.trim() });
      continue;
    }
    if (claimed.has(spotName)) {
      failures.push({ name: spotName, message: `spot ${spotName} is assigned more than one part` });
      continue;
    }
    claimed.set(spotName, part);
  }
  for (const part of unassigned) {
    if (claimed.has(part.name)) {
      failures.push({ name: part.name, message: `part ${part.name} has no free spot (its name is already claimed)` });
      continue;
    }
    if (!spots.has(part.name)) {
      failures.push({ name: part.name, message: `part ${part.name} has no matching spot` });
      continue;
    }
    claimed.set(part.name, part);
  }
  for (const spotName of spots.keys()) {
    if (!claimed.has(spotName)) failures.push({ name: spotName, message: `spot ${spotName} has no matching part` });
  }
  if (failures.length) return { failures };

  const blocks = keptRecords.map(record => render(record.start, record.end));
  for (const [spotName, anchor] of spots) {
    blocks.push(placedEntities(claimed.get(spotName).text, anchor, newline));
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
