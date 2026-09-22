import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  redactEntityForAccess
} from './instance-field-access.js';

const project = {
  _id: 'project-1',
  identity: { uid: 'p-1', name: 'Project One' },
  lineage: { organizationId: 'org-1', projectId: 'project-1' },
  summary: { queueCount: 2, totalArea: 12 },
  data: {
    address: 'Factory Row',
    metadata: { customerNote: 'private' },
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
      permissions: { projects: 'read' }
    }]
  }
};

describe('entity field access', () => {
  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { projects: 'admin' },
      entity: project,
      typeId: 'project',
      path: 'billing.internalCost'
    })).toBe(false);
  });

  it('filters card field descriptors by policy and active permissions', () => {
    const fields = [
      { path: 'summary.queueCount' },
      { path: 'data.address' },
      { path: 'data.metadata.customerNote' },
      { path: 'data.internalCost' }
    ];

    expect(filterEntityFields({
      fields,
      permissions: { projects: 'read' },
      entity: project,
      typeId: 'project'
    }).map(field => field.path)).toEqual([
      'summary.queueCount',
      'data.address'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { projects: 'write' },
      entity: project,
      typeId: 'project'
    }).map(field => field.path)).toEqual([
      'summary.queueCount',
      'data.address',
      'data.metadata.customerNote'
    ]);
  });

  it('keeps public system catalogue read fields visible without grants', () => {
    const material = {
      _id: 'mat-1',
      identity: { name: 'ACM' },
      lineage: { scope: 'system', public: true },
      data: { code: 'ACM', description: 'Panel', visibility: { public: true } }
    };

    expect(redactEntityForAccess(material, 'material', { permissions: {} })).toMatchObject({
      _id: 'mat-1',
      identity: { name: 'ACM' },
      data: { code: 'ACM', description: 'Panel' }
    });
  });

  it('honors scoped permission grants', () => {
    const permissions = {
      projects: { level: 'read', scope: { projectId: 'project-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: project,
      typeId: 'project',
      path: 'summary.queueCount'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...project, lineage: { ...project.lineage, projectId: 'project-2' } },
      typeId: 'project',
      path: 'summary.queueCount'
    })).toBe(false);
  });

  it('redacts DTOs to allowed paths for the active membership', () => {
    const redacted = redactEntityForAccess(project, 'project', {
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        permissions: { projects: 'read' }
      }]
    });

    expect(redacted.identity.name).toBe('Project One');
    expect(redacted.summary.queueCount).toBe(2);
    expect(redacted.data.address).toBe('Factory Row');
    expect(redacted.data.metadata).toBeUndefined();
    expect(redacted.data.internalCost).toBeUndefined();
  });

  it('uses active process permissions and field policies for redaction', () => {
    const redacted = redactEntityForAccess(project, 'project', {
      organizationId: 'org-1',
      effectivePermissions: { projects: 'read' },
      permissions: { projects: 'admin' },
      fieldPolicies: {
        project: {
          read: ['identity.name'],
          write: [],
          private: ['data.internalCost']
        }
      }
    });

    expect(redacted.identity.name).toBe('Project One');
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
