import { describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  createError: vi.fn(details => Object.assign(new Error(details.message), details))
}));

import { resolveOrganizationId } from './organization-scope.js';

describe('organization scope principal', () => {
  it('requires an authenticated principal before resolving tenant context', () => {
    expect(() => resolveOrganizationId({ organizationId: 'org-1' }))
      .toThrow(/Authentication required/);
    expect(() => resolveOrganizationId({ memberships: [{ organizationId: 'org-1' }] }))
      .toThrow(/Authentication required/);
  });

  it('resolves the active organization for a user or trusted system principal', () => {
    expect(resolveOrganizationId({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1' }]
    })).toBe('org-1');
    expect(resolveOrganizationId({ system: true, organizationId: 'org-2' })).toBe('org-2');
  });

  it('requires organization context after principal validation', () => {
    expect(() => resolveOrganizationId({ userId: 'user-1' }))
      .toThrow(/Organization membership is required/);
  });
});
