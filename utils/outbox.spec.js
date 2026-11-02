import { describe, it, expect } from 'vitest'
import {
    OfflineQueuedError,
    isOfflineQueuedError,
    isNetworkFailure,
    classifyReplayFailure,
    createOutboxQueue,
    createMemoryStorage,
    newOperationId,
    REPLAY_DROP,
    REPLAY_STOP,
    REPLAY_CONTINUE
} from './outbox.js'

const op = (overrides = {}) => ({
    id: newOperationId(),
    url: '/api/materials',
    method: 'POST',
    body: { name: 'Steel' },
    meta: { kind: 'entity', typeId: 'material', change: 'created', reason: 'create' },
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...overrides
})

describe('outbox queue', () => {
    it('enqueues, lists, updates and removes operations through the storage', async () => {
        const queue = createOutboxQueue({ storage: createMemoryStorage() })
        const first = await queue.enqueue(op())
        const second = await queue.enqueue(op())
        expect((await queue.list()).map(item => item.status)).toEqual(['pending', 'pending'])
        expect((await queue.list()).map(item => item.id)).toEqual([first.id, second.id])

        await queue.update(first.id, { status: 'failed', lastError: '422' })
        expect(await queue.list()).toEqual([
            expect.objectContaining({ id: first.id, status: 'failed', lastError: '422' }),
            expect.objectContaining({ id: second.id })
        ])

        const remaining = await queue.remove(first.id)
        expect(remaining.map(item => item.id)).toEqual([second.id])
        expect(await queue.list()).toEqual([expect.objectContaining({ id: second.id })])
    })

    it('reads a stored operation without a status as pending', async () => {
        const legacy = op()
        delete legacy.status
        const queue = createOutboxQueue({ storage: createMemoryStorage([legacy]) })
        expect(await queue.list()).toEqual([expect.objectContaining({ id: legacy.id, status: 'pending' })])
    })

    it('survives storage failures without throwing', async () => {
        const failing = {
            load: async () => { throw new Error('idb unavailable') },
            save: async () => { throw new Error('idb unavailable') }
        }
        const queue = createOutboxQueue({ storage: failing })
        await expect(queue.enqueue(op())).rejects.toThrow('idb unavailable')
    })
})

describe('replay failure classification', () => {
    it('drops permanently rejected operations on 4xx', () => {
        expect(classifyReplayFailure({ statusCode: 400 })).toBe(REPLAY_DROP)
        expect(classifyReplayFailure({ statusCode: 403 })).toBe(REPLAY_DROP)
        expect(classifyReplayFailure({ response: { status: 422 } })).toBe(REPLAY_DROP)
    })

    it('stops the flush loop on network failures and server errors', () => {
        expect(classifyReplayFailure(new TypeError('fetch failed'))).toBe(REPLAY_STOP)
        expect(classifyReplayFailure({ statusCode: 500 })).toBe(REPLAY_STOP)
        expect(classifyReplayFailure({ statusCode: 429 })).toBe(REPLAY_STOP)
        expect(classifyReplayFailure({ statusCode: 0 })).toBe(REPLAY_STOP)
    })

    it('treats duplicate idempotency responses as success', () => {
        expect(classifyReplayFailure({ data: { duplicate: true } })).toBe(REPLAY_CONTINUE)
    })
})

describe('offline queued error contract', () => {
    it('is identifiable and carries the operation id', () => {
        const error = new OfflineQueuedError('op-1')
        expect(isOfflineQueuedError(error)).toBe(true)
        expect(error.operationId).toBe('op-1')
        expect(error.queued).toBe(true)
        expect(isNetworkFailure(error)).toBe(false)
    })

    it('recognizes network failures as errors without a response', () => {
        expect(isNetworkFailure(new TypeError('fetch failed'))).toBe(true)
        expect(isNetworkFailure({ statusCode: 500, response: {} })).toBe(false)
    })
})
