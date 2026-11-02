import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// In-memory outbox storage: the queue logic stays real, only persistence
// is swapped. The array rides a global so tests can reset it.
globalThis.__outboxOps = [];
vi.mock('~/utils/outbox.js', async importOriginal => ({
    ...(await importOriginal()),
    createIndexedDbStorage: () => ({
        load: async () => globalThis.__outboxOps,
        save: async operations => { globalThis.__outboxOps = operations; }
    })
}));
vi.mock('~/composables/useConnections.js', () => ({
    useConnections: () => ({ subscribe: () => () => {} })
}));

const { useOutboxStore } = await import('./outbox.js');

const networkFailure = Object.assign(new Error('fetch failed'), {});

describe('outbox store', () => {
    let fetchMock;
    beforeEach(() => {
        setActivePinia(createPinia());
        globalThis.__outboxOps = [];
        fetchMock = vi.fn();
        vi.stubGlobal('$fetch', fetchMock);
        vi.stubGlobal('window', Object.assign(new EventTarget(), { navigator: { onLine: true } }));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('a network failure latches offline and queues the mutation', async () => {
        fetchMock.mockRejectedValueOnce(networkFailure);
        const store = useOutboxStore();
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(globalThis.__outboxOps).toHaveLength(1);
    });

    it('a latched tab with the browser online still attempts: one success heals the latch and replays the queue', async () => {
        fetchMock.mockRejectedValueOnce(networkFailure);
        const store = useOutboxStore();
        await expect(store.mutate({ url: '/api/first', method: 'POST', body: {}, meta: { kind: 'action' } }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });

        // The latch is set; the browser itself reports online. The next
        // mutation must attempt the fetch, succeed, heal, and flush the
        // queued operation through the same endpoint.
        fetchMock.mockResolvedValueOnce({ ok: true });
        fetchMock.mockResolvedValueOnce({ replayed: true });
        const result = await store.mutate({ url: '/api/second', method: 'POST', body: {}, meta: { kind: 'action' } });
        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1][0]).toBe('/api/second');
        expect(fetchMock.mock.calls[2][0]).toBe('/api/first');
        await vi.waitFor(() => expect(globalThis.__outboxOps).toHaveLength(0));
    });

    it('the browser offline gates the fast path without any fetch attempt', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalThis.__outboxOps).toHaveLength(1);
    });

    it('a healthy tab fetches directly and queues nothing', async () => {
        fetchMock.mockResolvedValueOnce({ fine: true });
        const store = useOutboxStore();
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} })).resolves.toEqual({ fine: true });
        expect(globalThis.__outboxOps).toHaveLength(0);
    });

    it('persists the pending state when an operation is queued offline', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        expect(globalThis.__outboxOps).toEqual([
            expect.objectContaining({ url: '/api/x', status: 'pending', attempts: 0 })
        ]);
        expect(store.online).toBe(false);
        expect(store.pendingOperations).toHaveLength(1);
        expect(store.failedOperations).toHaveLength(0);
    });

    it('replays the queue when the browser returns online', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await store.init();
        await expect(store.mutate({ url: '/api/queued', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        window.navigator.onLine = true;
        fetchMock.mockResolvedValueOnce({ replayed: true });
        window.dispatchEvent(new Event('online'));
        await vi.waitFor(() => expect(globalThis.__outboxOps).toHaveLength(0));
        expect(fetchMock).toHaveBeenCalledWith('/api/queued', expect.objectContaining({ method: 'POST' }));
        expect(store.online).toBe(true);
    });

    it('settles a 4xx replay as failed and continues with the rest of the queue', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/first', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        await expect(store.mutate({ url: '/api/second', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });

        fetchMock.mockRejectedValueOnce({ statusCode: 422, response: {}, data: { message: 'invalid' } });
        fetchMock.mockResolvedValueOnce({ replayed: true });
        await store.flush();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(globalThis.__outboxOps).toEqual([
            expect.objectContaining({ url: '/api/first', status: 'failed', lastError: 'invalid', attempts: 1 })
        ]);
        expect(store.failedOperations).toHaveLength(1);
        expect(store.pendingOperations).toHaveLength(0);
    });

    it('retries a failed operation and removes it on success', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        fetchMock.mockRejectedValueOnce({ statusCode: 400, response: {}, data: { message: 'bad request' } });
        await store.flush();
        expect(globalThis.__outboxOps[0]).toMatchObject({ status: 'failed' });

        fetchMock.mockResolvedValueOnce({ ok: true });
        store.online = true;
        await store.retry(globalThis.__outboxOps[0].id);
        expect(globalThis.__outboxOps).toHaveLength(0);
        expect(store.failedOperations).toHaveLength(0);
    });

    it('discards a failed operation', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        fetchMock.mockRejectedValueOnce({ statusCode: 403, response: {}, data: {} });
        await store.flush();
        const id = globalThis.__outboxOps[0].id;
        await store.discard(id);
        expect(globalThis.__outboxOps).toEqual([]);
    });

    it('removes a duplicate replay as a successful settlement', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/x', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        fetchMock.mockRejectedValueOnce({ statusCode: 409, response: {}, data: { duplicate: true } });
        await store.flush();
        expect(globalThis.__outboxOps).toHaveLength(0);
    });

    it('leaves an operation pending and stops the flush on a server or network failure', async () => {
        const store = useOutboxStore();
        window.navigator.onLine = false;
        await expect(store.mutate({ url: '/api/first', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });
        await expect(store.mutate({ url: '/api/second', method: 'POST', body: {} }))
            .rejects.toMatchObject({ name: 'OfflineQueuedError' });

        store.online = true;
        fetchMock.mockRejectedValueOnce({ statusCode: 503, response: {}, data: {} });
        await store.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(globalThis.__outboxOps).toEqual([
            expect.objectContaining({ url: '/api/first', status: 'pending', attempts: 0 }),
            expect.objectContaining({ url: '/api/second', status: 'pending', attempts: 0 })
        ]);
        expect(store.online).toBe(true);

        fetchMock.mockRejectedValueOnce(networkFailure);
        await store.flush();
        expect(store.online).toBe(false);
        expect(globalThis.__outboxOps[0]).toMatchObject({ status: 'pending' });
    });
});
