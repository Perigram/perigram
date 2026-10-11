import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  redactEntityForAccess
} from './instance-field-access.js';

// The policy-bearing guinea pig: a framework-served type with a legacy
// field-access policy (sheet-design and cassette are §13-served — their
// access derives from the class collection and never exercises this map).
const artifact = {
  _id: 'art-1',
  identity: { uid: 'a-1', name: 'Sheet DXF' },
  lineage: { organizationId: 'org-1' },
  attachments: { primary: { fileId: 'f-1' } },
  data: {
    filename: 'sheet.dxf',
    layout: { grid: true },
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
      permissions: { artifacts: 'read' }
    }]
  }
};

describe('entity field access', () => {
  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { artifacts: 'admin' },
      entity: { _id: 'x-1' },
      typeId: 'not-a-type',
      path: 'data.internalNotes'
    })).toBe(false);
  });

  it('filters card field descriptors by policy and active permissions', () => {
    const fields = [
      { path: 'data.filename' },
      { path: 'data.layout.grid' },
      { path: 'attachments.primary.fileId' },
      { path: 'data.internalNotes' }
    ];

    expect(filterEntityFields({
      fields,
      permissions: { artifacts: 'read' },
      entity: artifact,
      typeId: 'artifact'
    }).map(field => field.path)).toEqual([
      'data.filename',
      'data.layout.grid',
      'attachments.primary.fileId'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { artifacts: 'write' },
      entity: artifact,
      typeId: 'artifact'
    }).map(field => field.path)).toEqual([
      'data.filename',
      'data.layout.grid',
      'attachments.primary.fileId',
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
      artifacts: { level: 'read', scope: { instanceId: 'art-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: artifact,
      typeId: 'artifact',
      path: 'data.filename'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...artifact, _id: 'art-2' },
      typeId: 'artifact',
      path: 'data.filename'
    })).toBe(false);
  });

  it('redacts DTOs to allowed paths for the active membership', () => {
    const redacted = redactEntityForAccess(artifact, 'artifact', {
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { artifacts: 'read' }
      }]
    });

    expect(redacted.identity.name).toBe('Sheet DXF');
    expect(redacted.data.filename).toBe('sheet.dxf');
    expect(redacted.data.layout.grid).toBe(true);
    expect(redacted.attachments.primary.fileId).toBe('f-1');
    expect(redacted.data.internalNotes).toBeUndefined();
  });

  it('uses active process permissions and field policies for redaction', () => {
    const redacted = redactEntityForAccess(artifact, 'artifact', {
      organizationId: 'org-1',
      effectivePermissions: { artifacts: 'read' },
      permissions: { artifacts: 'admin' },
      fieldPolicies: {
        artifact: {
          read: ['identity.name'],
          write: [],
          private: ['data.internalNotes']
        }
      }
    });

    expect(redacted.identity.name).toBe('Sheet DXF');
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
});
