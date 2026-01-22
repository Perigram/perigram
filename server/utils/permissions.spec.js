import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requirePermission, checkEntityAccess, requireRole } from './permissions';

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
    const user = { role: 'ContractorAdmin', organizationId: 'org1' };
    const superAdmin = { role: 'SuperAdmin' };

    it('should allow SuperAdmin to access anything', () => {
      expect(checkEntityAccess(superAdmin, {}, 'anyOrg')).toBe(true);
    });

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

  describe('requireRole', () => {
    it('should not throw if user has allowed role', () => {
      const event = { context: { auth: { role: 'SuperAdmin' } } };
      expect(() => requireRole(event, 'SuperAdmin', 'ManufacturerAdmin')).not.toThrow();
    });

    it('should throw 403 if user does not have allowed role', () => {
      const event = { context: { auth: { role: 'IndividualUser' } } };
      expect(() => requireRole(event, 'SuperAdmin')).toThrow(/Insufficient privileges/);
    });
  });
});