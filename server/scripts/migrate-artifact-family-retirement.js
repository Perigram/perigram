import { connectDB } from '../db/mongo.js';

// Retires the artifact family's stored data: the plugin declaration
// snapshots lose their retired grammar (attachmentKinds, conversions) and
// their export kinds migrate to the plugin's declared vocabulary
// (LAYOUT_DXF -> dxf); the artifact and artifact-template entity rows,
// their revisions, status history, workflow overrides, GridFS blobs, and
// artifact-linked chat refs die with their types (the type-lifetime
// law). Dry-run by default; `--apply` persists. Idempotent: re-running
// matches nothing once migrated.
const RETIRED_TYPES = ['artifact', 'artifact_template'];
const RETIRED_BUCKETS = ['artifacts', 'artifactTemplates', 'capturePhotos', 'userDxf', 'nestDxf', 'nestSvg'];

async function migrateDeclarations(db, apply) {
  let listings = 0;
  let installs = 0;
  for (const collection of ['plugin_catalog', 'plugin_installs']) {
    const cursor = db.collection(collection).find({
      $or: [
        { 'declarations.attachmentKinds': { $exists: true } },
        { 'declarations.conversions': { $exists: true } },
        { 'declarations.exports.kind': 'LAYOUT_DXF' }
      ]
    });
    for await (const doc of cursor) {
      const update = {
        $unset: { 'declarations.attachmentKinds': '', 'declarations.conversions': '' }
      };
      const exports = (doc.declarations?.exports || []).map(binding => (
        binding?.kind === 'LAYOUT_DXF' ? { ...binding, kind: 'dxf' } : binding
      ));
      update.$set = { 'declarations.exports': exports };
      if (apply) await db.collection(collection).updateOne({ _id: doc._id }, update);
      if (collection === 'plugin_catalog') listings += 1;
      else installs += 1;
    }
  }
  return { listings, installs };
}

async function dropBucket(db, bucketName) {
  let files = 0;
  const cursor = db.collection(`${bucketName}.files').find({});
  for await (const file of cursor) {
    try {
      await db.collection(`${bucketName}.chunks`).deleteMany({ files_id: file._id });
      await db.collection(`${bucketName}.files`).deleteOne({ _id: file._id });
      files += 1;
    } catch {
      // A missing chunk pair must not block the purge of the rest.
    }
  }
  return files;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await connectDB();

  const declarationReport = await migrateDeclarations(db, apply);

  const artifacts = await db.collection('artifacts').countDocuments({});
  const artifactTemplates = await db.collection('artifact_templates').countDocuments({});
  const revisions = await db.collection('entity_revisions').countDocuments({
    'data.source.type': { $in: RETIRED_TYPES }
  });
  const statusEvents = await db.collection('status_events').countDocuments({
    targetType: { $in: RETIRED_TYPES }
  });
  const overrides = await db.collection('workflow_overrides').countDocuments({
    typeId: { $in: RETIRED_TYPES }
  });
  const artifactRefMessages = await db.collection('supportMessages').countDocuments({
    $or: [
      { 'instanceLink.type': { $in: RETIRED_TYPES } },
      { instanceRefs: { $elemMatch: { type: { $in: RETIRED_TYPES } } } }
    ]
  });

  let blobCount = 0;
  for (const bucketName of RETIRED_BUCKETS) {
    blobCount += await db.collection(`${bucketName}.files`).countDocuments({});
  }

  if (apply) {
    await db.collection('artifacts').drop().catch(() => {});
    await db.collection('artifact_templates').drop().catch(() => {});
    await db.collection('entity_revisions').deleteMany({
      'data.source.type': { $in: RETIRED_TYPES }
    });
    await db.collection('status_events').deleteMany({
      targetType: { $in: RETIRED_TYPES }
    });
    await db.collection('workflow_overrides').deleteMany({
      typeId: { $in: RETIRED_TYPES }
    });
    await db.collection('supportMessages').deleteMany({
      'instanceLink.type': { $in: RETIRED_TYPES }
    });
    await db.collection('supportMessages').updateMany({}, [
      { $set: { instanceRefs: { $filter: { input: { $ifNull: ['$instanceRefs', []] }, as: 'ref', cond: { $not: [{ $in: ['$$ref.type', RETIRED_TYPES] }] } } } } }
    ]);
    for (const bucketName of RETIRED_BUCKETS) {
      await dropBucket(db, bucketName);
    }
  }

  console.log(
    `artifact-family retirement ${apply ? 'applied' : 'dry-run'}: ` +
    `${declarationReport.listings} catalog listing(s), ${declarationReport.installs} install(s) redeclared; ` +
    `${artifacts} artifact(s), ${artifactTemplates} template(s), ${revisions} revision(s), ` +
    `${statusEvents} status event(s), ${overrides} workflow override(s), ` +
    `${artifactRefMessages} message(s) carrying artifact refs, ${blobCount} blob(s) in retired buckets.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
