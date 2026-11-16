import { randomUUID } from 'node:crypto';
import { connectDB } from '~/server/db/mongo';

const COLLECTION = 'organization_change_sequences';
let indexPromise = null;

async function collection() {
  const db = await connectDB();
  if (!indexPromise) {
    indexPromise = db.collection(COLLECTION).createIndex({ organizationId: 1 }, { unique: true });
  }
  try {
    await indexPromise;
  } catch (error) {
    indexPromise = null;
    throw error;
  }
  return db.collection(COLLECTION);
}

export async function beginOrganizationChange(organizationId) {
  if (!organizationId) return null;
  const token = randomUUID();
  const now = new Date().toISOString();
  await (await collection()).findOneAndUpdate(
    { organizationId: String(organizationId) },
    {
      $inc: { pendingCount: 1 },
      $addToSet: { pendingOperations: token },
      $set: { updatedAt: now },
      $setOnInsert: {
        organizationId: String(organizationId),
        sequence: 0,
        createdAt: now
      }
    },
    { upsert: true, returnDocument: 'after' }
  );
  return token;
}

export async function completeOrganizationChange(organizationId, token, {
  kind,
  typeId = null,
  instanceId = null,
  paths = [],
  actorId = null
} = {}) {
  if (!organizationId || !token) return null;
  const now = new Date().toISOString();
  const result = await (await collection()).findOneAndUpdate(
    { organizationId: String(organizationId), pendingOperations: token },
    {
      $inc: { sequence: 1, pendingCount: -1 },
      $pull: { pendingOperations: token },
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
      }
    },
    { returnDocument: 'after' }
  );
  if (!result) throw new Error('Organization change reservation is no longer pending');
  return Number(result.sequence || 0);
}

export async function cancelOrganizationChange(organizationId, token) {
  if (!organizationId || !token) return null;
  const result = await (await collection()).findOneAndUpdate(
    { organizationId: String(organizationId), pendingOperations: token },
    {
      $inc: { pendingCount: -1 },
      $pull: { pendingOperations: token },
      $set: { updatedAt: new Date().toISOString() }
    },
    { returnDocument: 'after' }
  );
  return Number(result?.sequence || 0);
}

export async function runOrganizationChange(organizationId, metadata, mutate) {
  if (typeof mutate !== 'function') throw new TypeError('A mutation callback is required');
  if (!organizationId) return await mutate();
  const token = await beginOrganizationChange(organizationId);
  let value;
  try {
    value = await mutate();
  } catch (error) {
    await cancelOrganizationChange(organizationId, token);
    throw error;
  }
  // If completion fails, leave the reservation pending. Readers then fail
  // closed instead of claiming a consistent boundary around an unsequenced
  // committed mutation.
  await completeOrganizationChange(organizationId, token, metadata);
  return value;
}

// For already-completed mutations that cannot yet be moved under
// runOrganizationChange. It advances the sequence but should not be used by
// new write paths because it cannot close the pre-write race window.
export async function recordOrganizationChange(organizationId, metadata = {}) {
  if (!organizationId) return null;
  const token = await beginOrganizationChange(organizationId);
  return await completeOrganizationChange(organizationId, token, metadata);
}

async function readBoundary(organizationId) {
  const result = await (await collection()).findOne(
    { organizationId: String(organizationId) },
    { projection: { sequence: 1, pendingCount: 1 } }
  );
  return {
    sequence: Number(result?.sequence || 0),
    pendingCount: Number(result?.pendingCount || 0)
  };
}

export async function getOrganizationChangeSequence(organizationId) {
  if (!organizationId) return null;
  return (await readBoundary(organizationId)).sequence;
}

// Sequence bracketing is the fallback when a storage snapshot cannot be
// established. Pending writers make the boundary unavailable; a changed
// sequence retries the entire read. No mixed read is labeled consistent.
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
  let pending = false;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const start = await readBoundary(organizationId);
    lastStart = start.sequence;
    if (start.pendingCount > 0) {
      pending = true;
      continue;
    }
    const value = await read();
    const end = await readBoundary(organizationId);
    lastEnd = end.sequence;
    if (start.sequence === end.sequence && end.pendingCount === 0) {
      return {
        value,
        boundary: {
          consistency: 'sequence-bracketed',
          snapshotId: null,
          organizationSequenceStart: start.sequence,
          organizationSequenceEnd: end.sequence
        }
      };
    }
    pending ||= end.pendingCount > 0;
  }
  const error = new Error(
    `Organization changed during graph data read (sequence ${lastStart} → ${lastEnd ?? lastStart}${pending ? ', writes pending' : ''}); retry the evaluation`
  );
  error.statusCode = 409;
  error.code = 'STALE_ORGANIZATION_READ';
  throw error;
}
