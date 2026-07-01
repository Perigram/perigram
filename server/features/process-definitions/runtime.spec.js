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

  it('strips stale generated home screens when the process has only auto-generated screens', async () => {
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
      'auto_project'
    ]);
    expect(result.screens.find(screen => screen.template === 'home')).toBeFalsy();
    expect(result.navigation[0]).toMatchObject({
      id: 'organization_overview',
      route: '/organization'
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
});
