import { describe, expect, it } from 'vitest';
import { compileProcessDefinition, normalizeProcessDefinition, resolveRoleAssignmentAccess } from './index.js';

describe('organization-owned process roles', () => {
  it('keeps role identities and user assignments outside process definitions', () => {
    const normalized = normalizeProcessDefinition({ roles: { role_a: { id: 'role_a' } }, assignments: { user_a: { roleIds: ['role_a'] } } });
    expect(normalized.roles).toBeUndefined();
    expect(normalized.assignments).toBeUndefined();
  });

  it('compiles process grants against an external catalog and resolves an assignment at runtime', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 3,
      roleGrants: { role_a: [{ feature: 'projects', level: 'read' }] }
    }, {}, { roles: { role_a: { id: 'role_a', label: 'Operator' } } });
    expect(compiled.userAccess).toBeUndefined();
    expect(resolveRoleAssignmentAccess({
      compiled,
      assignment: { userId: 'user_a', roleIds: ['role_a'], bindings: {} }
    }).permissions.projects).toEqual([{ level: 'read' }]);
  });

  it('rejects process references to unknown organization roles', () => {
    expect(() => compileProcessDefinition({ dataflowVersion: 3, roleGrants: { missing: [] } }, {}, { roles: {} }))
      .toThrow('missing organization role');
  });
});
