import { describe, expect, it, vi } from 'vitest';
import { createProcessDesignerContract, projectEntityProcessCapabilities, validateProcessDefinition } from '~/packages/processes/src/index.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '~/packages/cts/src/index.js';
import { facadePackContent, facadeDomain } from '../../test-tools/facade-plugin.js';
import { getAppRegistry, resetAppRegistryForTests } from './app-registry.js';
import { performDurableEffect } from '~/server/features/process-definitions/service.js';

vi.mock('~/server/features/plugins/repository.js', () => ({
  listDeclarationsByOrganization: vi.fn(async () => facadePackContent.types),
  findDeclarationByTypeId: vi.fn(async (organizationId, typeId) => (
    facadePackContent.types.find(type => type.id === String(typeId)) || null
  )),
  listInstallsByOrganization: vi.fn(async () => []),
  listDisabledPacks: vi.fn(async () => [])
}));

vi.mock('~/server/features/cts-types/repository.js', () => ({
  listByOrganization: vi.fn(async () => []),
  findByTypeId: vi.fn(async () => null)
}));

vi.mock('~/server/features/instances/repository.js', () => ({
  CLASS_COLLECTIONS: Object.freeze({ file: 'files', item: 'items', group: 'groups', process: 'processes' }),
  collectionForClass: classOf => ({ file: 'files', item: 'items', group: 'groups', process: 'processes' }[classOf] || 'files'),
  insertInstance: vi.fn(async (_collection, doc) => ({ ...doc, _id: 'cassette-1' })),
  listInstances: vi.fn(async () => []),
  findInstance: vi.fn(async () => ({ _id: 'found-1', type: 'cassette' })),
  findInstanceAnywhere: vi.fn(async () => null),
  updateInstanceBlocks: vi.fn(async (_collection, _id, blocks) => ({ _id: 'found-1', ...blocks })),
  deleteInstance: vi.fn(async () => true)
}));
import * as instanceRepository from '~/server/features/instances/repository.js';

// Framework machinery types (entity-revision, process-definition) carry
// `framework: true` on their declarations: in the view for tenancy and
// ref targets, never projected as authorable instances. Their explicit
// services own them.
import * as entityEventService from '~/server/features/instance-events/service.js';

// The projected view is the single domain source (SPEC §19 after the cut):
// framework party types plus pack declarations.
const orgPanel = {
  id: 'panel', class: 'item', scope: 'org', organizationId: 'org-1', version: 1,
  fields: { serial: { base: 'string' } },
  states: { main: { initial: 'available', values: ['available', 'installed'], terminal: ['installed'] } }
};

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'app-registry-spec' });
  for (const declaration of [...frameworkTypes, ...facadePackContent.types, orgPanel]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', facadeDomain);
}

function registryCapabilities(registry, domain) {
  const bindings = {};
  for (const entity of domain.entities) {
    const service = registry.getInstanceService(entity.type);
    if (!service) continue;
    bindings[entity.type] = {
      list: service.processList,
      getById: service.processGetById,
      processUpdate: service.processUpdate,
      delete: service.processCapabilities?.delete,
      archive: service.processCapabilities?.archive,
      constructionHandlers: service.constructionHandlers
    };
  }
  return projectEntityProcessCapabilities(domain, bindings);
}

const FRAMEWORK_SERVICE_TYPES = ['organization', 'user', 'process_definition', 'entity_revision'];
// The cnc pack no longer mounts legacy entity services: every pack type
// rides the generic instance services.
const PACK_LEGACY_SERVICE_TYPES = [];

function createEffectDefinition(typeId, mode) {
  return {
    dataflowVersion: 4,
    roles: { admin: { id: 'admin', label: 'Admin' } },
    producerOutputs: {
      'create:result': {
        id: 'create:result',
        producerOutputId: 'create:result',
        nodeId: 'create',
        outputSocketId: 'result',
        typeId,
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: [], write: [], private: [] }
      }
    },
    processNodes: {
      create: {
        id: 'create',
        kind: 'cts.construct',
        typeId,
        producerOutputId: 'create:result',
        construction: { mode },
        state: { to: 'available' },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'admin', level: 'write' }] }
      }
    },
    graph: {
      nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
      edges: []
    }
  };
}

