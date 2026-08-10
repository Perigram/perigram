import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';

describe('organization switching', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.unstubAllGlobals());

  it('posts the selected organization and refreshes user, organization, and membership state', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/auth/switch-org') {
        expect(options).toEqual({ method: 'POST', body: { organizationId: 'org-2' } });
        return { ok: true };
      }
      if (url === '/api/auth/me') return { userId: 'user-1', organizationId: 'org-2', memberships: [{ organizationId: 'org-2' }] };
      if (url === '/api/organizations/org-2') return { _id: 'org-2', identity: { name: 'Second Org' } };
      if (url === '/api/auth/organizations') return [{ _id: 'org-2', identity: { name: 'Second Org' } }];
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('$fetch', fetchMock);
    const store = useAuthStore();

    await store.switchOrganization('org-2');

    expect(store.userData.organizationId).toBe('org-2');
    expect(store.organizationData.identity.name).toBe('Second Org');
    expect(store.userOrganizations).toHaveLength(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/switch-org',
      '/api/auth/me',
      '/api/organizations/org-2',
      '/api/auth/organizations'
    ]);
  });
});
