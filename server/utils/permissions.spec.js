import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requirePermission } from './permissions';

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

  describe('requirePermission', () => {
    it('uses active process effective permissions before stored user permissions', () => {
      const event = {
        context: {
          auth: {
            permissions: { organizations: 'none' },
            effectivePermissions: { organizations: 'admin' }
          }
        }
      };

      expect(() => requirePermission(event, 'organizations', 'write')).not.toThrow();
    });

    it('supports granular process grants through the shared evaluator', () => {
      const event = {
        context: {
          auth: {
            effectivePermissions: {
              projects: [{ level: 'write', actions: { create: true } }]
            }
          }
        }
      };

      expect(() => requirePermission(event, 'projects', 'read')).not.toThrow();
      expect(() => requirePermission(event, 'projects', 'admin')).toThrow(/Permission denied/);
    });
  });

  describe('hasLineagePermission', () => {
    it('checks create action grants explicitly when requested', async () => {
      const { hasLineagePermission } = await import('./permissions');
      const auth = {
        effectivePermissions: {
          projects: [{ level: 'write', actions: { create: true } }]
        }
      };
      const project = { lineage: { organization: { entityType: 'organization', entityId: 'org-1' } } };

      expect(hasLineagePermission(auth, project, 'projects', 'write', { action: 'create' })).toBe(true);
      expect(hasLineagePermission({
        effectivePermissions: {
          projects: [{ level: 'write', actions: { create: false } }]
        }
      }, project, 'projects', 'write', { action: 'create' })).toBe(false);
    });
  });
});
