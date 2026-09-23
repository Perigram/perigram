import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityEventsStore } from './instanceEvents.js';

// The connections composable is stubbed with a capturable handler registry
// so the contract-refresh subscription is directly invokable in tests.
const orgTopicHandlers = new Map();
vi.mock('~/composables/useConnections.js', () => ({
    useConnections: () => ({
        subscribe: (topic, handler) => {
            if (!orgTopicHandlers.has(topic)) orgTopicHandlers.set(topic, new Set());
            orgTopicHandlers.get(topic).add(handler);
            return () => orgTopicHandlers.get(topic)?.delete(handler);
        }
    })
}));

describe('entity events store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.stubGlobal('window', new EventTarget());
        vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('polls by cursor and bridges returned changes into browser-local events', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ cursor: 4, events: [] })
            .mockResolvedValueOnce({
                cursor: 5,
                events: [{ type: 'queue', id: 'queue-1', change: 'updated' }]
            });
        vi.stubGlobal('$fetch', fetchMock);
        const received = [];
        window.addEventListener('perigram:instance-changed', event => received.push(event.detail));

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(15_000);

        expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/instance-events', { query: undefined });
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/instance-events', { query: { after: 4 } });
        expect(received).toEqual([
            expect.objectContaining({ type: 'queue', id: 'queue-1', source: 'server' })
        ]);
        expect(store.connected).toBe(true);
    });

    it('retries a completed request after a transient failure', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValueOnce({ cursor: 9, events: [] });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.connected).toBe(false);
        await vi.advanceTimersByTimeAsync(5_000);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(store.connected).toBe(true);
    });

    it('pauses background polling and reconnects when the tab becomes visible', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ cursor: 4, events: [] });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        document.visibilityState = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(30_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        document.visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe('contract refresh hint', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.stubGlobal('window', new EventTarget());
        vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
        orgTopicHandlers.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('re-hydrates auth once (debounced) when the org topic publishes contractChanged', async () => {
        const { useAuthStore } = await import('./auth.js');
        useAuthStore().user = { userId: 'u-1', organizationId: 'org-1' };

        const fetchMock = vi.fn()
            .mockResolvedValue({ cursor: 1, events: [] })
            .mockResolvedValueOnce({ userId: 'u-1', organizationId: 'org-1' });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);

        const handlers = orgTopicHandlers.get('org:org-1');
        expect(handlers?.size).toBe(1);
        for (const handler of handlers) handler({ type: 'contractChanged', data: { kind: 'registry' } });
        for (const handler of handlers) handler({ type: 'contractChanged', data: { kind: 'process' } });
        await vi.advanceTimersByTimeAsync(2_000);

        const authCalls = fetchMock.mock.calls.filter(call => String(call[0]).includes('/api/auth/me'));
        expect(authCalls).toHaveLength(1);

        // Non-contract org payloads never re-hydrate.
        for (const handler of handlers) handler({ type: 'entityChanged', data: {} });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('/api/auth/me'))).toHaveLength(1);
    });
});
