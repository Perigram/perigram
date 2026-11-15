import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from './permissions';

// h3 createError returns an object that we throw
// We want to test that it is called or that the function throws it
vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  }),
  getHeader: vi.fn((event, name) => event.node?.req?.headers?.[name.toLowerCase()])
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


  describe('requirePlatformOperator', () => {
    it('accepts the configured operator token', async () => {
      const { requirePlatformOperator } = await import('./permissions');
      const previous = process.env.PLATFORM_OPERATOR_TOKEN;
      process.env.PLATFORM_OPERATOR_TOKEN = 'operator-secret';
      try {
        expect(() => requirePlatformOperator({
          node: { req: { headers: { 'x-operator-token': 'operator-secret' } } }
        })).not.toThrow();
      } finally {
        if (previous === undefined) delete process.env.PLATFORM_OPERATOR_TOKEN;
        else process.env.PLATFORM_OPERATOR_TOKEN = previous;
      }
    });

    it('rejects missing configuration and invalid credentials', async () => {
      const { requirePlatformOperator } = await import('./permissions');
      const previous = process.env.PLATFORM_OPERATOR_TOKEN;
      const previousNuxt = process.env.NUXT_PLATFORM_OPERATOR_TOKEN;
      delete process.env.PLATFORM_OPERATOR_TOKEN;
      delete process.env.NUXT_PLATFORM_OPERATOR_TOKEN;
      try {
        expect(() => requirePlatformOperator({ node: { req: { headers: {} } } }))
          .toThrow(/Plugin publishing is not configured/);
        process.env.PLATFORM_OPERATOR_TOKEN = 'operator-secret';
        expect(() => requirePlatformOperator({ node: { req: { headers: { 'x-operator-token': 'wrong' } } } }))
          .toThrow(/Invalid operator token/);
      } finally {
        if (previous === undefined) delete process.env.PLATFORM_OPERATOR_TOKEN;
        else process.env.PLATFORM_OPERATOR_TOKEN = previous;
        if (previousNuxt === undefined) delete process.env.NUXT_PLATFORM_OPERATOR_TOKEN;
        else process.env.NUXT_PLATFORM_OPERATOR_TOKEN = previousNuxt;
      }
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
        userId: 'user-1',
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