describe('application entity service bindings (resolver world, SPEC §13/§21)', () => {
  it('composes the application registry once and reuses the same instance', () => {
    const registry = getAppRegistry();
    expect(getAppRegistry()).toBe(registry);
  });

  it('serves the framework five explicitly and everything else through the resolver', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const explicit = new Map(registry.listInstanceServices().map(binding => [binding.type, binding.service]));
    // The facade domain is no pack: every facade type rides the generic
    // resolver through the installed-plugin declaration layer, so the
    // explicit registrations are the framework five alone.
    expect([...explicit.keys()].sort()).toEqual([
      ...FRAMEWORK_SERVICE_TYPES,
      ...PACK_LEGACY_SERVICE_TYPES
    ].sort());

    // Pack types resolve through the generic instance services with full
    // process boundaries.
    for (const entity of projectedDomain().entities) {
      const service = registry.getInstanceService(entity.type);
      expect(service, entity.type).not.toBeNull();
      expect(service.processList, entity.type).toBeTypeOf('function');
      expect(service.processGetById, entity.type).toBeTypeOf('function');
    }
  });

  it('exposes one canonical processDelete adapter exactly for hard-delete-capable services', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    for (const type of [...FRAMEWORK_SERVICE_TYPES, ...projectedDomain().entities.map(entity => entity.type)]) {
      const service = registry.getInstanceService(type);
      expect(typeof service.processDelete === 'function', type).toBe(service.processCapabilities.delete);
    }
  });

  it('agrees per mode: view construction, capability projection, designer palette, and compiler', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const domain = projectedDomain();
    const projection = registryCapabilities(registry, domain);
    const designer = createProcessDesignerContract(domain, projection);

    // Machinery types never project: the view is authorable instances only
    expect(domain.entities.map(entity => entity.type)).not.toContain('entity-revision');
    expect(domain.entities.map(entity => entity.type)).not.toContain('process-definition');

    for (const entity of domain.entities) {
      const service = registry.getInstanceService(entity.type);
      const declaredModes = (domain.construction[entity.type]?.modes || []).slice().sort();

      // Handlers are shared generic machinery (the payload protocols plus
      // per-call service-backed dispatch for plugin-bound modes); every
      // DECLARED mode must resolve one — no handlerless mode, no phantom
      // capability. The resolver's advertised createModes mirror is
      // static; the declaration is the executable law (genericCreate on a
      // constructed type refuses loudly — asserted below).
      for (const mode of declaredModes) {
        expect(typeof service.constructionHandlers?.[mode] === 'function' || mode in (service.constructionHandlers || {}), `${entity.type} mode ${mode}`).toBe(true);
      }
      expect(projection[entity.type].create, entity.type).toBe(declaredModes.length > 0);
      expect(projection[entity.type].createModes.slice().sort(), entity.type).toEqual(declaredModes);
      expect(projection[entity.type].create, entity.type).toBe(declaredModes.length > 0);
      const inPalette = designer.createEntityOptions.some(option => option.value === entity.type);
      expect(inPalette, entity.type).toBe(declaredModes.length > 0);
    }
  });

  it('dispatches a generic create effect through the generic instance service', async () => {
    resetAppRegistryForTests();
    vi.clearAllMocks();
    const insert = vi.mocked(instanceRepository.insertInstance).mockResolvedValue({ _id: 'cassette-1', type: 'cassette' });
    const publish = vi.spyOn(entityEventService, 'publishEntityChanged');
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: {}
    };

    // The facade view's payload types construct through their declared
    // creation protocols — cassette's `editor` mode is the blank create.
    const result = await performDurableEffect({
      kind: 'cts.construct',
      record: {
        id: 'n1',
        kind: 'cts.construct',
        typeId: 'cassette',
        construction: { mode: 'editor' }
      },
      inputs: {}
    }, auth, {}, projectedDomain());

    expect(result._id).toBeTypeOf('string');
    expect(result.type).toBe('cassette');
    expect(insert).toHaveBeenCalledTimes(1);
    // per-class collection (SPEC §13) with the type id as discriminator
    expect(insert.mock.calls[0][0]).toBe('files');
    // §3 stored shape: tenancy lives in the top-level organizationId slot;
    // lineage holds pure tree edges only (organizationId is stripped).
    expect(insert.mock.calls[0][1]).toMatchObject({ type: 'cassette', organizationId: 'org-1' });
    expect(insert.mock.calls[0][1].lineage).not.toHaveProperty('organizationId');
    expect(publish).toHaveBeenCalledWith(auth, {
      type: 'cassette',
      id: result._id,
      change: 'created',
      reason: 'process-create'
    });
    publish.mockRestore();
  });

  it('legacy types without declarations fail loudly — the view is the whole catalog', async () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    // The resolver still returns a service; the per-call declaration check
    // is the boundary (unknown types must not silently serve).
    await expect(registry.getInstanceService('warehouse').list({}, 'user-1', 'org-1'))
      .rejects.toThrow('Unknown type warehouse');
    await expect(registry.getInstanceService('cassette_design').create({}, 'user-1', 'org-1'))
      .rejects.toThrow('Unknown type cassette_design');
  });

  it('accepts a generic create for a view type and rejects unsupported modes', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const domain = projectedDomain();
    const roles = { admin: { id: 'admin', label: 'Admin' } };
    const capabilities = Object.fromEntries(
      domain.entities.map(entity => [entity.type, registry.getInstanceService(entity.type).processCapabilities])
    );

    // panel declares states (available initial): a create needs its target
    const definition = createEffectDefinition('panel', 'genericCreate');
    const ok = validateProcessDefinition(
      definition,
      domain,
      { roles, capabilities }
    );
    expect(ok.errors, JSON.stringify(ok.errors)).toEqual([]);
    expect(ok.ok).toBe(true);

    const unsupportedDefinition = createEffectDefinition('panel', 'unsupportedCreate');
    const unsupported = validateProcessDefinition(
      unsupportedDefinition,
      domain,
      { roles, capabilities }
    );
    expect(unsupported.ok).toBe(false);
    expect(unsupported.errors.join(' ')).toContain('unsupportedCreate');
  });

  it('resolves process reads for pack types through the per-class collections', async () => {
    resetAppRegistryForTests();
    vi.clearAllMocks();
    const find = vi.mocked(instanceRepository.findInstance).mockResolvedValue({ _id: 'cassette-9', type: 'cassette' });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: {}
    };

    const entity = await getAppRegistry().getInstanceService('cassette').processGetById('cassette-9', auth);

    expect(entity).toMatchObject({ _id: 'cassette-9', type: 'cassette' });
    expect(find).toHaveBeenCalledWith('files', 'cassette-9', 'cassette');
  });
});
