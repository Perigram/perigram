import { describe, expect, it, vi } from 'vitest';
import { assertCommandAccess, assertTransitionAccess, hasEntityAccess } from './service.js';

vi.mock('h3', () => ({
  createError: vi.fn((err) => {
    const error = new Error(err.message);
    error.statusCode = err.statusCode;
    return error;
  })
}));

const entity = { lineage: { organizationId: 'org-1' } };
const auth = {
  userId: 'u1',
  memberships: [{ organizationId: 'org-1', permissions: { queues: 'write', artifacts: 'read' } }]
};

describe('access engine', () => {
  it('allows entity access by lineage membership permission level', () => {
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'read', auth })).toBe(true);
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'write', auth })).toBe(true);
  });

  it('denies missing org membership or insufficient permission level', () => {
    expect(hasEntityAccess({ entity, feature: 'queues', level: 'admin', auth })).toBe(false);
    expect(hasEntityAccess({
      entity,
      feature: 'queues',
      level: 'read',
      auth: { memberships: [{ organizationId: 'org-2', permissions: { queues: 'admin' } }] }
    })).toBe(false);
  });

  it('checks command requirements before handler execution', () => {
    const command = {
      access: {
        permissions: [
          { feature: 'queues', level: 'write' },
          { feature: 'artifacts', level: 'write' }
        ]
      }
    };

    expect(() => assertCommandAccess({ command, entities: { queue: entity }, auth })).toThrow(/artifacts:write/);
  });

  it('supports project-scoped permission grants', () => {
    const scopedEntity = { lineage: { organizationId: 'org-1', projectId: 'project-a' } };
    const scopedAuth = {
      userId: 'u2',
      memberships: [{
        organizationId: 'org-1',
        permissions: {
          queues: [{ level: 'write', scope: { projectId: 'project-a' } }]
        }
      }]
    };

    expect(hasEntityAccess({ entity: scopedEntity, feature: 'queues', level: 'write', auth: scopedAuth })).toBe(true);
    expect(hasEntityAccess({
      entity: { lineage: { organizationId: 'org-1', projectId: 'project-b' } },
      feature: 'queues',
      level: 'write',
      auth: scopedAuth
    })).toBe(false);
  });

  it('supports transition-scoped grants', () => {
    const transition = { from: 'PRODUCED', to: 'MILLED', access: { permissions: [{ feature: 'projects', level: 'write' }] } };
    const scopedAuth = {
      userId: 'operator-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: {
          projects: [{ level: 'write', scope: { projectId: 'project-a' }, transitions: ['PRODUCED->MILLED'] }]
        }
      }]
    };

    expect(() => assertTransitionAccess({
      transition,
      entity: { lineage: { organizationId: 'org-1', projectId: 'project-a' } },
      auth: scopedAuth
    })).not.toThrow();
    expect(() => assertTransitionAccess({
      transition: { ...transition, to: 'INSTALLED' },
      entity: { lineage: { organizationId: 'org-1', projectId: 'project-a' } },
      auth: scopedAuth
    })).toThrow(/projects:write/);
  });
});
