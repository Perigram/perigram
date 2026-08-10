import { describe, expect, it } from 'vitest';
import { migrateProcessData, migrateUserData, planOrganizationRoleMigration } from './migrate-process-roles-to-organizations.js';

describe('organization role migration', () => {
  it('takes identities and assignments from the active process and promotes draft-only roles', () => {
    const processes = [
      { _id: 'active', status: { state: { primary: 'ACTIVE' } }, data: { roles: { role_admin: { label: 'Admin' } }, assignments: { user_1: { roleIds: ['role_admin'] } } } },
      { _id: 'draft', status: { state: { primary: 'DRAFT' } }, data: { roles: { role_admin: { label: 'Changed' }, role_new: { label: 'New' } } } }
    ];
    const plan = planOrganizationRoleMigration({ organization: {}, processes, users: [{ _id: 'user_1' }] });
    expect(plan.roles).toEqual({ role_admin: { id: 'role_admin', label: 'Admin' }, role_new: { id: 'role_new', label: 'New' } });
    expect(plan.roleAssignments.user_1.roleIds).toEqual(['role_admin']);
    expect(plan.labelDivergence).toHaveLength(1);
    expect(plan.unresolved).toEqual([]);
  });

  it('moves grants out of role identities and removes assignment duplication', () => {
    const data = migrateProcessData({ roles: { role_a: { label: 'A', grants: [{ feature: 'users', level: 'read' }] } }, assignments: { user: {} } }, { role_a: { id: 'role_a', label: 'A' } }, 'DRAFT');
    expect(data.roles).toBeUndefined();
    expect(data.assignments).toBeUndefined();
    expect(data.roleGrants.role_a).toEqual([{ feature: 'users', level: 'read' }]);
    expect(data.compiled).toBeNull();
  });

  it('preserves canonical organization roles and migrates membership role ids once', () => {
    const plan = planOrganizationRoleMigration({
      organization: {
        _id: 'org',
        data: {
          roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
          roleAssignments: { user_1: { userId: 'user_1', roleIds: ['role_admin'], bindings: {} } }
        }
      },
      users: [
        { _id: 'user_1', data: { memberships: [{ organizationId: 'org', roleId: 'role_admin' }] } },
        { _id: 'user_2', data: { memberships: [{ organizationId: 'org', roleId: 'role_admin' }] } }
      ],
      invitations: [{ _id: 'invitation', roleIds: ['role_admin'] }]
    });

    expect(plan.roles).toEqual({ role_admin: { id: 'role_admin', label: 'Admin' } });
    expect(plan.roleAssignments).toEqual({
      user_1: { userId: 'user_1', roleIds: ['role_admin'], bindings: {} },
      user_2: { userId: 'user_2', roleIds: ['role_admin'], bindings: {} }
    });
    expect(plan.unresolved).toEqual([]);
  });

  it('removes role state from users and memberships', () => {
    expect(migrateUserData({ role: 'role_a', memberships: [{ organizationId: 'org', role: 'role_a', roleId: 'role_a', roleIds: ['role_a'], status: 'active' }] }))
      .toEqual({ memberships: [{ organizationId: 'org', status: 'active' }] });
  });
});
