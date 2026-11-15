import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  getActivePermissionsFromAuth,
  redactEntityForAccess,
  registerDeclarationFieldAccess
} from './instance-field-access.js';

// The policy-bearing guinea pig: a framework-served type with a legacy
// field-access policy (sheet-design and cassette are §13-served — their
// access derives from the class collection and never exercises this map).
const organization = {
  _id: 'org-1',
  identity: { uid: 'o-1', name: 'Facade Works' },
  lineage: {},
  attachments: { primary: { fileId: 'f-1' } },
  data: {
    email: 'ops@facade.example',
    phone: '+1 555 0100',
    internalNotes: 'secret'
  }
};

const user = {
  _id: 'user-1',
  identity: { uid: 'u-1', name: 'Team Member' },
  lineage: { organizationId: 'org-1' },
  data: {
    email: 'member@example.com',
    role: 'role_viewer',
    permissions: { users: 'admin' },
    memberships: [{
      organizationId: 'org-1',
      role: 'role_viewer',
      roleIds: ['role_viewer'],
      status: 'active',
      permissions: { organizations: 'read' }
    }]
  }
};

// The organization assistant's serialized shape (the users README marker
// contract): the bare creation stamp is the whole marker.
const assistant = {
  _id: 'user-bot1',
  identity: { uid: 'user-bot1', name: 'Assistant' },
  lineage: { organizationId: 'org-1' },
  data: {
    email: 'user-bot1@bots.perigram.internal',
    bot: { createdAt: '2026-10-17T00:00:00.000Z' },
    memberships: [{ organizationId: 'org-1', role: 'role_viewer', roleIds: ['role_viewer'], status: 'active' }]
  }
};

