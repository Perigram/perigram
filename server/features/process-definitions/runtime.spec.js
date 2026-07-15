import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProcessAuth } from './runtime.js';

vi.mock('./repository.js', () => ({
  findActiveByOrganization: vi.fn()
}));

import * as repository from './repository.js';

describe('process runtime auth hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps generated process home screens for inferred operational screens', async () => {
    repository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      data: {
        compiled: {
          schemaVersion: 1,
          userAccess: {
            'user-1': {
              permissions: {
                projects: [{ level: 'read' }]
              },
              navigation: [
                { screenKey: 'home_user-1', route: '/screens/home_user-1' },
                { screenKey: 'auto_project', route: '/screens/auto_project' }
              ],
              screens: [
                {
                  id: 'home_user-1',
                  screenKey: 'home_user-1',
                  template: 'home',
                  route: '/screens/home_user-1',
                  regions: [
                    {
                      id: 'home_project_section',
                      sourceId: 'home_project',
                      screenKey: 'auto_project',
                      route: '/screens/auto_project'
                    }
                  ],
                  sources: [
                    {
                      id: 'home_project',
                      entityType: 'project',
                      mode: 'list'
                    }
                  ]
                },
                {
                  id: 'auto_project',
                  screenKey: 'auto_project',
                  template: 'entityList',
                  placement: 'hub',
                  entityType: 'project',
                  route: '/screens/auto_project'
                }
              ]
            }
          }
        }
      }
    });

    const result = await resolveProcessAuth({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        owner: true,
        permissions: {},
        status: 'active'
      }]
    });

    expect(result.screens.map(screen => screen.screenKey)).toEqual([
      'organization_overview',
      'organization_billing',
      'organization_team',
      'organization_process',
      'home_user-1',
      'auto_project'
    ]);
    expect(result.screens.find(screen => screen.template === 'home')).toMatchObject({
      screenKey: 'home_user-1',
      sources: [expect.objectContaining({ entityType: 'project', mode: 'list' })]
    });
    expect(result.navigation.find(item => item.screenKey === 'home_user-1')).toMatchObject({
      screenKey: 'home_user-1',
      route: '/screens/home_user-1'
    });
  });

  it('keeps authored process home screens intact', async () => {
    repository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      data: {
        compiled: {
          schemaVersion: 1,
          userAccess: {
            'user-1': {
              permissions: {
                projects: [{ level: 'read' }]
              },
              navigation: [
                { screenKey: 'home_user-1', route: '/screens/home_user-1' },
                { screenKey: 'project_board:/project-board', route: '/screens/project_board%3A%2Fproject-board' }
              ],
              screens: [
                {
                  id: 'home_user-1',
                  screenKey: 'home_user-1',
                  template: 'home',
                  route: '/screens/home_user-1',
                  regions: [
                    {
                      id: 'home_project_section',
                      sourceId: 'home_project',
                      screenKey: 'project_board:/project-board',
                      route: '/screens/project_board%3A%2Fproject-board'
                    }
                  ],
                  sources: [
                    {
                      id: 'home_project',
                      entityType: 'project',
                      mode: 'list'
                    }
                  ]
                },
                {
                  id: 'project_board',
                  screenKey: 'project_board:/project-board',
                  template: 'entityList',
                  placement: 'hub',
                  entityType: 'project',
                  route: '/screens/project_board%3A%2Fproject-board'
                }
              ]
            }
          }
        }
      }
    });

    const result = await resolveProcessAuth({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        owner: true,
        permissions: {},
        status: 'active'
      }]
    });

    expect(result.screens.find(screen => screen.template === 'home')).toMatchObject({
      screenKey: 'home_user-1'
    });
  });

  it('does not inject a blank process home when the active process has no compiled screens', async () => {
    repository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      data: {
        compiled: {
          schemaVersion: 1,
          userAccess: {
            'user-1': {
              permissions: {},
              navigation: [],
              screens: []
            }
          }
        }
      }
    });

    const result = await resolveProcessAuth({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{
        organizationId: 'org-1',
        owner: true,
        permissions: {},
        status: 'active'
      }]
    });

    expect(result.screens.find(screen => screen.template === 'home')).toBeFalsy();
    expect(result.navigation.find(item => item.screenKey === 'home_user-1')).toBeFalsy();
  });

  it('hydrates stale compiled action manifests from semantic process definitions', async () => {
    repository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      data: {
        roles: {
          role_installer: { id: 'role_installer' }
        },
        actions: {
          create_design: {
            id: 'create_design',
            actionKind: 'createEntity',
            entityType: 'cassette_design',
            construction: { mode: 'bakeCassetteDesignFromTemplate' },
            status: { to: 'ACTIVE' },
            trigger: { mode: 'manual' },
            access: { level: 'write', roleIds: ['role_installer'] },
            outputs: [{ id: 'created', entityType: 'cassette_design' }]
          }
        },
        assignments: {
          'user-1': { userId: 'user-1', roleIds: ['role_installer'], status: 'active' }
        },
        compiled: {
          schemaVersion: 1,
          actions: {
            create_design: {
              actionKind: 'createEntity',
              entityType: 'cassette_design'
            }
          },
          userAccess: {
            'user-1': {
              permissions: {},
              navigation: [],
              screens: [],
              actions: [{
                actionId: 'create_design',
                actionKind: 'createEntity',
                entityType: 'cassette_design'
              }]
            }
          }
        }
      }
    });

    const result = await resolveProcessAuth({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {}, status: 'active' }]
    });

    expect(result.roleAssignments.actions.find(action => action.actionId === 'create_design')).toMatchObject({
      actionKind: 'createEntity',
      entityType: 'cassette_design',
      contracts: {
        outputs: [expect.objectContaining({ entityType: 'cassette_design' })]
      }
    });
  });

  it('hydrates stale compiled runtime after normalizing legacy changeStatus actions', async () => {
    repository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      data: {
        roles: {
          role_operator: { id: 'role_operator' }
        },
        actions: {
          mark_queue_ready: {
            id: 'mark_queue_ready',
            actionKind: 'changeStatus',
            entityType: 'queue',
            status: { from: 'DRAFT', to: 'READY' },
            trigger: { mode: 'manual' },
            access: { level: 'write', roleIds: ['role_operator'] }
          }
        },
        assignments: {
          'user-1': { userId: 'user-1', roleIds: ['role_operator'], status: 'active' }
        },
        compiled: {
          schemaVersion: 1,
          actions: {
            mark_queue_ready: {
              actionKind: 'changeStatus',
              entityType: 'queue'
            }
          },
          userAccess: {
            'user-1': {
              permissions: {},
              navigation: [],
              screens: [],
              actions: [{
                actionId: 'mark_queue_ready',
                actionKind: 'changeStatus',
                entityType: 'queue'
              }]
            }
          }
        }
      }
    });

    const result = await resolveProcessAuth({
      userId: 'user-1',
      organizationId: 'org-1',
      memberships: [{ organizationId: 'org-1', permissions: {}, status: 'active' }]
    });

    expect(result.roleAssignments.actions.find(action => action.actionId === 'mark_queue_ready')).toMatchObject({
      actionKind: 'updateEntity',
      entityType: 'queue',
      contracts: {
        inputs: [expect.objectContaining({ entityType: 'queue' })],
        outputs: [expect.objectContaining({ entityType: 'queue' })]
      }
    });
  });
});
