import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityEventsStore } from './entityEvents.js';

describe('entity events store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.stubGlobal('window', new EventTarget());
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
        window.addEventListener('cutkit:entity-changed', event => received.push(event.detail));

        const store = useEntityEventsStore();
        store.connect();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(750);

        expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/entity-events', { query: undefined });
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/entity-events', { query: { after: 4 } });
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
        await vi.advanceTimersByTimeAsync(1500);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(store.connected).toBe(true);
    });
});
