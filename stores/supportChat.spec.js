import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';
import { useSupportChatStore } from './supportChat.js';

class MockEventSource {
    static instances = [];

    constructor(url) {
        this.url = url;
        this.closed = false;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        MockEventSource.instances.push(this);
    }

    close() {
        this.closed = true;
    }
}

describe('support chat store connection lifecycle', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        MockEventSource.instances = [];
        globalThis.EventSource = MockEventSource;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.EventSource;
    });

    it('waits for auth before connecting and clears failed streams for reconnect', () => {
        const authStore = useAuthStore();
        const supportStore = useSupportChatStore();

        supportStore.connect();

        expect(MockEventSource.instances).toHaveLength(0);

        authStore.user = { id: 'user-a', userId: 'user-a' };
        authStore.isUserSet = true;
        supportStore.connect();

        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0].url).toBe('/api/support/conversations');

        MockEventSource.instances[0].onerror?.(new Error('unauthorized'));

        expect(MockEventSource.instances[0].closed).toBe(true);
        expect(supportStore.connected).toBe(false);

        supportStore.connect();

        expect(MockEventSource.instances).toHaveLength(2);
        expect(MockEventSource.instances[1].url).toBe('/api/support/conversations');
    });
});
