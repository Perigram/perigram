import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
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

  it('uses membership grants before legacy top-level permissions when no process grants exist', () => {
    const visible = redactEntityForAccess(organization, 'organization', {
      organizationId: 'org-1',
      permissions: { organizations: 'none' },
      memberships: [{
        organizationId: 'org-1',
        permissions: { organizations: 'read' }
      }]
    });
    expect(visible.data.email).toBe('ops@facade.example');
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
});