describe('entity field access', () => {
  it('uses the same active-process, membership, then legacy grant precedence as the server', () => {
    const auth = {
      organizationId: 'org-1',
      permissions: { organizations: 'admin' },
      memberships: [
        { organizationId: 'org-1', permissions: { organizations: 'read' } },
        { organizationId: 'org-2', permissions: { organizations: 'write' } }
      ]
    };

    expect(getActivePermissionsFromAuth(auth, {
      lineage: { organizationId: 'org-1' }
    })).toEqual({ organizations: 'read' });

    expect(getActivePermissionsFromAuth({
      ...auth,
      effectivePermissions: { organizations: 'none' }
    }, {
      lineage: { organizationId: 'org-1' }
    })).toEqual({ organizations: 'none' });

    expect(getActivePermissionsFromAuth({
      permissions: null,
      data: { permissions: { organizations: 'write' } }
    })).toEqual({ organizations: 'write' });
  });

  it('does not reuse active-organization effective grants when redacting another tenant', () => {
    const auth = {
      organizationId: 'org-1',
      effectivePermissions: { organizations: 'admin' },
      memberships: [
        { organizationId: 'org-1', permissions: { organizations: 'admin' } },
        { organizationId: 'org-2', permissions: { organizations: 'read' } }
      ]
    };
    const otherOrganization = {
      _id: 'org-2',
      identity: { uid: 'o-2', name: 'Other Organization' },
      lineage: { organizationId: 'org-2' },
      data: {
        email: 'public-contact@example.com',
        phone: '+1 555 0101',
        address: 'Private address',
        internalNotes: 'Private notes'
      }
    };

    expect(getActivePermissionsFromAuth(auth, otherOrganization))
      .toEqual({ organizations: 'read' });
    const redacted = redactEntityForAccess(otherOrganization, 'organization', auth);
    expect(redacted).toMatchObject({
      _id: 'org-2',
      identity: { name: 'Other Organization' },
      data: {
        email: 'public-contact@example.com',
        phone: '+1 555 0101'
      }
    });
    expect(redacted.data.address).toBeUndefined();
    expect(redacted.data.internalNotes).toBeUndefined();
    expect(redactEntityForAccess(otherOrganization, 'organization', {
      ...auth,
      memberships: auth.memberships.filter(item => item.organizationId === 'org-1')
    })).toEqual({});
  });

  it('projects multi-organization user fields through the caller shared membership', () => {
    const targetUser = {
      _id: 'user-2',
      identity: { name: 'Multi-org member' },
      lineage: { organizationId: 'org-1' },
      data: {
        email: 'member@example.com',
        memberships: [
          { organizationId: 'org-1' },
          { organizationId: 'org-2' }
        ]
      }
    };
    const auth = {
      organizationId: 'org-2',
      effectivePermissions: { users: 'read' },
      memberships: [
        { organizationId: 'org-2', permissions: { users: 'read' } }
      ]
    };

    const redacted = redactEntityForAccess(targetUser, 'user', auth);
    expect(redacted.identity.name).toBe('Multi-org member');
    expect(redacted.data.email).toBe('member@example.com');
    expect(redacted.data.memberships.map(item => item.organizationId)).toEqual(['org-1', 'org-2']);
  });

  it('resolves top-level and origin organization ownership before field grants', () => {
    const auth = {
      organizationId: 'org-1',
      effectivePermissions: { organizations: 'admin' },
      memberships: [{ organizationId: 'org-2', permissions: { organizations: 'read' } }]
    };

    expect(getActivePermissionsFromAuth(auth, { organizationId: 'org-2' }))
      .toEqual({ organizations: 'read' });
    expect(getActivePermissionsFromAuth(auth, { origin: { organizationId: 'org-2' } }))
      .toEqual({ organizations: 'read' });
  });

  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { organizations: 'admin' },
      entity: { _id: 'x-1' },
      typeId: 'not-a-type',
      path: 'data.internalNotes'
    })).toBe(false);
  });

  it('filters card field descriptors by policy and active permissions', () => {
    const fields = [
      { path: 'data.email' },
      { path: 'data.phone' },
      { path: 'data.internalNotes' }
    ];

    expect(filterEntityFields({
      fields,
      permissions: { organizations: 'read' },
      entity: organization,
      typeId: 'organization'
    }).map(field => field.path)).toEqual([
      'data.email',
      'data.phone'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { organizations: 'admin' },
      entity: organization,
      typeId: 'organization'
    }).map(field => field.path)).toEqual([
      'data.email',
      'data.phone',
      'data.internalNotes'
    ]);
  });

  it('keeps public system catalogue read fields visible without grants', () => {
    const layerStandard = {
      _id: 'ls-1',
      identity: { name: 'OCCS Cut' },
      lineage: { scope: 'system', public: true },
      data: { code: 'cut.outer', category: 'cut', visibility: { public: true } }
    };

    expect(redactEntityForAccess(layerStandard, 'layerStandard', { permissions: {} })).toMatchObject({
      _id: 'ls-1',
      identity: { name: 'OCCS Cut' },
      data: { code: 'cut.outer', category: 'cut' }
    });
  });

  it('honors scoped permission grants', () => {
    const permissions = {
      organizations: { level: 'read', scope: { instanceId: 'org-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: organization,
      typeId: 'organization',
      path: 'data.email'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...organization, _id: 'org-2' },
      typeId: 'organization',
      path: 'data.email'
    })).toBe(false);
  });

  it('narrows display by the current state field policy (SPEC §7 fieldPolicy)', () => {
    registerDeclarationFieldAccess({
      panel: { feature: 'panels', read: ['fields.serial', 'fields.width'], write: [], admin: [] }
    });
    const auth = {
      organizationId: 'org-1',
      effectivePermissions: { panels: 'read' },
      stateFieldPolicies: {
        panel: {
          review: { visible: ['serial'], editable: null }
        }
      }
    };
    // The entity sits in the facet's state: only listed row ids display.
    expect(canDisplayEntityField({
      auth, typeId: 'panel', entity: { state: 'review' }, path: 'fields.serial'
    })).toBe(true);
    expect(canDisplayEntityField({
      auth, typeId: 'panel', entity: { state: 'review' }, path: 'fields.width'
    })).toBe(false);
    // Another state and a stateless entity stay unrestricted.
    expect(canDisplayEntityField({
      auth, typeId: 'panel', entity: { state: 'draft' }, path: 'fields.width'
    })).toBe(true);
    expect(canDisplayEntityField({
      auth, typeId: 'panel', entity: {}, path: 'fields.width'
    })).toBe(true);
  });

  it('redacts DTOs to allowed paths for the active membership', () => {
    const redacted = redactEntityForAccess(organization, 'organization', {
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { organizations: 'read' }
      }]
    });

    expect(redacted.identity.name).toBe('Facade Works');
    expect(redacted.data.email).toBe('ops@facade.example');
    expect(redacted.data.phone).toBe('+1 555 0100');
    expect(redacted.data.internalNotes).toBeUndefined();
  });

  it('uses active process permissions and field policies for redaction', () => {
    const redacted = redactEntityForAccess(organization, 'organization', {
      organizationId: 'org-1',
      effectivePermissions: { organizations: 'read' },
      permissions: { organizations: 'admin' },
      fieldPolicies: {
        organization: {
          read: ['identity.name'],
          write: [],
          private: ['data.internalNotes']
        }
      }
    });

    expect(redacted.identity.name).toBe('Facade Works');
    expect(redacted.data).toBeUndefined();
    expect(redacted.attachments).toBeUndefined();
  });

  it('keeps team list identity fields under user read access without exposing legacy permission JSON', () => {
    const redacted = redactEntityForAccess(user, 'user', {
      organizationId: 'org-1',
      effectivePermissions: { users: 'read' }
    });

    expect(redacted.identity.name).toBe('Team Member');
    expect(redacted.data.email).toBe('member@example.com');
    expect(redacted.data.memberships[0]).toEqual({
      organizationId: 'org-1',
      role: 'role_viewer',
      roleIds: ['role_viewer'],
      status: 'active'
    });
    expect(redacted.data.permissions).toBeUndefined();
    expect(redacted.data.memberships[0].permissions).toBeUndefined();
  });

  it('carries the assistant bot marker at user read level', () => {
    const redacted = redactEntityForAccess(assistant, 'user', {
      organizationId: 'org-1',
      effectivePermissions: { users: 'read' }
    });

    expect(redacted.data.bot).toEqual({ createdAt: '2026-10-17T00:00:00.000Z' });
    expect(redacted.data.permissions).toBeUndefined();
  });
  it('does not use suspended memberships to reveal tenant fields', () => {
    const auth = {
      organizationId: 'org-1',
      effectivePermissions: { organizations: 'admin' },
      memberships: [
        { organizationId: 'org-1', status: 'active', permissions: { organizations: 'admin' } },
        { organizationId: 'org-2', status: 'suspended', permissions: { organizations: 'admin' } }
      ]
    };
    const otherOrganization = {
      _id: 'org-2',
      identity: { name: 'Suspended tenant' },
      lineage: { organizationId: 'org-2' },
      data: { email: 'private@example.com' }
    };

    expect(getActivePermissionsFromAuth(auth, otherOrganization)).toEqual({});
    expect(redactEntityForAccess(otherOrganization, 'organization', auth)).toEqual({});
  });

  it('does not treat suspended shared memberships as user-field access', () => {
    const targetUser = {
      _id: 'user-suspended',
      identity: { name: 'Suspended colleague' },
      lineage: { organizationId: 'org-1' },
      data: {
        email: 'private@example.com',
        memberships: [{ organizationId: 'org-1', status: 'suspended' }]
      }
    };
    const auth = {
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', status: 'suspended', permissions: { users: 'admin' } }],
      effectivePermissions: { users: 'admin' }
    };

    expect(getActivePermissionsFromAuth(auth, targetUser, 'user')).toEqual({});
    expect(redactEntityForAccess(targetUser, 'user', auth)).toEqual({});
  });

  it('keeps legacy memberships without status active for compatibility', () => {
    const auth = {
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: { organizations: 'read' } }]
    };
    expect(getActivePermissionsFromAuth(auth, { organizationId: 'org-1' }))
      .toEqual({ organizations: 'read' });
  });

});
