import { describe, expect, it, vi } from 'vitest';
import { assertCommandAccess, assertTransitionAccess, createLineageFilter, hasEntityAccess } from './service.js';
import { hasLineagePermission } from '../../utils/permissions.js';

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

  it('prefers active process effective permissions over membership fallback', () => {
    expect(hasEntityAccess({
      entity,
      feature: 'queues',
      level: 'admin',
      auth: {
        userId: 'u-process',
        effectivePermissions: { queues: 'admin' },
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'read' } }]
      }
    })).toBe(true);

    expect(hasEntityAccess({
      entity,
      feature: 'queues',
      level: 'write',
      auth: {
        userId: 'u-process',
        effectivePermissions: { queues: 'none' },
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'admin' } }]
      }
    })).toBe(false);
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

  it('scopes collection filters and entity access to the active organization', () => {
    const multiOrgAuth = {
      organizationId: 'org-1',
      effectivePermissions: { queues: 'admin' },
      memberships: [
        { organizationId: 'org-1', permissions: { queues: 'read' } },
        { organizationId: 'org-2', permissions: { queues: 'admin' } }
      ]
    };

    expect(createLineageFilter(multiOrgAuth)).toEqual({ 'lineage.organizationId': 'org-1' });
    expect(hasEntityAccess({
      entity: { lineage: { organizationId: 'org-2' } },
      feature: 'queues',
      level: 'read',
      auth: multiOrgAuth
    })).toBe(false);
  });

  it('allows public system catalogue entities to be read without grants only at read level', () => {
    const material = {
      lineage: { scope: 'system', public: true },
      data: { visibility: { public: true } }
    };
    const ungrantedAuth = { userId: 'u-public', memberships: [] };

    expect(hasEntityAccess({
      entity: material,
      typeId: 'material',
      feature: 'materials',
      level: 'read',
      auth: null
    })).toBe(true);
    expect(hasEntityAccess({
      entity: material,
      typeId: 'material',
      feature: 'materials',
      level: 'read',
      auth: ungrantedAuth
    })).toBe(true);
    expect(hasEntityAccess({
      entity: material,
      typeId: 'material',
      feature: 'materials',
      level: 'write',
      auth: ungrantedAuth
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

  it('keeps full entity facts available through lineage permission checks', () => {
    const project = {
      _id: 'project-a',
      lineage: { organizationId: 'org-1' },
      status: { state: { primary: 'ACTIVE' } },
      data: { address: 'Factory Row' }
    };
    const scopedAuth = {
      userId: 'u3',
      memberships: [{
        organizationId: 'org-1',
        permissions: {
          projects: {
            level: 'read',
            rule: {
              all: [
                { fact: 'status.primary', equals: 'ACTIVE' },
                { fact: 'entity.data.address', equals: 'Factory Row' }
              ]
            }
          }
        }
      }]
    };

    expect(hasLineagePermission(scopedAuth, project, 'projects', 'read')).toBe(true);
    expect(hasLineagePermission(scopedAuth, project.lineage, 'projects', 'read')).toBe(false);
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
