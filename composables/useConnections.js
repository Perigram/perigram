import { computed, ref } from 'vue'

/**
 * Singleton per browser tab. The module scope holds the EventSource so every
 * consumer shares one connections stream; the server registers the connection
 * with the user and organization topics and reports its connectionId in the
 * `ready` event, which clients echo back in subscription syncs after every
 * (re)connect.
 */
const status = ref('idle')
const onlineUsers = ref([])
let source = null
let connectionId = null
let syncing = false
let pendingSync = false
const handlers = new Map()
const desiredTopics = new Set()

const onlineUserIds = computed(() => new Set(onlineUsers.value.map(entry => entry.userId)))

let syncAttempts = 0

async function syncSubscriptions() {
    if (!connectionId || !desiredTopics.size) return
    if (syncing) {
        pendingSync = true
        return
    }
    syncing = true
    let ok = false
    let staleConnection = false
    try {
        await $fetch('/api/connections/subscriptions', {
            method: 'POST',
            body: { connectionId, topics: Array.from(desiredTopics) }
        })
        ok = true
    } catch (error) {
        // 403 means the server no longer knows this connection id (dev
        // rebuilds and redeploys drop the in-memory registry): retrying the
        // same id can never succeed, so reopen the stream — the fresh ready
        // event carries a new id and desired topics resync.
        if (error?.response?.status === 403 || error?.data?.statusCode === 403 || error?.statusCode === 403) {
            staleConnection = true
        } else {
            console.error('Failed to sync connection subscriptions:', error)
        }
    }
    syncing = false
    if (staleConnection) {
        resetStream()
        return
    }
    if (ok) {
        syncAttempts = 0
        if (pendingSync) {
            pendingSync = false
            syncSubscriptions()
        }
        return
    }
    if (syncAttempts < 5) {
        syncAttempts += 1
        pendingSync = true
        setTimeout(() => {
            if (pendingSync && !syncing) {
                pendingSync = false
                syncSubscriptions()
            }
        }, 750 * syncAttempts)
    }
}

function resetStream() {
    if (source) {
        source.close()
        source = null
    }
    connectionId = null
    status.value = 'reconnecting'
    syncAttempts = 0
    setTimeout(ensureConnection, 500)
}

function handleMessage(rawEvent) {
    let parsed
    try {
        parsed = JSON.parse(rawEvent.data)
    } catch {
        return
    }
    if (parsed.type === 'heartbeat') return
    if (parsed.type === 'ready') {
        connectionId = parsed.connectionId
        if (Array.isArray(parsed.presence)) onlineUsers.value = parsed.presence
        status.value = 'open'
        syncSubscriptions()
        return
    }
    if (parsed.topic?.startsWith('org:') && parsed.payload?.type === 'presence') {
        onlineUsers.value = parsed.payload.online || []
        return
    }
    const topicHandlers = handlers.get(parsed.topic)
    if (!topicHandlers) return
    for (const handler of topicHandlers) {
        try {
            handler(parsed.payload, parsed)
        } catch (error) {
            console.error(`Connection topic handler failed for ${parsed.topic}:`, error)
        }
    }
}

function ensureConnection() {
    if (!import.meta.client || source) return
    status.value = 'connecting'
    source = new EventSource('/api/connections/events')
    source.onmessage = handleMessage
    source.onopen = () => {
        status.value = 'open'
    }
    source.onerror = () => {
        status.value = 'error'
        // A closed EventSource never recovers by itself (server rebuilds can
        // terminate the stream); reopen so the ready event re-registers us.
        if (source?.readyState === EventSource.CLOSED) resetStream()
    }
}

/**
 * Subscribes a handler to a topic on the shared connections stream. The
 * returned function unsubscribes; when the last handler for a topic goes
 * away, the topic is dropped from the server-side subscription sync.
 */
export function useConnections() {
    const subscribe = (topic, handler) => {
        if (!topic || typeof handler !== 'function') return () => {}
        if (!handlers.has(topic)) handlers.set(topic, new Set())
        handlers.get(topic).add(handler)
        ensureConnection()
        if (!desiredTopics.has(topic)) {
            desiredTopics.add(topic)
            syncSubscriptions()
        }
        return () => {
            const topicHandlers = handlers.get(topic)
            if (!topicHandlers) return
            topicHandlers.delete(handler)
            if (!topicHandlers.size) {
                handlers.delete(topic)
                if (desiredTopics.has(topic)) {
                    desiredTopics.delete(topic)
                    syncSubscriptions()
                }
            }
        }
    }

    return {
        status,
        onlineUsers,
        onlineUserIds,
        subscribe
    }
}
