import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  redactEntityForAccess
} from './instance-field-access.js';

// The policy-bearing guinea pig: a type with a legacy field-access
// policy (cassette is §13-served — its access derives from the class
// collection, so it no longer exercises this map).
const sheetDesign = {
  _id: 'design-1',
  identity: { uid: 'd-1', name: 'Design One' },
  lineage: { organizationId: 'org-1' },
  summary: { revisionCount: 2, totalArea: 12 },
  specs: { sheetIndex: 3 },
  data: {
    geometry: { outline: [[0, 0], [10, 0], [10, 10]] },
    materialPool: ['mat-1'],
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
      permissions: { sheet_designs: 'read' }
    }]
  }
};

describe('entity field access', () => {
  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { sheet_designs: 'admin' },
      entity: { _id: 'x-1' },
      typeId: 'not-a-type',
      path: 'billing.internalCost'
    })).toBe(false);
  });

  it('filters card field descriptors by policy and active permissions', () => {
    const fields = [
      { path: 'summary.revisionCount' },
      { path: 'data.materialPool' },
      { path: 'data.geometry.outline' },
      { path: 'data.internalCost' }
    ];

    expect(filterEntityFields({
      fields,
      permissions: { sheet_designs: 'read' },
      entity: sheetDesign,
      typeId: 'sheet-design'
    }).map(field => field.path)).toEqual([
      'summary.revisionCount',
      'data.materialPool',
      'data.geometry.outline'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { sheet_designs: 'write' },
      entity: sheetDesign,
      typeId: 'sheet-design'
    }).map(field => field.path)).toEqual([
      'summary.revisionCount',
      'data.materialPool',
      'data.geometry.outline',
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
      sheet_designs: { level: 'read', scope: { instanceId: 'design-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: sheetDesign,
      typeId: 'sheet-design',
      path: 'summary.revisionCount'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...sheetDesign, _id: 'design-2' },
      typeId: 'sheet-design',
      path: 'summary.revisionCount'
    })).toBe(false);
  });

  it('redacts DTOs to allowed paths for the active membership', () => {
    const redacted = redactEntityForAccess(sheetDesign, 'sheet-design', {
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { sheet_designs: 'read' }
      }]
    });

    expect(redacted.identity.name).toBe('Design One');
    expect(redacted.summary.revisionCount).toBe(2);
    expect(redacted.data.materialPool).toEqual(['mat-1']);
    expect(redacted.data.geometry.outline).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(redacted.data.internalCost).toBeUndefined();
  });

  it('uses active process permissions and field policies for redaction', () => {
    const redacted = redactEntityForAccess(sheetDesign, 'sheet-design', {
      organizationId: 'org-1',
      effectivePermissions: { sheet_designs: 'read' },
      permissions: { sheet_designs: 'admin' },
      fieldPolicies: {
        'sheet-design': {
          read: ['identity.name'],
          write: [],
          private: ['data.internalCost']
        }
      }
    });

    expect(redacted.identity.name).toBe('Design One');
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
