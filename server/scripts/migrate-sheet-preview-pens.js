// Rebakes every sheet-design's stored geometry preview with the layer
// standards' pens verbatim (older previews carry display-scaled weights).
// Idempotent: records whose recomputed preview matches keep their stored
// one untouched.
//
// Plain-node runbook (no Nuxt aliases — writes go directly):
//   node server/scripts/migrate-sheet-preview-pens.js
import { connectDB } from '../db/mongo.js';
import { nestingResultToPreview } from '../../workers/facade/surfaces/lib/sheetLayout.js';

function sheetBounds(polygon = null) {
  const outer = polygon?.outer || [];
  if (outer.length < 2) return { width: 1220, height: 2440 };
  const xs = outer.map(point => Number(point?.[0]) || 0);
  const ys = outer.map(point => Number(point?.[1]) || 0);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const db = await connectDB();
const sheets = db.collection('files').find({ type: 'sheet-design' });
let rebaked = 0;
let unchanged = 0;
for await (const sheet of sheets) {
  const data = sheet.fields?.geometry?.data;
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    unchanged += 1;
    continue;
  }
  const params = Number(data.solveParams?.width) > 0 && Number(data.solveParams?.height) > 0
    ? data.solveParams
    : sheetBounds(data.sheetPolygon);
  const preview = nestingResultToPreview(data, params, { layoutIndex: 0 });
  if (JSON.stringify(preview) === JSON.stringify(sheet.fields.geometry.preview)) {
    unchanged += 1;
    continue;
  }
  await db.collection('files').updateOne(
    { _id: sheet._id },
    { $set: { 'fields.geometry.preview': preview, updatedAt: new Date() } }
  );
  rebaked += 1;
}
console.log(`sheet previews: ${rebaked} rebaked, ${unchanged} unchanged`);
process.exit(0);
