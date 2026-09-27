// One-way chat vocabulary migration (instance chats): persisted support
// messages, conversation prefs, and read cursors speak the instance
// vocabulary after this runs — `instance:<typeId>:<instanceId>` keys,
// `conversationKind: 'instance'`, `instanceLink`/`instancePath`/
// `instanceRefs` fields, `{{instance:...}}` inline tokens, and
// `instanceRefs[].instance` snapshots. Idempotent: documents without the
// legacy shapes are untouched, and re-running after --apply scans zero
// candidates.
//
//   node server/scripts/migrate-instance-chat-vocabulary.js          # dry-run counts
//   node server/scripts/migrate-instance-chat-vocabulary.js --apply  # persist
import { connectDB } from '../db/mongo.js';

const LEGACY_KEY_PREFIX = 'entity:';

function migrateRefs(refs) {
  if (!Array.isArray(refs)) return refs;
  return refs.map(ref => (
    ref && typeof ref === 'object' && ref.entity !== undefined && ref.instance === undefined
      ? (() => { const { entity, ...rest } = ref; return { ...rest, instance: entity }; })()
      : ref
  ));
}

function migrateBody(message) {
  return typeof message === 'string' && message.includes('{{entity:')
    ? message.replaceAll('{{entity:', '{{instance:')
    : message;
}

function legacyMessageMatch() {
  return {
    $or: [
      { conversationKey: { $regex: /^entity:/ } },
      { conversationKind: 'entity' },
      { entityLink: { $exists: true } },
      { entityPath: { $exists: true } },
      { entityRefs: { $exists: true } }
    ]
  };
}

function messageUpdate(doc) {
  const set = {};
  const unset = {};
  if (typeof doc.conversationKey === 'string' && doc.conversationKey.startsWith(LEGACY_KEY_PREFIX)) {
    set.conversationKey = `instance:${doc.conversationKey.slice(LEGACY_KEY_PREFIX.length)}`;
  }
  if (doc.conversationKind === 'entity') set.conversationKind = 'instance';
  if (doc.entityLink !== undefined && doc.instanceLink === undefined) {
    set.instanceLink = doc.entityLink;
    unset.entityLink = '';
  }
  if (doc.entityPath !== undefined && doc.instancePath === undefined) {
    set.instancePath = doc.entityPath;
    unset.entityPath = '';
  }
  if (doc.entityRefs !== undefined && doc.instanceRefs === undefined) {
    set.instanceRefs = migrateRefs(doc.entityRefs);
    unset.entityRefs = '';
  } else if (doc.instanceRefs !== undefined) {
    set.instanceRefs = migrateRefs(doc.instanceRefs);
  }
  if (typeof doc.message === 'string' && doc.message.includes('{{entity:')) {
    set.message = migrateBody(doc.message);
  }
  return { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) };
}

export async function migrateInstanceChatVocabulary(db, { apply = process.argv.includes('--apply') } = {}) {
  const summary = { supportMessages: { candidates: 0, migrated: 0 } };

  const messages = db.collection('supportMessages');
  const cursor = messages.find(legacyMessageMatch());
  for await (const doc of cursor) {
    summary.supportMessages.candidates += 1;
    if (!apply) continue;
    const result = await messages.updateOne({ _id: doc._id }, messageUpdate(doc));
    summary.supportMessages.migrated += result.modifiedCount;
  }

  for (const [name, collection] of [['supportConversationPrefs', 'supportConversationPrefs'], ['supportConversationReads', 'supportConversationReads']]) {
    const coll = db.collection(collection);
    const filter = { conversationKey: { $regex: /^entity:/ } };
    summary[name] = { candidates: await coll.countDocuments(filter), migrated: 0 };
    if (!apply || !summary[name].candidates) continue;
    const result = await coll.updateMany(filter, [{
      $set: { conversationKey: { $concat: ['instance:', { $substr: ['$conversationKey', 7, -1] }] } }
    }]);
    summary[name].migrated = result.modifiedCount;
  }

  return summary;
}

async function main() {
  const db = await connectDB();
  const apply = process.argv.includes('--apply');
  const summary = await migrateInstanceChatVocabulary(db, { apply });
  console.log(`${apply ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
