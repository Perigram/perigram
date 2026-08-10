import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth.js';

describe('auth route middleware behavior', () => {
    it('forwards SSR cookies through setUser and organization fetches', async () => {
        setActivePinia(createPinia());
        const fetchMock = vi.fn(async (url) => {
            if (url === '/api/auth/me') {
                return { userId: 'user-1', organizationId: 'org-1', name: 'Test' };
            }
            if (url === '/api/organizations/org-1') {
                return { _id: 'org-1', name: 'Org' };
            }
            if (url === '/api/auth/organizations') {
                return [];
            }
            return {};
        });
        globalThis.$fetch = fetchMock;

        const authStore = useAuthStore();
        const ssrOptions = { headers: { cookie: 'session=abc' } };

        await authStore.setUser(ssrOptions);
        expect(authStore.userIsSet).toBe(true);
        expect(authStore.userData.organizationId).toBe('org-1');
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', ssrOptions);
        expect(fetchMock).toHaveBeenCalledWith('/api/organizations/org-1', ssrOptions);
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/organizations', ssrOptions);

        delete globalThis.$fetch;
    });

    it('marks an unauthenticated user as not set', async () => {
        setActivePinia(createPinia());
        const fetchMock = vi.fn(async () => {
            const err = new Error('Unauthorized');
            err.status = 401;
            throw err;
        });
        globalThis.$fetch = fetchMock;

        const authStore = useAuthStore();
        await authStore.setUser({ headers: { cookie: 'session=expired' } });

        expect(authStore.userIsSet).toBe(false);
        expect(authStore.userData).toEqual({});

        delete globalThis.$fetch;
    });
});
