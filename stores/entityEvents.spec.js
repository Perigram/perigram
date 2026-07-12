import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEntityEventsStore } from './entityEvents.js';

class FakeEventSource {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.closed = false;
        FakeEventSource.instances.push(this);
    }

    close() {
        this.closed = true;
    }

    emit(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

describe('entity events store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('EventSource', FakeEventSource);
        vi.stubGlobal('window', new EventTarget());
        FakeEventSource.instances = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('bridges server SSE entity events into the browser-local entity sync event', () => {
        const received = [];
        window.addEventListener('cutkit:entity-changed', event => received.push(event.detail));

        const store = useEntityEventsStore();
        store.connect();

        expect(FakeEventSource.instances[0].url).toBe('/api/entity-events');
        FakeEventSource.instances[0].emit({
            type: 'entityChanged',
            data: { type: 'queue', id: 'queue-1', change: 'updated', reason: 'status-transition' }
        });

        expect(received).toEqual([
            expect.objectContaining({
                type: 'queue',
                id: 'queue-1',
                change: 'updated',
                reason: 'status-transition',
                source: 'server'
            })
        ]);
    });
});
