import { connectDB } from '../db/mongo.js';
import { canonicalEntityType, cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');

const ENTITY_TYPE_FIELDS = new Set([
  'entityType',
  'ownerType',
  'targetType',
  'parentType',
  'childType',
  'ancestorEntityType',
  'childEntityType',
  'sourceEntityType',
  'outputEntityType'
]);
const ENTITY_TYPE_KEYED_FIELDS = new Set(['workflows', 'fieldPolicies']);

export function migrateCanonicalEntityTypes(value) {
  const unresolved = [];
  let changed = false;

  function visit(current, path = []) {
    if (Array.isArray(current)) return current.map((item, index) => visit(item, [...path, index]));
    if (!current || typeof current !== 'object') return current;

    const result = {};
    for (const [key, raw] of Object.entries(current)) {
      const nextPath = [...path, key];
      if (ENTITY_TYPE_KEYED_FIELDS.has(path.at(-1))) {
        const canonicalKey = canonicalEntityType(key);
        if (!canonicalKey) unresolved.push({ path: path.join('.'), value: key });
        const targetKey = canonicalKey || key;
        if (targetKey !== key) changed = true;
        result[targetKey] = visit(raw, nextPath);
        continue;
      }
      if (ENTITY_TYPE_FIELDS.has(key) && typeof raw === 'string' && raw) {
        const canonical = canonicalEntityType(raw);
        if (!canonical) unresolved.push({ path: nextPath.join('.'), value: raw });
        result[key] = canonical || raw;
        if (canonical && canonical !== raw) changed = true;
        continue;
      }
      if (key === 'type' && typeof raw === 'string' && raw && (current.id || current.entityId || current.revisionId)) {
        const canonical = canonicalEntityType(raw);
        if (canonical) {
          result[key] = canonical;
          if (canonical !== raw) changed = true;
          continue;
        }
      }
      result[key] = visit(raw, nextPath);
    }
    return result;
  }

  return { changed, unresolved, value: visit(value) };
}

function stringId(value) {
  return value?.toString?.() || value || '';
}

function withoutKeys(value = {}, keys = []) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !blocked.has(key)));
}

export function migrateLegacyRevisionData(data = {}) {
  if (data.source?.type && data.source?.id) return { changed: false, data };
  const type = data.entityType || '';
  const id = data.entityId;
  if (!type || !id) return { changed: false, data };
  return {
    changed: true,
    data: {
      ...withoutKeys(data, ['entityType', 'entityId']),
      source: { type, id: stringId(id) }
    }
  };
}

export function migrateLegacyDerivedFrom(design = {}) {
  const legacy = design.data?.derivedFrom;
  const existing = design.provenance?.derivedFrom;
  const templateId = design.lineage?.templateId;
  const legacySource = legacy?.source || {
    type: legacy?.entityType || legacy?.type,
    id: legacy?.entityId || legacy?.id,
    ...(legacy?.revisionId ? { revisionId: stringId(legacy.revisionId) } : {})
  };
  const source = existing?.source || legacySource;
  if (!source?.type || !source?.id) {
    return { changed: false, invalid: Boolean(legacy || templateId), design };
  }
  if (templateId && (source.type !== 'cassette' || stringId(source.id) !== stringId(templateId))) {
    return { changed: false, invalid: true, design };
  }
  const derivedFrom = existing || {
    ...withoutKeys(legacy, ['source', 'entityType', 'entityId', 'type', 'id', 'revisionId']),
    source: {
      type: source.type,
      id: stringId(source.id),
      ...(source.revisionId ? { revisionId: stringId(source.revisionId) } : {})
    }
  };
  const data = { ...(design.data || {}) };
  delete data.derivedFrom;
  const lineage = { ...(design.lineage || {}) };
  delete lineage.templateId;
  return {
    changed: Boolean(legacy || templateId),
    invalid: false,
    design: {
      ...design,
      data,
      lineage,
      provenance: {
        ...(design.provenance || {}),
        derivedFrom
      }
    }
  };
}

export function migrateLegacyParentRevision(entity = {}, relation = {}, revision = null) {
  const parentId = entity.lineage?.[relation.lineageKey];
  if (!parentId || entity.provenance?.parent?.source) return { changed: false, entity, unsetKeys: [] };
  const revisionKeys = parentRevisionKeys(relation);
  const revisionId = revisionKeys.map(key => entity.lineage?.[key]).find(Boolean);
  if (!revisionId || !revision?.data?.source) return { changed: false, entity, unsetKeys: [] };
  const source = revision.data.source;
  if (source.type !== relation.parentType || stringId(source.id) !== stringId(parentId)) {
    return { changed: false, entity, unsetKeys: [] };
  }
  const lineage = { ...(entity.lineage || {}) };
  for (const key of revisionKeys) delete lineage[key];
  return {
    changed: true,
    unsetKeys: revisionKeys,
    entity: {
      ...entity,
      lineage,
      provenance: {
        ...(entity.provenance || {}),
        parent: {
          source: { type: relation.parentType, id: stringId(parentId), revisionId: stringId(revisionId) },
          scope: revision.data.scope || '',
          revisionNumber: revision.data.number || 0,
          contentHash: revision.data.contentHash || '',
          sourceStatus: revision.data.sourceStatus || null
        }
      }
    }
  };
}

