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
        expect(store.status).toBe('connected');
        expect(store.connected).toBe(true);
    });

    it('retries a completed request after a transient failure', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValueOnce({ cursor: 9, events: [] });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        expect(store.status).toBe('polling');
        await vi.advanceTimersByTimeAsync(0);
        expect(store.status).toBe('error');
        expect(store.connected).toBe(false);
        await vi.advanceTimersByTimeAsync(5_000);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(store.status).toBe('connected');
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
        expect(store.status).toBe('connected');

        document.visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('settles error when a later poll fails and recovers on the retry timer', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ cursor: 4, events: [] })
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValueOnce({ cursor: 5, events: [] });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.status).toBe('connected');

        await vi.advanceTimersByTimeAsync(15_000);
        expect(store.status).toBe('error');
        expect(store.connected).toBe(false);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(store.status).toBe('connected');
    });

    it('stops on disconnect and reconnects through a fresh cursor', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ cursor: 7, events: [] });
        vi.stubGlobal('$fetch', fetchMock);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.status).toBe('connected');

        store.disconnect();
        expect(store.status).toBe('stopped');
        expect(store.connected).toBe(false);

        store.connect();
        expect(store.status).toBe('polling');
        await vi.advanceTimersByTimeAsync(0);
        expect(store.status).toBe('connected');
        expect(fetchMock).toHaveBeenLastCalledWith('/api/instance-events', { query: undefined });
    });
});

describe('rapid entity events over the connections stream', () => {
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

    async function connectWithUser() {
        const { useAuthStore } = await import('./auth.js');
        useAuthStore().user = { userId: 'u-1', organizationId: 'org-1' };
        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        return store;
    }

    it('emits realtime entityChanged payloads and advances the cursor past them', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ cursor: 4, events: [] })
            .mockResolvedValue({ cursor: 12, events: [] });
        vi.stubGlobal('$fetch', fetchMock);
        const received = [];
        window.addEventListener('perigram:instance-changed', event => received.push(event.detail));

        await connectWithUser();
        for (const handler of orgTopicHandlers.get('org:org-1')) {
            handler({ type: 'entityChanged', data: { eventId: 12, type: 'queue', id: 'queue-1', change: 'updated' } });
        }

        expect(received).toEqual([
            expect.objectContaining({ type: 'queue', id: 'queue-1', change: 'updated', source: 'server' })
        ]);
        await vi.advanceTimersByTimeAsync(15_000);
        // The cursor already passed the realtime event: the poll never
        // re-delivers it.
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/instance-events', { query: { after: 12 } });
        expect(received).toHaveLength(1);
    });

    it('skips self-published events but still advances the cursor', async () => {
        const { markSelfPublished } = await import('~/utils/instance-events.js');
        const fetchMock = vi.fn().mockResolvedValue({ cursor: 4, events: [] });
        vi.stubGlobal('$fetch', fetchMock);
        const received = [];
        window.addEventListener('perigram:instance-changed', event => received.push(event.detail));

        await connectWithUser();
        markSelfPublished(5);
        for (const handler of orgTopicHandlers.get('org:org-1')) {
            handler({ type: 'entityChanged', data: { eventId: 5, type: 'queue', id: 'queue-1', change: 'updated' } });
        }

        expect(received).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/instance-events', { query: { after: 5 } });
    });

    it('holds hidden-tab events for the poll catch-up instead of dropping them', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ cursor: 4, events: [] })
            .mockResolvedValueOnce({ cursor: 6, events: [{ eventId: 6, type: 'queue', id: 'queue-1', change: 'updated' }] });
        vi.stubGlobal('$fetch', fetchMock);
        const received = [];
        window.addEventListener('perigram:instance-changed', event => received.push(event.detail));

        await connectWithUser();
        document.visibilityState = 'hidden';
        for (const handler of orgTopicHandlers.get('org:org-1')) {
            handler({ type: 'entityChanged', data: { eventId: 6, type: 'queue', id: 'queue-1', change: 'updated' } });
        }
        expect(received).toHaveLength(0);

        document.visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(received).toEqual([
            expect.objectContaining({ type: 'queue', id: 'queue-1', source: 'server' })
        ]);
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

    it('refreshes the organization file-type view when the contract changes', async () => {
        const { useAuthStore } = await import('./auth.js');
        useAuthStore().user = { userId: 'u-2', organizationId: 'org-2' };

        const typeViewCalls = [];
        const fetchMock = vi.fn(async url => {
            const target = String(url);
            if (target.includes('/api/admin/cts/types')) {
                typeViewCalls.push(target);
                return { types: [], editors: [], surfaces: [], previews: [] };
            }
            if (target.includes('/api/auth/me')) return { userId: 'u-2', organizationId: 'org-2' };
            return { cursor: 1, events: [] };
        });
        vi.stubGlobal('$fetch', fetchMock);

        const { useFileTypeView } = await import('~/composables/useFileTypeView.js');
        useFileTypeView();
        await vi.advanceTimersByTimeAsync(0);
        expect(typeViewCalls).toHaveLength(1);

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);

        for (const handler of orgTopicHandlers.get('org:org-2') || []) {
            handler({ type: 'contractChanged', data: { kind: 'registry' } });
        }
        await vi.advanceTimersByTimeAsync(2_000);
        expect(typeViewCalls).toHaveLength(2);
    });
});
