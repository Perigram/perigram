import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository.js', () => ({ findActiveByOrganization: vi.fn() }));
vi.mock('../organizations/repository.js', () => ({ findById: vi.fn() }));

import * as repository from './repository.js';
import * as organizationsRepository from '../organizations/repository.js';
import { resolveProcessAuth } from './runtime.js';

describe('process runtime auth hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines the active process role contract with the organization assignment', async () => {
    repository.findActiveByOrganization.mockResolvedValue({
      data: {
        compiled: {
          schemaVersion: 1,
          workflows: {},
          fieldPolicies: {},
          actions: {},
          roles: {
            role_operator: {
              id: 'role_operator',
              label: 'Operator',
              grants: [{ feature: 'projects', level: 'read' }],
              actions: []
            }
          },
          screens: {
            projects: {
              id: 'projects',
              screenKey: 'projects',
              template: 'entityList',
              route: '/screens/projects',
              roleIds: ['role_operator'],
              required: { feature: 'projects', level: 'read' },
              sources: [{ id: 'projects', entityType: 'project', mode: 'list' }]
            }
          }
        }
      }
    });
    organizationsRepository.findById.mockResolvedValue({
      data: {
        roles: { role_operator: { id: 'role_operator', label: 'Operator' } },
        roleAssignments: { user_1: { userId: 'user_1', roleIds: ['role_operator'], bindings: {} } }
      }
    });

    const auth = await resolveProcessAuth({
      userId: 'user_1',
      organizationId: 'org_1',
      memberships: [{ organizationId: 'org_1', status: 'active', permissions: {} }]
    });

    expect(auth.effectivePermissions.projects).toEqual([{ level: 'read' }]);
    expect(auth.screens).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'projects' })]));
    expect(auth.roleAssignments.roleIds).toEqual(['role_operator']);
  });

  it('does not grant process access without an organization assignment', async () => {
    repository.findActiveByOrganization.mockResolvedValue({ data: { compiled: { schemaVersion: 1, workflows: {}, fieldPolicies: {}, actions: {}, roles: {}, screens: {} } } });
    organizationsRepository.findById.mockResolvedValue({ data: { roles: {}, roleAssignments: {} } });
    const auth = await resolveProcessAuth({ userId: 'user_1', organizationId: 'org_1', memberships: [{ organizationId: 'org_1', status: 'active', permissions: {} }] });
    expect(auth.roleAssignments.roleIds).toEqual([]);
    expect(auth.effectivePermissions).toEqual({});
  });
});
