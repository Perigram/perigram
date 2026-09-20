// One-way migration (SPEC §21 tech-drawing pack): legacy pen_templates and
// layer_standards collections become §3 instance documents in the per-class
// `files` collection under the pack's types. Ids are preserved so existing
// references keep resolving; layer standards carry their default pen as the
// declared `defaultPen` relation (orgPenId overrides collapse onto it —
// they were shared-row state). System rows (no org linkage) seed the
// system catalog (`organizationId: null`).
//
//   node server/scripts/migrate-tech-drawing-instances.js          # dry-run counts
//   node server/scripts/migrate-tech-drawing-instances.js --apply  # persist
import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

function penFields(doc = {}) {
  const stroke = doc.data?.stroke || {};
  return {
    name: doc.identity?.name || 'Pen',
    stroke: {
      color: stroke.color || '#000000',
      weight: Number(stroke.weight ?? stroke.width ?? 0.35),
      pattern: ['SOLID', 'DASHED', 'DOTTED'].includes(stroke.pattern) ? stroke.pattern : 'SOLID'
    }
  };
}

function standardFields(doc = {}) {
  const data = doc.data || {};
  return {
    code: data.code || doc.identity?.name || '',
    name: doc.identity?.name || data.code || '',
    category: String(data.category || 'OTHER').toUpperCase(),
    group: data.group ?? null,
    kind: data.kind ?? null,
    purpose: data.purpose ?? null,
    description: data.description || '',
    production: Boolean(data.production),
    allowedGeometry: Array.isArray(data.allowedGeometry) ? data.allowedGeometry : [],
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    parameters: Array.isArray(data.parameters) ? data.parameters : [],
    parameterSchema: data.parameterSchema && typeof data.parameterSchema === 'object' ? data.parameterSchema : {},
    defaultExport: data.defaultExport && typeof data.defaultExport === 'object' ? data.defaultExport : {},
    i18n: data.i18n && typeof data.i18n === 'object' ? data.i18n : {},
    source: data.source && typeof data.source === 'object' ? data.source : {}
  };
}

export async function migrateTechDrawingInstances(db, { apply = APPLY } = {}) {
  const summary = { pen_templates: { scanned: 0, migrated: 0 }, layer_standards: { scanned: 0, migrated: 0 }, invalid: [] };
  const files = db.collection('files');

  const pens = await db.collection('pen_templates').find({}).toArray();
  const penIdById = new Map();
  for (const doc of pens) {
    summary.pen_templates.scanned += 1;
    const id = doc._id;
    const existing = await files.findOne({ _id: id, type: 'pen-template' });
    if (existing) {
      penIdById.set(String(id), String(id));
      continue;
    }
    const organizationId = doc.lineage?.organizationId ?? null;
    const instance = {
      _id: id instanceof ObjectId ? id : new ObjectId(String(id)),
      type: 'pen-template',
      typeVersion: 1,
      organizationId: organizationId == null ? null : organizationId,
      name: penFields(doc).name,
      fields: penFields(doc),
      states: { main: 'ACTIVE' },
      lineage: {},
      createdAt: doc.origin?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (apply) await files.insertOne(instance);
    penIdById.set(String(id), String(id));
    summary.pen_templates.migrated += 1;
  }

  const standards = await db.collection('layer_standards').find({}).toArray();
  for (const doc of standards) {
    summary.layer_standards.scanned += 1;
    const id = doc._id;
    const existing = await files.findOne({ _id: id, type: 'layer-standard' });
    if (existing) continue;
    const organizationId = doc.lineage?.organizationId ?? null;
    const defaultPenId = doc.data?.orgPenId || doc.data?.defaultPenId || null;
    const penRef = defaultPenId && penIdById.has(String(defaultPenId))
      ? { type: 'pen-template', id: penIdById.get(String(defaultPenId)) }
      : null;
    const instance = {
      _id: id instanceof ObjectId ? id : new ObjectId(String(id)),
      type: 'layer-standard',
      typeVersion: 1,
      organizationId: organizationId == null ? null : organizationId,
      name: standardFields(doc).name,
      fields: standardFields(doc),
      states: { main: 'ACTIVE' },
      lineage: {},
      ...(penRef ? { relations: { defaultPen: penRef } } : {}),
      createdAt: doc.origin?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (apply) await files.insertOne(instance);
    summary.layer_standards.migrated += 1;
  }
  return summary;
}

async function main() {
  const db = await connectDB();
  const summary = await migrateTechDrawingInstances(db, { apply: APPLY });
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
