import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from './permissions';

// h3 createError returns an object that we throw
// We want to test that it is called or that the function throws it
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

describe('Permissions Utility', () => {
  describe('requireAuth', () => {
    it('should return auth context if present', () => {
      const event = { context: { auth: { userId: '123' } } };
      expect(requireAuth(event)).toEqual({ userId: '123' });
    });

    it('should throw 401 if auth context is missing', () => {
      const event = { context: {} };
      expect(() => requireAuth(event)).toThrow(/Authentication required/);
    });
  });

  describe('requireLineagePermission', () => {
    it('requires the requested organization grant before a feature route proceeds', async () => {
      const { requireLineagePermission } = await import('./permissions');
      const auth = {
        userId: 'u1',
        organizationId: 'org-1',
        memberships: [{
          organizationId: 'org-1',
          permissions: { organizations: { level: 'admin' } }
        }]
      };
      const event = { context: { auth } };

      expect(requireLineagePermission(event, { organizationId: 'org-1' }, 'organizations', 'admin')).toBe(auth);
      expect(() => requireLineagePermission({
        context: {
          auth: {
            ...auth,
            memberships: [{
              organizationId: 'org-1',
              permissions: { organizations: { level: 'read' } }
            }]
          }
        }
      }, { organizationId: 'org-1' }, 'organizations', 'admin')).toThrow(/Permission denied/);
    });
  });

  describe('hasLineagePermission', () => {
    it('checks create action grants explicitly when requested', async () => {
      const { hasLineagePermission } = await import('./permissions');
      const auth = {
        memberships: [{ organizationId: 'org-1', permissions: {} }],
        effectivePermissions: {
          projects: [{ level: 'write', actions: { create: true } }]
        }
      };
      const project = { lineage: { organizationId: 'org-1' } };

      expect(hasLineagePermission(auth, project, 'projects', 'write', { action: 'create' })).toBe(true);
      expect(hasLineagePermission({
        memberships: [{ organizationId: 'org-1', permissions: {} }],
        effectivePermissions: {
          projects: [{ level: 'write', actions: { create: false } }]
        }
      }, project, 'projects', 'write', { action: 'create' })).toBe(false);
    });
  });
});
