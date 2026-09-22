import { describe, expect, it } from 'vitest';
import { previewAssignmentAccess } from './assignment-access-preview.js';

const domain = {
  entities: [
    { type: 'project', collection: 'projects' },
    { type: 'queue', collection: 'queues' }
  ],
  fieldAccess: {
    project: { feature: 'projects' },
    queue: { feature: 'queues' }
  }
};

const compiled = {
  roles: {
    viewer: {
      grants: [{ feature: 'projects', level: 'read', rule: { fact: 'status.primary', equals: 'READY' } }],
      actions: []
    },
    operator: {
      grants: [{ feature: 'queues', level: 'write', scope: { projectId: '$assignment.projectId' }, transitions: ['OPEN->DONE'] }],
      actions: [{ actionId: 'finish', label: 'Finish', actionKind: 'updateEntity', feature: 'queues', typeId: 'queue', state: { from: 'OPEN', to: 'DONE' } }]
    }
  },
  screens: {
    projects: { id: 'projects', label: 'Projects', roleIds: ['viewer'], required: { feature: 'projects', level: 'read' } },
    queue: { id: 'queue', label: 'Queue', roleIds: ['operator'], route: '/queue/$assignment.queueId', scope: { instanceId: '$assignment.queueId' }, required: { feature: 'queues', level: 'read' } }
  },
  workflows: {
    queue: { regions: { main: { transitions: [{ from: 'OPEN', to: 'DONE', processRoleIds: ['operator'] }] } } }
  },
  fieldPolicies: { project: { read: ['identity.*'], write: [], private: [] }, queue: { read: ['identity.*'], write: ['status.*'], private: [] } }
};

describe('previewAssignmentAccess', () => {
  it('evaluates one role and reports unresolved and denied conditional access', () => {
    const unresolved = previewAssignmentAccess({ compiled, assignment: { roleIds: ['viewer'], bindings: {} }, domain });
    expect(unresolved.entities.find(item => item.feature === 'projects')).toMatchObject({ allowed: null });
    expect(unresolved.entities[0].explanation).toContain('Unresolved');
    expect(unresolved.screens.find(item => item.id === 'projects')).toMatchObject({ allowed: null });

    const denied = previewAssignmentAccess({
      compiled, assignment: { roleIds: ['viewer'], bindings: {} }, domain,
      contexts: [{ typeId: 'project', status: 'DRAFT' }]
    });
    expect(denied.entities.find(item => item.feature === 'projects')).toMatchObject({ allowed: false });
    expect(denied.entities.find(item => item.feature === 'queues')).toMatchObject({ allowed: false });
    expect(denied.screens.find(item => item.id === 'projects')).toMatchObject({ allowed: false });
    expect(denied.entities.find(item => item.feature === 'projects').fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'identity.*', allowed: false })
    ]));
  });

  it('adds several roles, resolves typed overloaded bindings, status and lineage scopes, fields, actions, transitions, and screens', () => {
    const preview = previewAssignmentAccess({
      compiled,
      assignment: { roleIds: ['viewer', 'operator'], bindings: { projectId: 'project-1', queueId: 'queue-1' } },
      domain,
      contexts: [
        { typeId: 'project', instanceId: 'project-1', status: 'READY' },
        { typeId: 'queue', instanceId: 'queue-1', status: 'OPEN', lineage: { projectId: 'project-1' } }
      ]
    });
    expect(preview.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: 'projects', allowed: true }),
      expect.objectContaining({ feature: 'queues', allowed: true })
    ]));
    expect(preview.entities.flatMap(item => item.fields).length).toBeGreaterThan(0);
    expect(preview.actions).toEqual([expect.objectContaining({ actionId: 'finish', allowed: true })]);
    expect(preview.transitions).toEqual([expect.objectContaining({ transition: 'OPEN->DONE', allowed: true })]);
    expect(preview.screens.map(screen => screen.id)).toEqual(expect.arrayContaining(['projects', 'queue']));
    expect(preview.screens.find(screen => screen.id === 'projects')).toMatchObject({ allowed: true });
    expect(preview.screens.find(screen => screen.id === 'queue').scope.instanceId).toBe('queue-1');
  });

  it('attributes owner recovery to active membership instead of process roles', () => {
    const preview = previewAssignmentAccess({
      compiled: { roles: {}, screens: {} }, assignment: { roleIds: [], bindings: {} }, domain,
      membership: { owner: true, status: 'active' }
    });
    expect(preview.roleIds).toEqual([]);
    expect(preview.permissions).toMatchObject({ organizations: { level: 'admin' }, users: { level: 'admin' } });
    expect(preview.ownerRecovery).toMatchObject({ applied: true });
    expect(preview.ownerRecovery.explanation).toContain('membership');
  });
});
