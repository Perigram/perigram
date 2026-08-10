import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  organizationService: { getProcessConfiguration: vi.fn() }
}));
vi.mock('./repository.js', () => ({ findActiveByOrganization: vi.fn() }));
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => ({ getEntityService: () => mocks.organizationService })
}));

import * as repository from './repository.js';
import { resolveProcessAuth } from './runtime.js';
import { createPersistedAcceptanceFixture, PERSISTED_ACCEPTANCE_IDS } from '~/test-data/persisted-acceptance.js';

describe('process runtime auth hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines the active process role contract with the organization assignment', async () => {
    const fixture = createPersistedAcceptanceFixture();
    repository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({
      roles: fixture.roles,
      roleAssignments: {
        [PERSISTED_ACCEPTANCE_IDS.user]: fixture.assignment
      }
    });

    const auth = await resolveProcessAuth({
      userId: PERSISTED_ACCEPTANCE_IDS.user,
      organizationId: PERSISTED_ACCEPTANCE_IDS.organization,
      memberships: [{ organizationId: PERSISTED_ACCEPTANCE_IDS.organization, status: 'active', permissions: {} }]
    });

    expect(auth.effectivePermissions.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'write' })
    ]));
    expect(auth.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'project' })
    ]));
    expect(auth.roleAssignments.roleIds).toEqual([PERSISTED_ACCEPTANCE_IDS.role]);
  });

  it('does not grant process access without an organization assignment', async () => {
    const fixture = createPersistedAcceptanceFixture();
    repository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({ roles: fixture.roles, roleAssignments: {} });
    const auth = await resolveProcessAuth({ userId: 'user_1', organizationId: 'org_1', memberships: [{ organizationId: 'org_1', status: 'active', permissions: {} }] });
    expect(auth.roleAssignments.roleIds).toEqual([]);
    expect(auth.effectivePermissions).toEqual({});
  });
});
