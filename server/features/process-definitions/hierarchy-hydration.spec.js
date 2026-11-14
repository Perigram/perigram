import { beforeEach, describe, expect, it, vi } from 'vitest';

// The org-authored hierarchy acceptance chain: org types declared with a
// children edge (no graph Lineage composition) must reach the hydrated UI
// contract — the parent's inferred detail station carries the child
// collection filtered by the DECLARED lineage key, and the home suppresses
// the child section. This spec chains the real CTS projection (the same
// `compileRegistryForOrganization` → `projectDomainFromView` seam
// `compileActiveProcessRuntime` uses) with the real compiler.

const ORG_ID = 'org-hierarchy';
const ROLE_ID = 'role-operator';

const mocks = vi.hoisted(() => ({
  organizationService: { getProcessConfiguration: vi.fn() }
}));
const fixtures = vi.hoisted(() => ({
  organizationId: 'org-hierarchy',
  bin: {
    id: 'bin',
    name: 'Bin',
    class: 'group',
    scope: 'org',
    version: 1,
    fields: { label: { base: 'string', identifier: true } },
    edges: { children: { panels: { types: ['panel'], onRemove: 'restrict' } } },
    states: { main: { initial: 'new', states: { new: {} } } }
  },
  panel: {
    id: 'panel',
    name: 'Panel',
    class: 'item',
    scope: 'org',
    version: 1,
    fields: { serial: { base: 'string', identifier: true } },
    states: { main: { initial: 'new', states: { new: {} } } }
  }
}));

vi.mock('../plugins/repository.js', () => ({
  listDisabledPacks: vi.fn(async () => []),
  enablePack: vi.fn(),
  disablePack: vi.fn(),
  listInstallsByOrganization: vi.fn(async () => []),
  listDeclarationsByOrganization: vi.fn(async () => []),
  findDeclarationByTypeId: vi.fn(async () => null),
  findInstallByConnectorToken: vi.fn(async () => null)
}));
vi.mock('../cts-types/service.js', async () => {
  const cts = await import('@perigram/cts/index');
  const pack = await import('@perigram/cts/pack/cnc');
  const registry = cts.createTypeRegistry({ id: 'spec-cts-org' });
  for (const declaration of [...cts.frameworkTypes, ...pack.cncTypePack]) {
    registry.defineType(declaration);
  }
  // The org-authored hierarchy: bin (group) declares panel (item) as its
  // child through a children edge with NO authored lineageKey — the stamp
  // derives 'binId' at edge normalize (SPEC §6).
  registry.defineType({ ...fixtures.bin, organizationId: fixtures.organizationId });
  registry.defineType({ ...fixtures.panel, organizationId: fixtures.organizationId });
  return { compileRegistryForOrganization: async () => registry };
});

vi.mock('./repository.js', () => ({ findActiveByOrganization: vi.fn(), findActiveSetByOrganization: vi.fn() }));
vi.mock('~/server/runtime/app-registry.js', () => ({
  getAppRegistry: () => ({ getInstanceService: () => mocks.organizationService })
}));

import * as repository from './repository.js';
import { resolveProcessAuth } from './runtime.js';
import { PROCESS_DATAFLOW_VERSION } from '@perigram/processes/index';

function orgHierarchyProcess() {
  const producer = (nodeId, typeId) => ({
    [`${nodeId}:result`]: {
      id: `${nodeId}:result`,
      producerOutputId: `${nodeId}:result`,
      nodeId,
      outputSocketId: 'result',
      typeId,
      lifecycle: { mode: 'domainDefault' },
      fields: { read: ['name'], write: [], private: [] },
      allowedRoles: { read: [ROLE_ID], write: [ROLE_ID], admin: [] }
    }
  });
  const createNode = (nodeId, typeId) => ({
    id: nodeId,
    kind: 'cts.construct',
    typeId,
    producerOutputId: `${nodeId}:result`,
    label: `Create ${typeId}`,
    construction: { mode: 'genericCreate', inputs: [] },
    trigger: { mode: 'manual' },
    access: { level: 'write', grants: [{ roleId: ROLE_ID, level: 'write' }] },
    state: { to: 'new' },
    blocks: []
  });
  return {
    _id: 'proc-org-hierarchy',
    identity: { uid: 'proc-org-hierarchy', name: 'Org hierarchy process' },
    lineage: { organizationId: ORG_ID },
    data: {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: {
        nodes: ['create_bin', 'create_panel'].map((id, index) => ({
          id, type: 'processNode', position: { x: index * 240, y: 120 }, data: { refId: id }
        })),
        edges: [], viewport: { x: 0, y: 0, zoom: 1 }
      },
      roleGrants: {},
      producerOutputs: { ...producer('create_bin', 'bin'), ...producer('create_panel', 'panel') },
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        create_bin: createNode('create_bin', 'bin'),
        create_panel: createNode('create_panel', 'panel')
      }
    }
  };
}

describe('org-authored hierarchy hydration (declared children edges, no graph lineage)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places the child collection on the parent detail station and suppresses the child home section', async () => {
    repository.findActiveByOrganization.mockResolvedValue(orgHierarchyProcess());
    repository.findActiveSetByOrganization.mockResolvedValue([orgHierarchyProcess()]);
    mocks.organizationService.getProcessConfiguration.mockResolvedValue({
      roles: { [ROLE_ID]: { id: ROLE_ID, label: 'Operator' } },
      roleAssignments: { user_a: { userId: 'user_a', roleIds: [ROLE_ID], bindings: {} } }
    });

    const auth = await resolveProcessAuth({ userId: 'user_a', organizationId: ORG_ID });

    // The parent detail station carries the child collection filtered by
    // the DECLARED lineage key (the stamped 'binId', never the children
    // entry's map key 'panels').
    const binDetail = (auth.screens || []).find(screen => screen.screenKey === 'auto_bin_detail');
    expect(binDetail).toBeTruthy();
    expect(binDetail.sources.find(source => source.id === 'panel_children'))
      .toMatchObject({ typeId: 'panel', mode: 'list', filters: { binId: '$screen.scope.instanceId' } });
    expect(binDetail.regions.some(region => region.sourceId === 'panel_children')).toBe(true);

    // The child list stays reachable but is suppressed from the home: it
    // accumulates under its parent instead.
    const home = (auth.screens || []).find(screen => screen.template === 'home');
    expect(home.sources.map(source => source.typeId)).toEqual(['bin']);

    // The wire lineage-binding payload keeps compiled bindings only; the
    // declared hierarchy rides the bundle edges the registry store
    // derives containment from (declared: 'org').
    expect(auth.process.bundle.types.some(type => type.id === 'bin' && type.scope === 'org')).toBe(true);
  });
});
