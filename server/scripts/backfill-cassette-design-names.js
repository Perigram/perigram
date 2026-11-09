// One-shot repair (workers/facade/SPEC.md — cassette-design identity):
// names stored cassette designs that predate construction-derived names.
// Prefers the template name plus parameter values; falls back to the
// imported DXF file name, then to the baked bounding box.
//
//   node server/scripts/backfill-cassette-design-names.js
//   node server/scripts/backfill-cassette-design-names.js --apply
//   node server/scripts/backfill-cassette-design-names.js --replace-placeholders --apply
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');
const REPLACE_PLACEHOLDERS = process.argv.includes('--replace-placeholders');
const db = await connectDB();
const files = db.collection('files');

const templateNames = new Map();
for (const template of await files.find({ type: 'cassette-template' }, { projection: { name: 1 } }).toArray()) {
  templateNames.set(String(template._id), String(template.name || '').trim());
}

const templateIdOf = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value.id ?? value._id ?? '');
  return String(value);
};

const parameterSignature = (parameters) => Object.entries(parameters && typeof parameters === 'object' ? parameters : {})
  .filter(([, value]) => value != null && value !== '')
  .map(([key, value]) => `${key} ${value}`)
  .join(' · ');

const boundsName = (geometry) => {
  const points = (geometry?.polygons || geometry?.nestingPolygons || [])
    .flatMap(part => Array.isArray(part?.coordinates) ? part.coordinates : []);
  const xs = points.map(point => Number(point?.[0])).filter(Number.isFinite);
  const ys = points.map(point => Number(point?.[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return '';
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return width > 0 && height > 0 ? `Cassette design ${Math.round(width)}×${Math.round(height)}` : '';
};

const isPlaceholderName = (value) => {
  const name = String(value || '').trim();
  return !name || name.length === 1 || /^[\p{P}\p{S}]+$/u.test(name);
};

const nameFor = (record) => {
  const fields = record.fields || {};
  const current = String(record.name || fields.name || '').trim();
  if (current && !(REPLACE_PLACEHOLDERS && isPlaceholderName(current))) return '';
  const templateName = templateNames.get(templateIdOf(fields.template));
  if (templateName) {
    const signature = parameterSignature(fields.parameters);
    return signature ? `${templateName} · ${signature}` : templateName;
  }
  const fileName = String(record.payload?.name || '').trim();
  if (fileName) return fileName.replace(/\.[a-z0-9]+$/i, '');
  return boundsName(fields.geometry);
};

let named = 0;
let skipped = 0;
const designs = await files.find({ type: 'cassette-design' }).toArray();
for (const record of designs) {
  const name = nameFor(record);
  if (!name) {
    skipped += 1;
    continue;
  }
  if (!APPLY) {
    console.log(`${record._id} → ${name}`);
    named += 1;
    continue;
  }
  await files.updateOne({ _id: record._id }, { $set: { name } });
  named += 1;
}
console.log(`${APPLY ? '' : '[dry-run] '}cassette designs named: ${named}, skipped: ${skipped}, total: ${designs.length}`);
process.exit(0);
