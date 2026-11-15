import { createError } from 'h3';

/**
 * Connections capability module: one canonical realtime layer for the app.
 *
 * It owns an in-memory registry of live SSE connections per Nitro worker,
 * topic-based publish/subscribe, and organization presence derived from the
 * same registry. Nothing here persists; feature services remain the
 * persistence source of truth and publish through this module when a write
 * should reach connected clients.
 *
 * Topics:
 * - `user:<userId>`   self only; per-user pings such as inbox refreshes.
 * - `org:<orgId>`     organization members; presence snapshots.
 * - `admin-support`   admins; support-channel inbox changes.
 * - `conversation:<key>` participants (or admins); chat message and read events.
 *   Admission for `conversation:` topics is delegated to the support feature
 *   through `registerTopicAuthorizer`, so this module owns transport, not
 *   conversation authorization.
 */

const connections = new Map();
const topicAuthorizers = new Map();
let nextConnectionId = 1;

const topicDefaults = (auth) => {
    const topics = [`user:${auth.userId}`];
    if (auth.organizationId) topics.push(`org:${auth.organizationId}`);
    return topics;
};

async function isTopicAllowed(auth, topic) {
    if (topic.startsWith('user:')) return topic === `user:${auth.userId}`;
    if (topic.startsWith('org:')) return Boolean(auth.organizationId) && topic === `org:${auth.organizationId}`;
    if (topic === 'admin-support') return Boolean(auth.isAdmin);
    for (const [prefix, authorize] of topicAuthorizers) {
        if (!topic.startsWith(prefix)) continue;
        try {
            return Boolean(await authorize(auth, topic));
        } catch {
            return false;
        }
    }
    return false;
}

export function registerTopicAuthorizer(prefix, authorize) {
    topicAuthorizers.set(prefix, authorize);
}

export function orgPresence(orgId) {
    if (!orgId) return [];
    const online = new Map();
    for (const conn of connections.values()) {
        if (conn.orgId === orgId) {
            online.set(conn.userId, (online.get(conn.userId) || 0) + 1);
        }
    }
    return Array.from(online, ([userId, connectionCount]) => ({ userId, connections: connectionCount }));
}

export function userPresence(userId) {
    if (!userId) return 0;
    let count = 0;
    for (const conn of connections.values()) {
        if (String(conn.userId) === String(userId)) count += 1;
    }
    return count;
}

let publishListener = null;

/**
 * Registers a single publish observer (used by the notifications feature to
 * fan user-topic events out as Web Push when the user has no live tab).
 * The listener must never throw into the publish path.
 */
export function onPublish(listener) {
    publishListener = typeof listener === 'function' ? listener : null;
}

function publishToTopic(topic, payload) {
    const envelope = JSON.stringify({ topic, payload, ts: Date.now() });
    for (const conn of connections.values()) {
        if (conn.topics.has(topic) && typeof conn.push === 'function') {
            try {
                conn.push(envelope);
            } catch {
                /* a dead push must never break fanout for other connections */
            }
        }
    }
}

async function broadcastPresence(orgId) {
    if (!orgId) return;
    publishToTopic(`org:${orgId}`, { type: 'presence', online: orgPresence(orgId) });
}

export async function registerConnection({ auth, push }) {
    if (!auth?.userId) throw new Error('Connections require an authenticated context');
    const id = `conn:${nextConnectionId++}`;
    const conn = {
        id,
        auth,
        userId: auth.userId,
        orgId: auth.organizationId || null,
        topics: new Set(topicDefaults(auth))
    };
    connections.set(id, conn);
    conn.push = push;
    await broadcastPresence(conn.orgId);
    return {
        id,
        topics: Array.from(conn.topics),
        presence: orgPresence(conn.orgId)
    };
}

export async function unregisterConnection(connectionId) {
    const conn = connections.get(connectionId);
    if (!conn) return;
    connections.delete(connectionId);
    await broadcastPresence(conn.orgId);
}

/**
 * Replaces the connection's requested topic set: defaults always stay, the
 * requested list is filtered through topic admission. Idempotent — clients
 * call it after every (re)connect to resynchronize their subscriptions.
 */
export async function syncTopics(connectionId, requested = [], auth = {}) {
    const conn = connections.get(connectionId);
    if (!conn || String(conn.userId) !== String(auth.userId || '')) {
        throw createError({ statusCode: 403, message: 'Connection does not belong to the authenticated user' });
    }
    conn.topics = new Set(topicDefaults(conn.auth));
    for (const topic of requested) {
        // eslint-disable-next-line no-await-in-loop
        if (await isTopicAllowed(conn.auth, topic)) {
            conn.topics.add(topic);
        }
    }
    return { subscribed: Array.from(conn.topics) };
}

export function connectionTopics(connectionId) {
    const conn = connections.get(connectionId);
    return conn ? Array.from(conn.topics) : [];
}

export function publish(topic, payload) {
    publishToTopic(topic, payload);
    if (publishListener) {
        try {
            publishListener(topic, payload);
        } catch {
            /* notification fanout must never break realtime delivery */
        }
    }
}

/** Test-only: resets the in-memory connection registry between spec cases. */
export function __clearRegistryForTests() {
    connections.clear();
    nextConnectionId = 1;
}
