import { describe, expect, it } from 'vitest';
import {
  canDisplayEntityField,
  filterEntityFields,
  redactEntityForAccess
} from './entity-field-access.js';

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

describe('entity field access', () => {
  it('denies fields without a registered entity policy', () => {
    expect(canDisplayEntityField({
      permissions: { projects: 'admin' },
      entity: project,
      entityType: 'project',
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
      entityType: 'project'
    }).map(field => field.path)).toEqual([
      'summary.queueCount',
      'data.address'
    ]);

    expect(filterEntityFields({
      fields,
      permissions: { projects: 'write' },
      entity: project,
      entityType: 'project'
    }).map(field => field.path)).toEqual([
      'summary.queueCount',
      'data.address',
      'data.metadata.customerNote'
    ]);
  });

  it('honors scoped permission grants', () => {
    const permissions = {
      projects: { level: 'read', scope: { projectId: 'project-1' } }
    };

    expect(canDisplayEntityField({
      permissions,
      entity: project,
      entityType: 'project',
      path: 'summary.queueCount'
    })).toBe(true);

    expect(canDisplayEntityField({
      permissions,
      entity: { ...project, lineage: { ...project.lineage, projectId: 'project-2' } },
      entityType: 'project',
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
});
