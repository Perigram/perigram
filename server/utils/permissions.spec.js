import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requirePermission, checkEntityAccess } from './permissions';

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

  describe('checkEntityAccess', () => {
    const user = { organizationId: 'org1' };

    it('should allow user to access their own organization entity', () => {
      expect(checkEntityAccess(user, {}, 'org1')).toBe(true);
    });

    it('should deny user from accessing other organization entity', () => {
      expect(checkEntityAccess(user, {}, 'org2')).toBe(false);
    });

    it('should return false if entityOrgId is missing', () => {
      expect(checkEntityAccess(user, {}, null)).toBe(false);
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
});
