import { randomUUID } from 'node:crypto';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const SESSIONS_COLLECTION = 'config_bot_sessions';
const KNOWLEDGE_COLLECTION = 'config_bot_knowledge_chunks';

export function createSessionId() {
  return `cb-${randomUUID()}`;
}

export async function createSession({ userId, title, context = {}, mode = 'generate' } = {}) {
  const db = await connectDB();
  const now = new Date();
  const doc = {
    _id: createSessionId(),
    userId,
    title,
    context,
    mode,
    messages: [],
    drafts: [],
    createdAt: now,
    updatedAt: now
  };
  await db.collection(SESSIONS_COLLECTION).insertOne(doc);
  return doc;
}

export async function findSessionById(id, userId = null) {
  const db = await connectDB();
  const filter = { _id: toFlexibleId(id) };
  if (userId) filter.userId = userId;
  return db.collection(SESSIONS_COLLECTION).findOne(filter);
}

export async function appendMessage(sessionId, message) {
  const db = await connectDB();
  await db.collection(SESSIONS_COLLECTION).updateOne(
    { _id: toFlexibleId(sessionId) },
    {
      $push: { messages: { ...message, createdAt: message.createdAt || new Date() } },
      $set: { updatedAt: new Date() }
    }
  );
  return findSessionById(sessionId);
}

export async function appendDraft(sessionId, draftPackage) {
  const db = await connectDB();
  await db.collection(SESSIONS_COLLECTION).updateOne(
    { _id: toFlexibleId(sessionId) },
    {
      $push: {
        drafts: {
          id: draftPackage.id,
          title: draftPackage.title,
          route: draftPackage.route,
          createdAt: draftPackage.generatedAt,
          validation: draftPackage.validation
        }
      },
      $set: { updatedAt: new Date() }
    }
  );
  return findSessionById(sessionId);
}

export async function replaceKnowledgeChunks(source, chunks = []) {
  const db = await connectDB();
  const collection = db.collection(KNOWLEDGE_COLLECTION);
  await collection.deleteMany({ source });
  if (!chunks.length) return { source, count: 0 };

  const now = new Date();
  await collection.insertMany(chunks.map((chunk, index) => ({
    _id: `${source}:${index}:${randomUUID()}`,
    ...chunk,
    source,
    createdAt: now,
    updatedAt: now
  })));
  return { source, count: chunks.length };
}

export async function listKnowledgeChunks({ limit = 500 } = {}) {
  const db = await connectDB();
  return db.collection(KNOWLEDGE_COLLECTION)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 500, 1000))
    .toArray();
}
