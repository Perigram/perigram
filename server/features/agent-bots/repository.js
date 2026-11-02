import { connectDB } from '../../db/mongo.js';

const COLLECTION = 'agent_bot_subscriptions';
const RUNS = 'agent_bot_runs';
let runsIndexEnsured = false;

async function collection() {
    const db = await connectDB();
    await db.collection(COLLECTION).createIndex(
        { botUserId: 1, conversationKey: 1 },
        { unique: true }
    );
    return db.collection(COLLECTION);
}

async function runs() {
    const db = await connectDB();
    const col = db.collection(RUNS);
    if (!runsIndexEnsured) {
        await col.createIndex(
            { lockKey: 1 },
            { unique: true, partialFilterExpression: { outcome: null } }
        );
        runsIndexEnsured = true;
    }
    return col;
}

/**
 * A subscription is the AI in one conversation: group and instance
 * (organization) chats are opt-in per room; direct chats answer
 * implicitly and carry profile-only rows (the conversation is still a
 * model execution point). `botUserId` is the organization's assistant —
 * the only bot member. `conversationKind` and `organizationId` ride the
 * row so triggers and cleanup never re-derive them from the key. Each
 * wake rule carries `createdBy` — its author is the delegation
 * principal when the rule fires (SPEC: agent wakes).
 */
export async function upsertSubscription({ botUserId, conversationKey, conversationKind, organizationId, wakeOn = null, profile = '', model = '' }) {
    const col = await collection();
    const normalizedWakeOn = Array.isArray(wakeOn)
        ? wakeOn.map(rule => ({
            type: String(rule.type),
            state: String(rule.state),
            ...(rule.profile ? { profile: String(rule.profile) } : {}),
            createdBy: String(rule.createdBy || '')
        }))
        : null;
    await col.updateOne(
        { botUserId: String(botUserId), conversationKey: String(conversationKey) },
        {
            $set: {
                conversationKind: String(conversationKind || ''),
                organizationId: organizationId?.toString?.() || null,
                updatedAt: new Date(),
                wakeOn: normalizedWakeOn,
                profile: String(profile || ''),
                model: String(model || '')
            },
            $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
    );
    return { botUserId: String(botUserId), conversationKey: String(conversationKey) };
}

export async function removeSubscription(botUserId, conversationKey) {
    const col = await collection();
    await col.deleteOne({ botUserId: String(botUserId), conversationKey: String(conversationKey) });
    return { removed: true };
}

export async function findSubscriptionsByConversation(conversationKeys = []) {
    if (!conversationKeys.length) return [];
    const col = await collection();
    return await col.find({ conversationKey: { $in: conversationKeys.map(String) } }).toArray();
}

export async function findSubscriptionsByBot(botUserId) {
    const col = await collection();
    return await col.find({ botUserId: String(botUserId) }).toArray();
}

/**
 * Wake-matching read for the scanner: subscriptions carrying a `wakeOn`
 * rule for the exact type + primary state. Instance-scope narrowing (the
 * event's target must be the subscription's own instance) is the
 * caller's in-memory check — the query stays shape-simple.
 */
export async function findWakeSubscriptions({ type, state }) {
    const col = await collection();
    return await col.find({
        wakeOn: { $elemMatch: { type: String(type || ''), state: String(state || '') } }
    }).toArray();
}

export async function removeSubscriptionsByBot(botUserId) {
    const col = await collection();
    await col.deleteMany({ botUserId: String(botUserId) });
}

export async function removeSubscriptionsByConversation(conversationKey) {
    const col = await collection();
    await col.deleteMany({ conversationKey: String(conversationKey) });
}

// --- Room runs ---------------------------------------------------------------
// One persisted document per run; `state` is the room's machine state,
// `outcome` its terminal outcome, and `queue` the coalesced trigger set.
// The unique partial index keeps one non-terminal run per room.

export async function insertRun(doc) {
    const col = await runs();
    const now = new Date();
    const record = {
        ...doc,
        state: String(doc.state || 'running'),
        outcome: null,
        queue: doc.queue || [],
        question: doc.question || null,
        answer: doc.answer || '',
        error: null,
        startedAt: doc.startedAt || now,
        updatedAt: now,
        settledAt: null
    };
    await col.insertOne(record);
    return record;
}

export async function findNonTerminalRuns({ olderThan = null, limit = 200 } = {}) {
    const col = await runs();
    const filter = { outcome: null };
    if (olderThan) filter.updatedAt = { $lt: olderThan };
    return await col.find(filter).limit(Number(limit) || 200).toArray();
}

/** Raw fact write on a non-terminal run. */
export async function updateRun(runId, patch) {
    const col = await runs();
    const result = await col.updateOne(
        { _id: String(runId), outcome: null },
        { $set: { ...patch, updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}

/** Guarded state edge: applies only while the run is in one of `from`. */
export async function transitionRun(runId, from, to, patch = {}) {
    const col = await runs();
    const result = await col.updateOne(
        { _id: String(runId), outcome: null, state: { $in: from.map(String) } },
        { $set: { ...patch, state: String(to), updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}

/** Terminal settle: the first outcome wins; later calls are no-ops. */
export async function settleRun(runId, outcome, patch = {}) {
    const col = await runs();
    const result = await col.updateOne(
        { _id: String(runId), outcome: null },
        { $set: { ...patch, outcome: String(outcome), settledAt: new Date(), updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
}
