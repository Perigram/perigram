import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';
import { useSupportChatStore } from './supportChat.js';

describe('support chat store connection lifecycle', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        globalThis.$fetch = vi.fn(async () => ({
            data: [{ conversationKey: 'direct:user-a:user-b', conversationKind: 'direct', unreadCount: 1 }],
            totalUnread: 1
        }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete globalThis.$fetch;
    });

    it('waits for auth before loading conversations and retries failed refreshes', async () => {
        const authStore = useAuthStore();
        const supportStore = useSupportChatStore();

        supportStore.connect();

        expect(globalThis.$fetch).not.toHaveBeenCalled();

        authStore.user = { id: 'user-a', userId: 'user-a' };
        authStore.isUserSet = true;
        supportStore.connect();

        await vi.runOnlyPendingTimersAsync();

        expect(globalThis.$fetch).toHaveBeenCalledWith('/api/support/conversations');
        expect(supportStore.conversations).toHaveLength(1);
        expect(supportStore.totalUnread).toBe(1);
        expect(supportStore.connected).toBe(true);

        globalThis.$fetch.mockRejectedValueOnce(new Error('network'));
        await supportStore.refresh();

        expect(supportStore.connected).toBe(false);

        globalThis.$fetch.mockResolvedValueOnce({ data: [], totalUnread: 0 });
        await supportStore.refresh();

        expect(supportStore.connected).toBe(true);
        expect(supportStore.conversations).toEqual([]);
        expect(supportStore.totalUnread).toBe(0);
    });
});
