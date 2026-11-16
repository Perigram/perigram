import { connectDB } from '~/server/db/mongo';

const COLLECTION = 'organization_change_sequences';
let indexPromise = null;

async function collection() {
  const db = await connectDB();
  if (!indexPromise) {
    indexPromise = db.collection(COLLECTION).createIndex({ organizationId: 1 }, { unique: true });
  }
  await indexPromise;
  return db.collection(COLLECTION);
}

export async function recordOrganizationChange(organizationId, {
  kind,
  typeId = null,
  instanceId = null,
  paths = [],
  actorId = null
} = {}) {
  if (!organizationId) return null;
  const now = new Date().toISOString();
  const result = await (await collection()).findOneAndUpdate(
    { organizationId: String(organizationId) },
    {
      $inc: { sequence: 1 },
      $set: {
        updatedAt: now,
        lastChange: {
          kind: String(kind || 'data-changed'),
          typeId: typeId == null ? null : String(typeId),
          instanceId: instanceId == null ? null : String(instanceId),
          paths: [...new Set((Array.isArray(paths) ? paths : []).map(String))].sort(),
          actorId: actorId == null ? null : String(actorId),
          at: now
        }
      },
      $setOnInsert: {
        organizationId: String(organizationId),
        createdAt: now
      }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return Number(result?.sequence || 0);
}

export async function getOrganizationChangeSequence(organizationId) {
  if (!organizationId) return null;
  const result = await (await collection()).findOne(
    { organizationId: String(organizationId) },
    { projection: { sequence: 1 } }
  );
  return Number(result?.sequence || 0);
}

// Sequence bracketing is the fallback when a storage snapshot cannot be
// established. Every authoritative write path in the scoped data model
// must increment the same organization counter. A changed boundary retries
// the entire read; it never labels a mixed read as consistent.
export async function withOrganizationChangeSequence(organizationId, read, { retries = 1 } = {}) {
  if (typeof read !== 'function') throw new TypeError('A read callback is required');
  if (!organizationId) {
    return {
      value: await read(),
      boundary: {
        consistency: 'unverified',
        snapshotId: null,
        organizationSequenceStart: null,
        organizationSequenceEnd: null
      }
    };
  }
  let lastStart = null;
  let lastEnd = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const start = await getOrganizationChangeSequence(organizationId);
    const value = await read();
    const end = await getOrganizationChangeSequence(organizationId);
    if (start === end) {
      return {
        value,
        boundary: {
          consistency: 'sequence-bracketed',
          snapshotId: null,
          organizationSequenceStart: start,
          organizationSequenceEnd: end
        }
      };
    }
    lastStart = start;
    lastEnd = end;
  }
  const error = new Error(
    `Organization changed during graph data read (sequence ${lastStart} → ${lastEnd}); retry the evaluation`
  );
  error.statusCode = 409;
  error.code = 'STALE_ORGANIZATION_READ';
  throw error;
}
