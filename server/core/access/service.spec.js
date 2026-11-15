import { describe, expect, it, vi } from 'vitest';
import { assertCommandAccess, assertEntityAccess, assertTransitionAccess, createLineageFilter, hasInstanceAccess } from './service.js';
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
  memberships: [{ organizationId: 'org-1', permissions: { queues: 'write', files: 'read' } }]
};

describe('access engine', () => {
  it('allows entity access by lineage membership permission level', () => {
    expect(hasInstanceAccess({ entity, feature: 'queues', level: 'read', auth })).toBe(true);
    expect(hasInstanceAccess({ entity, feature: 'queues', level: 'write', auth })).toBe(true);
  });

  it('prefers active process effective permissions over membership fallback', () => {
    expect(hasInstanceAccess({
      entity,
      feature: 'queues',
      level: 'admin',
      auth: {
        userId: 'u-process',
        effectivePermissions: { queues: 'admin' },
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'read' } }]
      }
    })).toBe(true);

    expect(hasInstanceAccess({
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

  it('uses the same membership-before-legacy permission fallback as field redaction', () => {
    expect(hasInstanceAccess({
      entity,
      feature: 'queues',
      level: 'write',
      auth: {
        userId: 'u-membership',
        permissions: { queues: 'none' },
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'write' } }]
      }
    })).toBe(true);
  });

  it('denies origin-scoped entities outside the active organization', () => {
    expect(hasInstanceAccess({
      entity: { origin: { organizationId: 'org-2' } },
      feature: 'queues',
      level: 'write',
      auth: {
        userId: 'u-origin',
        organizationId: 'org-1',
        effectivePermissions: { queues: 'admin' },
        memberships: [{ organizationId: 'org-1', permissions: { queues: 'admin' } }]
      }
    })).toBe(false);
  });

  it('does not let global effective grants substitute for organization membership', () => {
    expect(hasInstanceAccess({
      entity,
      feature: 'queues',
      level: 'read',
      auth: { effectivePermissions: { queues: 'admin' }, memberships: [] }
    })).toBe(false);
  });

  it('denies missing org membership or insufficient permission level', () => {
    expect(hasInstanceAccess({ entity, feature: 'queues', level: 'admin', auth })).toBe(false);
    expect(hasInstanceAccess({
      entity,
      feature: 'queues',
      level: 'read',
      auth: { memberships: [{ organizationId: 'org-2', permissions: { queues: 'admin' } }] }
    })).toBe(false);
  });

  it('scopes collection filters and entity access to the active organization', () => {
    const multiOrgAuth = {
      userId: 'multi-org-user',
      organizationId: 'org-1',
      effectivePermissions: { queues: 'admin' },
      memberships: [
        { organizationId: 'org-1', permissions: { queues: 'read' } },
        { organizationId: 'org-2', permissions: { queues: 'admin' } }
      ]
    };

    expect(createLineageFilter(multiOrgAuth)).toEqual({ 'lineage.organizationId': 'org-1' });
    expect(hasInstanceAccess({
      entity: { lineage: { organizationId: 'org-2' } },
      feature: 'queues',
      level: 'read',
      auth: multiOrgAuth
    })).toBe(false);
  });

  it('allows public system catalogue entities to be read without grants only at read level', () => {
    const layerStandard = {
      lineage: { scope: 'system', public: true },
      data: { visibility: { public: true } }
    };
    const ungrantedAuth = { userId: 'u-public', memberships: [] };

    expect(hasInstanceAccess({
      entity: layerStandard,
      typeId: 'layerStandard',
      feature: 'layer_standards',
      level: 'read',
      auth: null
    })).toBe(true);
    expect(hasInstanceAccess({
      entity: layerStandard,
      typeId: 'layerStandard',
      feature: 'layer_standards',
      level: 'read',
      auth: ungrantedAuth
    })).toBe(true);
    expect(hasInstanceAccess({
      entity: layerStandard,
      typeId: 'layerStandard',
      feature: 'layer_standards',
      level: 'write',
      auth: ungrantedAuth
    })).toBe(false);
  });

  it('requires a real user or system principal even when a command declares no permission clauses', () => {
    expect(() => assertCommandAccess({
      command: { access: {} },
      entities: {},
      auth: {}
    })).toThrow(/Authentication required/);

    expect(() => assertCommandAccess({
      command: { access: { system: true } },
      entities: {},
      auth: { system: true }
    })).not.toThrow();
  });

  it('rejects permission-shaped contexts that have no authenticated principal', () => {
    const forgedContext = {
      organizationId: 'org-1',
      effectivePermissions: { queues: 'admin' },
      memberships: [{ organizationId: 'org-1', permissions: { queues: 'admin' } }]
    };
    expect(hasInstanceAccess({
      entity,
      feature: 'queues',
      level: 'write',
      auth: forgedContext
    })).toBe(false);
    expect(() => assertEntityAccess({
      entity,
      feature: 'queues',
      level: 'write',
      auth: forgedContext
    })).toThrow(/Authentication required/);
    expect(() => assertTransitionAccess({
      transition: { from: 'DRAFT', to: 'READY' },
      entity,
      auth: forgedContext
    })).toThrow(/Authentication required/);
  });

  it('checks command requirements before handler execution', () => {
    const command = {
      access: {
        permissions: [
          { feature: 'queues', level: 'write' },
          { feature: 'files', level: 'write' }
        ]
      }
    };

    expect(() => assertCommandAccess({ command, entities: { queue: entity }, auth })).toThrow(/files:write/);
  });

  it('scopes every command entity reference even without feature permission clauses', () => {
    const command = { access: {} };
    expect(() => assertCommandAccess({
      command,
      entities: { source: { _id: 'foreign', organizationId: 'org-2' } },
      auth: { ...auth, organizationId: 'org-1' }
    })).toThrow(/organization scope/);
    expect(() => assertCommandAccess({
      command,
      entities: { source: { _id: 'unscoped' } },
      auth
    })).not.toThrow();
  });

  it('matches organization-scoped grants against canonical stored and origin tenancy slots', () => {
    const scopedAuth = {
      userId: 'u-org-scope',
      organizationId: 'org-1',
      effectivePermissions: {
        items: [{ level: 'write', scope: { organizationId: 'org-1' } }]
      },
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    };

    for (const scopedEntity of [
      { _id: 'item-top-level', organizationId: 'org-1', lineage: {} },
      { _id: 'item-origin', origin: { organizationId: 'org-1' }, lineage: {} }
    ]) {
      expect(hasInstanceAccess({
        entity: scopedEntity,
        feature: 'items',
        level: 'write',
        auth: scopedAuth
      })).toBe(true);
    }

    expect(hasInstanceAccess({
      entity: { _id: 'item-foreign', organizationId: 'org-2', lineage: {} },
      feature: 'items',
      level: 'write',
      auth: scopedAuth
    })).toBe(false);
  });

  it('supports instance-scoped permission grants', () => {
    const scopedEntity = { _id: 'cassette-a', lineage: { organizationId: 'org-1' } };
    const scopedAuth = {
      userId: 'u2',
      memberships: [{
        organizationId: 'org-1',
        permissions: {
          cassettes: [{ level: 'write', scope: { instanceId: 'cassette-a' } }]
        }
      }]
    };

    expect(hasInstanceAccess({ entity: scopedEntity, feature: 'cassettes', level: 'write', auth: scopedAuth })).toBe(true);
    expect(hasInstanceAccess({
      entity: { _id: 'cassette-b', lineage: { organizationId: 'org-1' } },
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

  it('keeps process-role transitions inside the active organization', () => {
    const transition = { from: 'DRAFT', to: 'READY', processRoleIds: ['role_operator'] };
    const scopedAuth = {
      userId: 'operator-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }],
      roleAssignments: { roleIds: ['role_operator'] }
    };

    expect(() => assertTransitionAccess({
      transition,
      entity: { lineage: { organizationId: 'org-1' } },
      auth: scopedAuth
    })).not.toThrow();
    expect(() => assertTransitionAccess({
      transition,
      entity: { lineage: { organizationId: 'org-2' } },
      auth: scopedAuth
    })).toThrow(/organization scope/);
    expect(() => assertTransitionAccess({
      transition,
      entity: { lineage: { organizationId: 'org-1' } },
      auth: { ...scopedAuth, organizationId: null, memberships: [] }
    })).toThrow(/organization scope/);

    // Role IDs are organization-scoped. A role assignment without an
    // organization-bearing target must never authorize a transition.
    expect(() => assertTransitionAccess({
      transition,
      entity: { _id: 'unscoped-entity' },
      auth: scopedAuth
    })).toThrow(/organization scope required/);
  });

  it('keeps organization-less system records read-only to ordinary members', () => {
    const systemRecord = {
      _id: 'catalog-item',
      organizationId: null,
      lineage: { scope: 'system' }
    };
    const organizationAdmin = {
      userId: 'org-admin',
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { items: 'admin' }
      }]
    };

    expect(hasInstanceAccess({
      entity: systemRecord,
      feature: 'items',
      level: 'read',
      auth: organizationAdmin
    })).toBe(true);
    expect(hasInstanceAccess({
      entity: systemRecord,
      feature: 'items',
      level: 'write',
      auth: organizationAdmin
    })).toBe(false);
    expect(hasInstanceAccess({
      entity: systemRecord,
      feature: 'items',
      level: 'admin',
      auth: organizationAdmin
    })).toBe(false);

    expect(() => assertTransitionAccess({
      transition: { from: 'DRAFT', to: 'READY' },
      entity: systemRecord,
      auth: organizationAdmin
    })).toThrow(/organization scope required/);

    expect(() => assertTransitionAccess({
      transition: { from: 'DRAFT', to: 'READY', access: { system: true } },
      entity: systemRecord,
      auth: organizationAdmin
    })).toThrow(/organization scope required/);

    expect(() => assertTransitionAccess({
      transition: { from: 'DRAFT', to: 'READY' },
      entity: systemRecord,
      auth: { userId: 'SYSTEM', system: true }
    })).toThrow(/organization scope required/);

    expect(() => assertTransitionAccess({
      transition: { from: 'DRAFT', to: 'READY', access: { system: true } },
      entity: systemRecord,
      auth: { userId: 'SYSTEM', system: true }
    })).not.toThrow();
  });

  it('requires both the assigned process role and every declared feature permission', () => {
    const transition = {
      from: 'DRAFT',
      to: 'READY',
      processRoleIds: ['role_operator'],
      access: { permissions: [{ feature: 'queues', level: 'write', action: 'update' }] }
    };
    const entity = { _id: 'queue-1', lineage: { organizationId: 'org-1' } };
    const roleOnly = {
      userId: 'operator-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {} }],
      roleAssignments: { roleIds: ['role_operator'] }
    };

    expect(() => assertTransitionAccess({ transition, entity, auth: roleOnly })).toThrow(/queues:write/);
    expect(() => assertTransitionAccess({
      transition,
      entity,
      auth: {
        ...roleOnly,
        effectivePermissions: { queues: [{ level: 'write', actions: { update: true } }] }
      }
    })).not.toThrow();
    expect(() => assertTransitionAccess({
      transition,
      entity,
      auth: { ...roleOnly, roleAssignments: { roleIds: ['role_other'] }, effectivePermissions: { queues: 'admin' } }
    })).toThrow(/process transition role/);
  });

  it('honors action-specific command and transition requirements', () => {
    const scopedEntity = { _id: 'item-1', type: 'panel', organizationId: 'org-1', lineage: { organizationId: 'org-1' } };
    const updateOnlyAuth = {
      userId: 'u1',
      organizationId: 'org-1',
      effectivePermissions: {
        items: [{ level: 'write', actions: { update: true } }]
      }
    };

    expect(() => assertCommandAccess({
      command: { access: { permissions: [{ feature: 'items', level: 'write', action: 'delete' }] } },
      entities: { target: scopedEntity },
      auth: updateOnlyAuth
    })).toThrow(/Permission denied/);

    expect(() => assertTransitionAccess({
      transition: {
        from: 'DRAFT',
        to: 'READY',
        access: { permissions: [{ feature: 'items', level: 'write', action: 'delete' }] }
      },
      entity: scopedEntity,
      auth: updateOnlyAuth
    })).toThrow(/Permission denied/);
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
