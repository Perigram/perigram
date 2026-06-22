import { describe, expect, it, vi } from 'vitest';
import { hasProcessDefinitionMembershipAccess } from './service.js';
import * as usersRepository from '~/server/features/users/repository.js';

vi.mock('~/server/features/users/repository.js', () => ({
  find: vi.fn()
}));

describe('process definitions access fallback', () => {
  it('allows organization admin membership to manage process definitions when process grants are missing', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_admin',
        permissions: {},
        status: 'active'
      }]
    }, 'org-1', 'admin')).toBe(true);
  });

  it('allows the sole active organization member to recover process management', async () => {
    usersRepository.find.mockResolvedValueOnce([{
      _id: 'solo-user',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'IndividualUser', status: 'active' }]
      }
    }]);

    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'solo-user',
      memberships: [{ organizationId: 'org-1', role: 'IndividualUser', status: 'active' }]
    }, 'org-1', 'admin')).toBe(true);
  });

  it('does not allow ordinary members or other organizations through the fallback', async () => {
    usersRepository.find.mockResolvedValue([{
      _id: 'member',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'role_viewer', status: 'active' }]
      }
    }, {
      _id: 'other',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'role_viewer', status: 'active' }]
      }
    }]);
    const auth = {
      userId: 'member',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_viewer',
        permissions: {},
        status: 'active'
      }]
    };

    expect(await hasProcessDefinitionMembershipAccess(auth, 'org-1', 'admin')).toBe(false);
    expect(await hasProcessDefinitionMembershipAccess(auth, 'org-2', 'admin')).toBe(false);
  });
});