function parentRevisionKeys(relation = {}) {
  const lineageStem = String(relation.lineageKey || '').replace(/Id$/, '');
  return [...new Set([
    `${relation.parentType}RevisionId`,
    `${lineageStem}RevisionId`,
    'parentRevisionId'
  ].filter(Boolean))];
}

async function migrateCollection(db, collection, cursor, transform, selectValue) {
  let scanned = 0;
  let changed = 0;
  let invalid = 0;
  for await (const doc of cursor) {
    scanned += 1;
    const result = await transform(doc);
    if (result.invalid) invalid += 1;
    if (!result.changed) continue;
    changed += 1;
    if (APPLY) {
      await db.collection(collection).replaceOne({ _id: doc._id }, selectValue(result));
    }
  }
  return { scanned, changed, invalid };
}

async function main() {
  const db = await connectDB();
  const summary = {};
  const canonicalUpdates = [];
  const canonicalFailures = [];
  const canonicalCollections = [...new Set([
    'process_definitions',
    ...(cncDomain.entities || []).map(entity => entity.collection).filter(Boolean)
  ])];
  for (const collection of canonicalCollections) {
    const cursor = db.collection(collection).find({});
    for await (const document of cursor) {
      const result = migrateCanonicalEntityTypes(document);
      if (result.unresolved.length) {
        canonicalFailures.push({ collection, id: stringId(document._id), unresolved: result.unresolved });
        continue;
      }
      if (result.changed) canonicalUpdates.push({ collection, id: document._id, document: result.value });
    }
  }
  summary.canonicalEntityTypes = {
    scannedCollections: canonicalCollections.length,
    changed: canonicalUpdates.length,
    invalid: canonicalFailures.length,
    failures: canonicalFailures
  };
  if (APPLY && !canonicalFailures.length) {
    for (const update of canonicalUpdates) {
      await db.collection(update.collection).replaceOne({ _id: update.id }, update.document);
    }
  }
  summary.entityRevisions = await migrateCollection(
    db,
    'entity_revisions',
    db.collection('entity_revisions').find({
      'data.source': { $exists: false },
      'data.entityType': { $exists: true },
      'data.entityId': { $exists: true }
    }),
    revision => {
      const result = migrateLegacyRevisionData(revision.data || {});
      return { changed: result.changed, revision: { ...revision, data: result.data } };
    },
    result => result.revision
  );
  summary.cassetteDesigns = await migrateCollection(
    db,
    'cassette_designs',
    db.collection('cassette_designs').find({
      $or: [
        { 'data.derivedFrom': { $exists: true } },
        { 'lineage.templateId': { $exists: true } }
      ]
    }),
    migrateLegacyDerivedFrom,
    result => result.design
  );
  const entityByType = new Map((cncDomain.entities || []).map(entity => [entity.type, entity]));
  summary.parentRevisions = { scanned: 0, changed: 0, invalid: 0 };
  for (const relation of cncDomain.containment || []) {
    const collection = entityByType.get(relation.childType)?.collection;
    if (!collection) continue;
    const revisionKeys = parentRevisionKeys(relation);
    const cursor = db.collection(collection).find({
      [`lineage.${relation.lineageKey}`]: { $exists: true },
      $or: revisionKeys.map(key => ({ [`lineage.${key}`]: { $exists: true } }))
    });
    for await (const entity of cursor) {
      summary.parentRevisions.scanned += 1;
      const revisionId = revisionKeys.map(key => entity.lineage?.[key]).find(Boolean);
      const revision = revisionId ? await db.collection('entity_revisions').findOne({
        $or: [{ _id: revisionId }, { _id: stringId(revisionId) }]
      }) : null;
      const result = migrateLegacyParentRevision(entity, relation, revision);
      if (!result.changed) {
        summary.parentRevisions.invalid += 1;
        continue;
      }
      summary.parentRevisions.changed += 1;
      if (APPLY) await db.collection(collection).replaceOne({ _id: entity._id }, result.entity);
    }
  }

  if (APPLY) {
    await db.collection('entity_revisions').dropIndex('entity_revision_content_hash').catch(() => {});
    await db.collection('entity_revisions').dropIndex('entity_revision_latest').catch(() => {});
    await db.collection('entity_revisions').createIndex(
      { 'data.source.type': 1, 'data.source.id': 1, 'data.scope': 1, 'data.contentHash': 1 },
      { unique: true, name: 'entity_revision_content_hash' }
    );
    await db.collection('entity_revisions').createIndex(
      { 'data.source.type': 1, 'data.source.id': 1, 'data.scope': 1, 'data.number': -1 },
      { name: 'entity_revision_latest' }
    );
  }
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
  if (summary.canonicalEntityTypes.invalid || summary.cassetteDesigns.invalid || summary.parentRevisions.invalid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
