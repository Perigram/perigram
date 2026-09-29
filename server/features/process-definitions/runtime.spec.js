import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  organizationService: { getProcessConfiguration: vi.fn() }
}));
vi.mock('../cts-types/service.js', async () => {
  const cts = await import('~/packages/cts/src/index.js');
  const pack = await import('~/packages/cts/src/pack/cnc.js');
  const domainPack = await import('@perigram/facade');
  const registry = cts.createTypeRegistry({ id: 'spec-cts' });
  for (const declaration of [...cts.frameworkTypes, ...pack.cncTypePack, ...domainPack.facadeFileTypes]) {
    registry.defineType(declaration);
  }
  return { compileRegistryForOrganization: async () => registry };
});
vi.mock('./repository.js', () => ({ findActiveByOrganization: vi.fn(), findActiveSetByOrganization: vi.fn() }));
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => ({ getInstanceService: () => mocks.organizationService })
}));

import * as repository from './repository.js';
import { resolveProcessAuth } from './runtime.js';
import { createPersistedAcceptanceFixture, PERSISTED_ACCEPTANCE_IDS } from '~/test-data/persisted-acceptance.js';

describe('process runtime auth hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hydrates v5 species drafts: cts.construct grants reach the compiled access contract', async () => {
    // Regression: compileActiveProcessRuntime compiled the raw draft
    // without the v5 lowering seam, so cts.* records contributed no
    // grants and no screens to hydration — active v5 processes served
    // their authors an empty screen manifest.
    const fixture = createPersistedAcceptanceFixture();
    const v5Draft = {
      ...fixture.processDefinition,
      data: {
        ...fixture.processDefinition.data,
        processNodes: {
          ...fixture.processDefinition.data.processNodes,
          construct_queue: {
            id: 'construct_queue',
            kind: 'cts.construct',
            typeId: 'queue',
            construction: { mode: 'genericCreate', inputs: [] },
            trigger: { mode: 'manual' },
            access: { level: 'write', grants: [{ roleId: PERSISTED_ACCEPTANCE_IDS.role, level: 'write' }] }
          }
        },
        producerOutputs: {
          ...fixture.processDefinition.data.producerOutputs,
          'construct_queue:result': {
            producerOutputId: 'construct_queue:result',
            nodeId: 'construct_queue',
            outputSocketId: 'result',
            typeId: 'queue',
            lifecycle: { mode: 'domainDefault' },
            fields: { read: ['identity.*'], write: [], private: [] },
            allowedRoles: { read: [], write: [], admin: [] }
          }
        }
      }
    };
    repository.findActiveByOrganization.mockResolvedValue(v5Draft);
    repository.findActiveSetByOrganization.mockResolvedValue([v5Draft]);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({
      roles: fixture.roles,
      roleAssignments: { user_a: { userId: 'user_a', roleIds: [PERSISTED_ACCEPTANCE_IDS.role], bindings: {} } },
      activeProcessDefinitionId: v5Draft._id
    });

    const auth = await resolveProcessAuth({ userId: 'user_a', organizationId: 'org-acceptance' });
    const keys = (auth.screens || []).map(screen => screen.screenKey || screen.id);
    expect(keys.some(key => String(key).includes('queue'))).toBe(true);
    expect(auth.process?.active).toBe(true);
  });

  it('compiles the activated snapshot, not live draft edits', async () => {
    const fixture = createPersistedAcceptanceFixture();
    // The definition is active with edits saved after activation: the
    // runtime must keep serving the last-activated snapshot.
    const edited = {
      ...fixture.processDefinition,
      data: {
        ...structuredClone(fixture.processDefinition.data),
        graph: { nodes: [], edges: [] },
        processNodes: {},
        producerOutputs: {},
        screens: {},
        roleGrants: {}
      }
    };
    edited.data.activated = structuredClone(fixture.processDefinition.data);
    repository.findActiveByOrganization.mockResolvedValue(edited);
    repository.findActiveSetByOrganization.mockResolvedValue([edited]);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({
      roles: fixture.roles,
      roleAssignments: { [PERSISTED_ACCEPTANCE_IDS.user]: fixture.assignment }
    });

    const auth = await resolveProcessAuth({
      userId: PERSISTED_ACCEPTANCE_IDS.user,
      organizationId: PERSISTED_ACCEPTANCE_IDS.organization,
      memberships: [{ organizationId: PERSISTED_ACCEPTANCE_IDS.organization, status: 'active', permissions: {} }]
    });

    const keys = (auth.screens || []).map(screen => screen.screenKey || screen.id);
    expect(keys.some(key => String(key).includes('cassette'))).toBe(true);
  });

  it('compiles the additive active set as one merged contract', async () => {
    const fixture = createPersistedAcceptanceFixture();
    // Two active definitions: an explicitly empty one (the bootstrap
    // shape) plus the full fixture. The merged compile must carry the
    // fixture's screens and access untouched — one canvas, two authors.
    const empty = {
      ...fixture.processDefinition,
      _id: 'process-empty',
      data: {
        ...structuredClone(fixture.processDefinition.data),
        graph: { nodes: [], edges: [] },
        processNodes: {},
        producerOutputs: {},
        screens: {},
        roleGrants: {}
      }
    };
    repository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    repository.findActiveSetByOrganization.mockResolvedValue([empty, fixture.processDefinition]);
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

    expect(auth.process?.active).toBe(true);
    const keys = (auth.screens || []).map(screen => screen.screenKey || screen.id);
    expect(keys.some(key => String(key).includes('cassette'))).toBe(true);
    const granted = JSON.stringify(auth.effectivePermissions || auth.permissions || {});
    expect(granted).toContain('files');
  });

  it('combines the active process role contract with the organization assignment', async () => {
    const fixture = createPersistedAcceptanceFixture();
    repository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    repository.findActiveSetByOrganization.mockResolvedValue([fixture.processDefinition]);
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

    // Effective permissions key on the per-class collection feature
    // (cassette is a file-class type: 'files').
    expect(auth.effectivePermissions.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'write' })
    ]));
    expect(auth.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({ typeId: 'cassette' })
    ]));
    expect(auth.roleAssignments.roleIds).toEqual([PERSISTED_ACCEPTANCE_IDS.role]);
    // The generator payload rides with hydration: bundle types and projected
    // action records keyed by id.
    expect(Array.isArray(auth.process.bundle.types)).toBe(true);
    for (const action of Object.values(auth.process.actions || {})) {
      expect(action.typeId || action.actionKind).toBeTruthy();
      expect(action.id).toBeTruthy();
    }
  });

  it('does not grant process access without an organization assignment', async () => {
    const fixture = createPersistedAcceptanceFixture();
    repository.findActiveByOrganization.mockResolvedValue(fixture.processDefinition);
    repository.findActiveSetByOrganization.mockResolvedValue([fixture.processDefinition]);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({ roles: fixture.roles, roleAssignments: {} });
    const auth = await resolveProcessAuth({ userId: 'user_1', organizationId: 'org_1', memberships: [{ organizationId: 'org_1', status: 'active', permissions: {} }] });
    expect(auth.roleAssignments.roleIds).toEqual([]);
    expect(auth.effectivePermissions).toEqual({});
  });
});
