import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
    createOutboxQueue,
    createIndexedDbStorage,
    newOperationId,
    isNetworkFailure,
    classifyReplayFailure,
    OfflineQueuedError,
    REPLAY_CONTINUE
} from '~/utils/outbox.js'
import { emitInstanceMutation, emitStateTransitionResult } from '~/utils/instance-events.js'

const queue = createOutboxQueue({ storage: createIndexedDbStorage() })

export const useOutboxStore = defineStore('outbox', () => {
    const operations = ref([])
    const online = ref(true)
    const syncing = ref(false)
    let listenersBound = false

    const pendingOperations = computed(() => operations.value.filter(op => op.status !== 'failed'))
    const failedOperations = computed(() => operations.value.filter(op => op.status === 'failed'))

    function emitOperationResult(operation, data = null, duplicate = false) {
        const meta = operation.meta || {}
        const hasSnapshot = Boolean(!duplicate && data)
        if (meta.kind === 'transition') {
            emitStateTransitionResult({ typeId: meta.typeId, targetId: meta.instanceId, response: hasSnapshot ? data : null })
            return
        }
        const change = meta.kind === 'action' ? 'updated' : (meta.change || 'updated')
        emitInstanceMutation({
            type: meta.typeId,
            id: hasSnapshot ? (data?.entity?._id || data?._id) : meta.instanceId,
            instance: hasSnapshot ? (meta.kind === 'instance' ? data : (data?.entity || null)) : null,
            change,
            reason: meta.reason || `outbox-${meta.kind}`,
            source: 'outbox'
        })
    }

    async function refreshFromStorage() {
        operations.value = await queue.list()
    }

    async function flush() {
        if (syncing.value) return
        const pending = operations.value.filter(op => op.status !== 'failed')
        if (!pending.length) return
        syncing.value = true
        try {
            for (const operation of pending) {
                try {
                    const data = await $fetch(operation.url, {
                        method: operation.method,
                        body: operation.body,
                        headers: { 'Idempotency-Key': operation.id }
                    })
                    emitOperationResult(operation, data)
                    await queue.remove(operation.id)
                } catch (error) {
                    if (error?.data?.duplicate) {
                        emitOperationResult(operation, null, true)
                        await queue.remove(operation.id)
                        continue
                    }
                    if (classifyReplayFailure(error) !== REPLAY_CONTINUE) {
                        if (error && Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
                            await queue.update(operation.id, {
                                status: 'failed',
                                lastError: error.data?.message || `HTTP ${error.statusCode}`,
                                attempts: (operation.attempts || 0) + 1
                            })
                            console.warn('[outbox] operation rejected, kept for review', operation.id, error?.statusCode)
                        } else {
                            break
                        }
                    }
                }
                await refreshFromStorage()
            }
        } finally {
            syncing.value = false
            await refreshFromStorage()
        }
    }

    async function mutate({ url, method, body, meta = {} }) {
        const id = newOperationId()
        const headers = { 'Idempotency-Key': id }
        // The browser's own offline state gates the fast path; a
        // failure-latched tab with the browser online still attempts, so
        // one success heals the latch and replays the queue.
        if (typeof window !== 'undefined' && window.navigator.onLine === false) {
            const operation = { id, url, method, body, meta, createdAt: new Date().toISOString(), attempts: 0 }
            await queue.enqueue(operation)
            await refreshFromStorage()
            throw new OfflineQueuedError(id)
        }
        try {
            const result = await $fetch(url, { method, body, headers })
            if (!online.value) {
                online.value = true
                flush()
            }
            return result
        } catch (error) {
            if (isNetworkFailure(error)) {
                online.value = false
                const operation = { id, url, method, body, meta, createdAt: new Date().toISOString(), attempts: 0 }
                await queue.enqueue(operation)
                await refreshFromStorage()
                throw new OfflineQueuedError(id)
            }
            throw error
        }
    }

    async function retry(operationId) {
        await queue.update(operationId, { status: 'pending', lastError: null })
        await refreshFromStorage()
        if (online.value) await flush()
    }

    async function discard(operationId) {
        await queue.remove(operationId)
        await refreshFromStorage()
    }

    function bindConnectivityListeners() {
        if (listenersBound || typeof window === 'undefined') return
        listenersBound = true
        online.value = window.navigator.onLine
        window.addEventListener('online', () => {
            online.value = true
            flush()
        })
        window.addEventListener('offline', () => {
            online.value = false
        })
    }

    async function init() {
        bindConnectivityListeners()
        await refreshFromStorage()
        if (online.value) await flush()
    }

    return {
        operations,
        online,
        syncing,
        pendingOperations,
        failedOperations,
        init,
        mutate,
        flush,
        retry,
        discard
    }
})
