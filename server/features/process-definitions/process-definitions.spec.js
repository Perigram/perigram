import { describe, expect, it } from 'vitest';
import { hasProcessDefinitionMembershipAccess } from './service.js';

describe('process definitions access fallback', () => {
  it('allows organization admin membership to manage process definitions when process grants are missing', () => {
    expect(hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_admin',
        permissions: {},
        status: 'active'
      }]
    }, 'org-1', 'admin')).toBe(true);
  });

  it('does not allow ordinary members or other organizations through the fallback', () => {
    const auth = {
      userId: 'member',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_viewer',
        permissions: {},
        status: 'active'
      }]
    };

    expect(hasProcessDefinitionMembershipAccess(auth, 'org-1', 'admin')).toBe(false);
    expect(hasProcessDefinitionMembershipAccess(auth, 'org-2', 'admin')).toBe(false);
  });
});
