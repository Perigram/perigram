import { describe, expect, it } from 'vitest';
import { compileActionAccessWindows } from './compiler-core.js';
import { compileAssignmentAccess, compileRoles } from './access-compilation.js';

const domain = {
  entities: [{ type: 'queue', collection: 'queues' }]
};

function processWithRemove(access = {}) {
  return {
    actions: {
      remove: {
        id: 'remove',
        actionKind: 'deleteEntity',
        typeId: 'queue',
        trigger: { mode: 'manual' },
        access
      }
    },
    processNodes: {},
    graph: { nodes: [], edges: [] }
  };
}

describe('hard-delete action access', () => {
  it('compiles the authored admin access into a feature grant', () => {
    const process = processWithRemove({ level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] });
    const window = compileActionAccessWindows(process, domain).get('remove');
    expect(window.grants).toContainEqual(expect.objectContaining({
      feature: 'queues',
      level: 'admin',
      roleIds: ['role_admin']
    }));
  });

  it('makes the delete action runnable through the compiled role assignment', () => {
    const process = processWithRemove({ level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] });
    const roles = compileRoles(process, domain, { role_admin: { id: 'role_admin', label: 'Admin' } });
    const access = compileAssignmentAccess({
      assignment: { roleIds: ['role_admin'], status: 'active' },
      roles,
      domain
    });
    expect(access.permissions.queues).toContainEqual(expect.objectContaining({ level: 'admin' }));
    expect(access.actions.map(action => action.actionId)).toContain('remove');
  });
});
