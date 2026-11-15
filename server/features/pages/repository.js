import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { blocksFromMarkdown, normalizePageDocument } from '#shared/page-document.js';

// Custom pages and their sidebar sections are Page-class instances
// (cts framework `page`, items collection). The section flag and the
// ordered block document are Page fields; parent containment is the
// `pageId` lineage key.
const COLLECTION = 'items';
const LEGACY_COLLECTION = 'pages';
const TYPE = 'page';

export function serialize(row) {
  return {
    _id: row._id.toString(),
    kind: row.fields?.section === true ? 'section' : 'page',
    name: row.fields?.name || row.name || '',
    parentId: row.lineage?.pageId ? String(row.lineage.pageId) : null,
    classTypeId: row.fields?.classTypeId ? String(row.fields.classTypeId) : null
  };
}

export function serializeFull(row) {
  const document = normalizePageDocument({
    blocks: row.fields?.blocks,
    order: row.fields?.order
  });
  return {
    ...serialize(row),
    organizationId: String(row.organizationId),
    ...document,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function orgFilter(organizationId) {
  const org = toFlexibleId(organizationId);
  return { $in: [org, String(organizationId)] };
}

// One-time adoption of the former `pages` collection. The old rows keep
// their ids so links and open tabs keep resolving.
export async function migrateLegacy(organizationId) {
  const db = await connectDB();
  const legacy = await db.collection(LEGACY_COLLECTION)
    .find({ organizationId: orgFilter(organizationId) })
    .toArray();
  if (!legacy.length) return;
  await db.collection(COLLECTION).bulkWrite(legacy.map(row => ({
    updateOne: {
      filter: { _id: row._id },
      update: {
        $setOnInsert: {
          type: TYPE,
          typeVersion: 1,
          organizationId: toFlexibleId(organizationId),
          name: row.name || '',
          fields: {
            name: row.name || '',
            content: row.content || '',
            section: row.kind === 'section'
          },
          state: null,
          lineage: row.parentId ? { pageId: String(row.parentId) } : {},
          ...(row.createdBy ? { createdBy: row.createdBy } : {}),
          createdAt: row.createdAt || new Date(),
          updatedAt: row.updatedAt || new Date()
        }
      },
      upsert: true
    }
  })), { ordered: false });
  await db.collection(LEGACY_COLLECTION).deleteMany({ organizationId: orgFilter(organizationId) });
}

export async function migrateDocuments(organizationId) {
  const db = await connectDB();
  const rows = await db.collection(COLLECTION).find({
    type: TYPE,
    organizationId: orgFilter(organizationId),
    'fields.content': { $exists: true }
  }).toArray();
  for (const row of rows) {
    const document = blocksFromMarkdown(row.fields?.content || '');
    await db.collection(COLLECTION).updateOne(
      { _id: row._id },
      {
        $set: {
          'fields.blocks': document.blocks,
          'fields.order': document.order,
          updatedAt: new Date()
        },
        $unset: { 'fields.content': '' }
      }
    );
  }
}

export async function findByOrganization(organizationId) {
  const db = await connectDB();
  return db.collection(COLLECTION)
    .find({ type: TYPE, organizationId: orgFilter(organizationId) })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
}

export async function findById(id) {
  const db = await connectDB();
  if (!id) return null;
  return db.collection(COLLECTION).findOne({ _id: toFlexibleId(id), type: TYPE });
}

export async function findByClassType(organizationId, classTypeId) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({
    type: TYPE,
    organizationId: orgFilter(organizationId),
    'fields.classTypeId': String(classTypeId)
  });
}

export async function create(data) {
  const db = await connectDB();
  const now = new Date();
  const name = data.name || '';
  const section = data.kind === 'section';
  const doc = {
    _id: new ObjectId(),
    type: TYPE,
    typeVersion: 2,
    organizationId: toFlexibleId(data.organizationId),
    name,
    fields: {
      name,
      blocks: Array.isArray(data.blocks) ? data.blocks : [],
      order: Array.isArray(data.order) ? data.order : [],
      section,
      ...(data.classTypeId ? { classTypeId: String(data.classTypeId) } : {})
    },
    state: null,
    lineage: data.parentId ? { pageId: String(data.parentId) } : {},
    ...(data.createdBy ? { createdBy: data.createdBy } : {}),
    createdAt: now,
    updatedAt: now
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc._id;
}

export async function update(id, changes, organizationId) {
  const db = await connectDB();
  const set = { updatedAt: new Date() };
  const unset = {};
  if (changes.name !== undefined) {
    set.name = changes.name;
    set['fields.name'] = changes.name;
  }
  if (changes.blocks !== undefined) set['fields.blocks'] = changes.blocks;
  if (changes.order !== undefined) set['fields.order'] = changes.order;
  if (changes.parentId !== undefined) {
    if (changes.parentId) set['lineage.pageId'] = String(changes.parentId);
    else unset['lineage.pageId'] = '';
  }
  return db.collection(COLLECTION).findOneAndUpdate(
    { _id: toFlexibleId(id), type: TYPE, organizationId: orgFilter(organizationId) },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { returnDocument: 'after' }
  );
}

export async function detachChildren(organizationId, parentId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateMany(
    {
      type: TYPE,
      organizationId: orgFilter(organizationId),
      'lineage.pageId': { $in: [String(parentId), toFlexibleId(parentId)] }
    },
    { $unset: { 'lineage.pageId': '' }, $set: { updatedAt: new Date() } }
  );
}

export async function remove(id, organizationId) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id), type: TYPE, organizationId: orgFilter(organizationId) });
}
