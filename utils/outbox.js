export const OUTBOX_DB_NAME = 'perigram-outbox'
export const OUTBOX_STORE_NAME = 'operations'

export class OfflineQueuedError extends Error {
    constructor(operationId, message = 'Queued offline: will sync when back online') {
        super(message)
        this.name = 'OfflineQueuedError'
        this.operationId = operationId
        this.queued = true
    }
}

export function isOfflineQueuedError(error) {
    return error?.name === 'OfflineQueuedError'
}

export function isNetworkFailure(error) {
    return Boolean(error) && !error.response && !error.statusCode && !isOfflineQueuedError(error)
}

export const REPLAY_DROP = 'drop'
export const REPLAY_STOP = 'stop'
export const REPLAY_CONTINUE = 'continue'

export function classifyReplayFailure(error) {
    if (!error) return REPLAY_CONTINUE
    if (error.data?.duplicate) return REPLAY_CONTINUE
    if (isNetworkFailure(error)) return REPLAY_STOP
    const status = Number(error.statusCode || error.response?.status)
    if (status >= 500 || status === 429) return REPLAY_STOP
    if (status >= 400) return REPLAY_DROP
    return REPLAY_STOP
}

export function newOperationId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createOutboxQueue({ storage }) {
    const persist = (operations) => storage.save(operations).catch(() => null)

    return {
        async list() {
            return storage.load()
        },
        async enqueue(operation) {
            const operations = await storage.load()
            const stored = [...operations, operation]
            await persist(stored)
            return operation
        },
        async remove(operationId) {
            const operations = await storage.load()
            const stored = operations.filter(op => op.id !== operationId)
            await persist(stored)
            return stored
        },
        async update(operationId, changes) {
            const operations = await storage.load()
            const stored = operations.map(op => (op.id === operationId ? { ...op, ...changes } : op))
            await persist(stored)
            return stored
        }
    }
}

export function createIndexedDbStorage() {
    let dbPromise = null

    const openDb = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(OUTBOX_DB_NAME, 1)
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
                        request.result.createObjectStore(OUTBOX_STORE_NAME)
                    }
                }
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
        }
        return dbPromise
    }

    const withStore = async (mode, run) => {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(OUTBOX_STORE_NAME, mode)
            const store = tx.objectStore(OUTBOX_STORE_NAME)
            const request = run(store)
            tx.oncomplete = () => resolve(request?.result)
            tx.onerror = () => reject(tx.error)
        })
    }

    return {
        async load() {
            try {
                const all = await withStore('readonly', store => store.getAll())
                return Array.isArray(all) ? all : []
            } catch {
                return []
            }
        },
        async save(operations) {
            await withStore('readwrite', (store) => {
                store.clear()
                for (const operation of operations) store.put(operation, operation.id)
            })
        }
    }
}

export function createMemoryStorage(initial = []) {
    let operations = [...initial]
    return {
        async load() {
            return [...operations]
        },
        async save(next) {
            operations = [...next]
        }
    }
}
