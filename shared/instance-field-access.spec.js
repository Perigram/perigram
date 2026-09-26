import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  redactEntityForAccess
} from './instance-field-access.js';

const cassette = {
  _id: 'cassette-1',
  identity: { uid: 'c-1', name: 'Cassette One' },
  lineage: { organizationId: 'org-1' },
  summary: { revisionCount: 2, totalArea: 12 },
  data: {
    type: 'PARAMETRIC',
    definition: { graphTree: { nodes: [] } },
    internalCost: 1000
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
      permissions: { cassettes: 'read' }
    }]
  }
};

describe('entity field access', () => {
  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { cassettes: 'admin' },
      entity: cassette,
      typeId: 'cassette',
      path: 'billing.internalCost'
    })).toBe(false);
  });

  it('filters card field descriptors by policy and active permissions', () => {
    const fields = [
      { path: 'summary.revisionCount' },
      { path: 'data.type' },
      { path: 'data.definition' },
      { path: 'data.internalCost' }
    ];

    expect(filterEntityFields({
      fields,
      permissions: { cassettes: 'read' },
      entity: cassette,
      typeId: 'cassette'
    }).map(field => field.path)).toEqual([
      'summary.revisionCount',
      'data.type',
      'data.definition'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { cassettes: 'write' },
      entity: cassette,
      typeId: 'cassette'
    }).map(field => field.path)).toEqual([
      'summary.revisionCount',
      'data.type',
      'data.definition',
      'data.internalCost'
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
      cassettes: { level: 'read', scope: { instanceId: 'cassette-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: cassette,
      typeId: 'cassette',
      path: 'summary.revisionCount'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...cassette, _id: 'cassette-2' },
      typeId: 'cassette',
      path: 'summary.revisionCount'
    })).toBe(false);
  });

  it('redacts DTOs to allowed paths for the active membership', () => {
    const redacted = redactEntityForAccess(cassette, 'cassette', {
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { cassettes: 'read' }
      }]
    });

    expect(redacted.identity.name).toBe('Cassette One');
    expect(redacted.summary.revisionCount).toBe(2);
    expect(redacted.data.type).toBe('PARAMETRIC');
    expect(redacted.data.definition).toEqual({ graphTree: { nodes: [] } });
    expect(redacted.data.internalCost).toBeUndefined();
  });

  it('uses active process permissions and field policies for redaction', () => {
    const redacted = redactEntityForAccess(cassette, 'cassette', {
      organizationId: 'org-1',
      effectivePermissions: { cassettes: 'read' },
      permissions: { cassettes: 'admin' },
      fieldPolicies: {
        cassette: {
          read: ['identity.name'],
          write: [],
          private: ['data.internalCost']
        }
      }
    });

    expect(redacted.identity.name).toBe('Cassette One');
    expect(redacted.summary).toBeUndefined();
    expect(redacted.data).toBeUndefined();
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
});
