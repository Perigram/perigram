import { describe, expect, it, vi } from 'vitest';
import { cncDomain, getEntityConstruction } from '~/packages/domain-cnc/src/index.js';
import { createProcessDesignerContract, projectEntityProcessCapabilities, resolveCatalogNodePorts } from '~/packages/processes/src/index.js';
import { normalizeProcessDefinition, validateProcessDefinition } from '~/packages/processes/src/compiler-core.js';
import { entityBlocks } from '~/packages/processes/src/node-catalog.js';
import { getAppRegistry, resetAppRegistryForTests } from './app-registry.js';
import { performDurableEffect } from '~/server/features/process-definitions/service.js';
import * as warehousesService from '~/server/features/warehouses/service.js';
import * as cassettesService from '~/server/features/cassettes/service.js';
import * as librariesService from '~/server/features/libraries/service.js';
import * as entityEventService from '~/server/features/entity-events/service.js';

function hasArchivedState(workflow = null) {
  return Boolean(workflow && Object.values(workflow.regions || {}).some(region => (
    region.states && Object.prototype.hasOwnProperty.call(region.states, 'ARCHIVED')
  )));
}

function registryBindings(registry) {
  const bindings = {};
  for (const binding of registry.listEntityServices()) {
    const service = binding.service;
    bindings[binding.type] = {
      list: service.processList,
      getById: service.processGetById,
      processUpdate: service.processUpdate,
      delete: service.processCapabilities?.delete,
      archive: service.processCapabilities?.archive,
      constructionHandlers: service.constructionHandlers
    };
  }
  return bindings;
}

function registryCapabilities(registry) {
  return Object.fromEntries(
    registry.listEntityServices().map(binding => [binding.type, binding.service.processCapabilities])
  );
}

function createEffectDefinition(entityType, mode) {
  return {
    dataflowVersion: 4,
    roles: { admin: { id: 'admin', label: 'Admin' } },
    producerOutputs: {
      'create:entity': {
        id: 'create:entity',
        producerOutputId: 'create:entity',
        nodeId: 'create',
        outputSocketId: 'entity',
        entityType,
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: [], write: [], private: [] }
      }
    },
    processNodes: {
      create: {
        id: 'create',
        kind: 'effect.createEntity',
        entityType,
        producerOutputId: 'create:entity',
        construction: { mode },
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'admin', level: 'write' }] },
        status: { to: 'CREATED' },
        blocks: [],
        inputs: [],
        outputs: []
      }
    },
    graph: {
      nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
      edges: []
    }
  };
}

describe('application entity service bindings', () => {
  it('gives every domain entity explicit process read boundaries', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const bindings = new Map(registry.listEntityServices().map(binding => [binding.type, binding.service]));

    for (const entity of cncDomain.entities) {
      expect(bindings.get(entity.type)?.processList, entity.type).toBeTypeOf('function');
      expect(bindings.get(entity.type)?.processGetById, entity.type).toBeTypeOf('function');
    }
  });

  it('exposes one canonical processDelete adapter exactly for hard-delete-capable services', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    for (const { type, service } of registry.listEntityServices()) {
      expect(typeof service.processDelete === 'function', type).toBe(service.processCapabilities.delete);
    }
  });

  it('agrees per mode: designer creatability, compiler acceptance, and runtime handlers', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const services = new Map(registry.listEntityServices().map(binding => [binding.type, binding.service]));
    const projection = projectEntityProcessCapabilities(cncDomain, registryBindings(registry));
    const designer = createProcessDesignerContract(cncDomain, projection);

    for (const entity of cncDomain.entities) {
      const type = entity.type;
      const service = services.get(type);
      const declaredModes = (getEntityConstruction(type)?.modes || []).slice().sort();

      // runtime: every declared construction mode maps to a registered handler
      expect(Object.keys(service.constructionHandlers || {}).sort(), type).toEqual(declaredModes);

      // capability record derives create and createModes from the handler intersection
      expect(service.processCapabilities.createModes, type).toEqual(declaredModes);
      expect(service.processCapabilities.create, type).toBe(declaredModes.length > 0);

      // the serialized projection matches the runtime record
      expect(projection[type].createModes, type).toEqual(declaredModes);
      expect(projection[type].create, type).toBe(declaredModes.length > 0);

      // designer palette exposes an entity exactly when it has effective create modes
      const inPalette = designer.createEntityOptions.some(option => option.value === type);
      expect(inPalette, type).toBe(declaredModes.length > 0);
    }
  });

  it('projects every creatable construction contract into exact Create Entity inputs and blocks', () => {
    const contracts = Object.entries(cncDomain.construction);
    expect(contracts).toHaveLength(14);

    for (const [entityType, contract] of contracts) {
      expect(contract, entityType).not.toHaveProperty('parentEnforcement');
      const schemas = cncDomain.fieldSchemas[entityType] || [];
      const blocks = [...new Set([
        ...schemas.filter(field => field.constructible !== false).map(field => field.block),
        ...entityBlocks(cncDomain, entityType).filter(block => (
          cncDomain.blockComposition[block]
          && !['origin', 'status', 'provenance', 'summary'].includes(block)
        ))
      ].filter(Boolean))];

      for (const mode of contract.modes) {
        const normalized = normalizeProcessDefinition({
          dataflowVersion: 4,
          processNodes: {
            create: {
              id: 'create',
              kind: 'effect.createEntity',
              entityType,
              construction: { mode },
              blocks,
              trigger: { mode: 'manual' }
            }
          },
          graph: { nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }], edges: [] }
        }, cncDomain);
        const record = normalized.processNodes.create;
        const declaredInputs = contract.modeInputs?.[mode] || contract.inputs || [];
        const ports = resolveCatalogNodePorts(record, { fieldSchemas: schemas }).inputs;
        const projectedInputs = record.construction.inputs;

        expect(projectedInputs.map(input => input.id), `${entityType}:${mode}`).toEqual(declaredInputs.map(input => input.id));
        for (const declared of declaredInputs) {
          const projected = projectedInputs.find(input => input.id === declared.id);
          expect(projected, `${entityType}:${mode}:${declared.id}`).toMatchObject({
            id: declared.id,
            required: Boolean(declared.required),
            ...(declared.prompt !== undefined ? { prompt: declared.prompt } : {}),
            ...(declared.accepts ? { accepts: declared.accepts } : {}),
            ...(declared.attachmentKinds ? { attachmentKinds: declared.attachmentKinds } : {}),
            ...(declared.creator?.entityType ? { creator: { entityType: declared.creator.entityType } } : {})
          });
        }

        const expectedIds = mode === 'genericCreate'
          ? [...blocks, 'status.state.primary']
          : [...declaredInputs.map(input => input.id), ...blocks, 'status.state.primary'];
        expect(ports.map(port => port.id), `${entityType}:${mode}`).toEqual(expectedIds);
        expect(ports.every(port => port.access === 'list'), `${entityType}:${mode}`).toBe(true);
        expect(ports.at(-1), `${entityType}:${mode}:status`).toMatchObject({
          id: 'status.state.primary',
          required: false,
          type: { base: 'status', entityType }
        });
        for (const declared of mode === 'genericCreate'
          ? []
          : declaredInputs.filter(input => ['entity', 'entityList'].includes(input.type))) {
          const port = ports.find(input => input.id === declared.id);
          if (declared.type === 'entity') {
            expect(port.type, `${entityType}:${mode}:${declared.id}`).toMatchObject({ base: 'entityRef', entityType: declared.entityType });
          } else {
            expect(port.type, `${entityType}:${mode}:${declared.id}`).toMatchObject({
              base: 'array',
              itemType: { base: 'entityRef', accepts: declared.accepts }
            });
          }
          expect(port.required, `${entityType}:${mode}:${declared.id}`).toBe(Boolean(declared.required && declared.default === undefined));
        }
      }
    }
  });

  it('dispatches a generic create effect through the registered genericCreate handler', async () => {
    resetAppRegistryForTests();
    const create = vi.spyOn(warehousesService, 'create').mockResolvedValue({ _id: 'warehouse-1' });
    const publish = vi.spyOn(entityEventService, 'publishEntityChanged');
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: {}
    };

    const result = await performDurableEffect({
      kind: 'effect.createEntity',
      record: {
        id: 'n1',
        entityType: 'warehouse',
        construction: { mode: 'genericCreate' },
        blocks: [],
        inputs: [],
        outputs: []
      },
      inputs: {}
    }, auth, {});

    expect(result._id).toBe('warehouse-1');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ lineage: { organizationId: 'org-1' } });
    expect(create.mock.calls[0][1]).toBe('user-1');
    expect(publish).toHaveBeenCalledWith(auth, {
      type: 'warehouse',
      id: 'warehouse-1',
      change: 'created',
      reason: 'process-create'
    });
    create.mockRestore();
    publish.mockRestore();
  });

  it('dispatches a typed create effect through the registered typed handler', async () => {
    resetAppRegistryForTests();
    const bake = vi.spyOn(cassettesService, 'createDesignFromTemplate').mockResolvedValue({ _id: 'design-1' });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: {}
    };

    const result = await performDurableEffect({
      kind: 'effect.createEntity',
      record: {
        id: 'n2',
        entityType: 'cassette_design',
        construction: {
          mode: 'bakeCassetteDesignFromTemplate',
          inputs: [{ id: 'templateId', path: 'templateId', type: 'entity' }]
        },
        blocks: [],
        inputs: [],
        outputs: []
      },
      inputs: { templateId: 'cassette-1' }
    }, auth, {});

    expect(result._id).toBe('design-1');
    expect(bake).toHaveBeenCalledTimes(1);
    expect(bake.mock.calls[0][0]).toBe('cassette-1');
    expect(bake.mock.calls[0][1]).toBe(undefined);
    bake.mockRestore();
  });

  it('does not author an internal service.create without a construction contract', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const service = registry.getEntityService('machine');

    expect(typeof service.create).toBe('function');
    expect(getEntityConstruction('machine')).toBeNull();
    expect(service.processCapabilities.create).toBe(false);
    expect(service.processCapabilities.createModes).toEqual([]);
  });

  it('registers cassette-design typed creation handlers for bake and import', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const service = registry.getEntityService('cassette_design');

    expect(service.processCapabilities.create).toBe(true);
    expect(service.processCapabilities.createModes).toEqual([
      'bakeCassetteDesignFromTemplate',
      'importCassetteDesignFromArtifact'
    ]);
    expect(typeof service.constructionHandlers.bakeCassetteDesignFromTemplate).toBe('function');
    expect(typeof service.constructionHandlers.importCassetteDesignFromArtifact).toBe('function');
  });

  it('accepts a generic create for a contract-bearing entity', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const validation = validateProcessDefinition(
      createEffectDefinition('warehouse', 'genericCreate'),
      cncDomain,
      { roles: { admin: { id: 'admin', label: 'Admin' } }, capabilities: registryCapabilities(registry) }
    );

    expect(validation.errors, JSON.stringify(validation.errors)).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('rejects a create effect for an unsupported construction mode', () => {
    resetAppRegistryForTests();
    const registry = getAppRegistry();
    const validation = validateProcessDefinition(
      createEffectDefinition('warehouse', 'unsupportedCreate'),
      cncDomain,
      { roles: { admin: { id: 'admin', label: 'Admin' } }, capabilities: registryCapabilities(registry) }
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('unsupportedCreate');
  });

  it('resolves cassette_instance to no creation contract', () => {
    expect(getEntityConstruction('cassette_instance')).toBeNull();
    resetAppRegistryForTests();
    const service = getAppRegistry().getEntityService('cassette_instance');

    expect(service.processCapabilities.create).toBe(false);
    expect(service.processCapabilities.createModes).toEqual([]);
  });

  it('adapts process library reads to the feature service auth signature', async () => {
    const getById = vi.spyOn(librariesService, 'getById').mockResolvedValueOnce({ _id: 'library-1' });
    resetAppRegistryForTests();
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member',
      effectivePermissions: { libraries: [{ level: 'read' }] }
    };

    await getAppRegistry().getEntityService('library').processGetById('library-1', auth);

    expect(getById).toHaveBeenCalledWith('library-1', 'user-1', 'org-1', 'member', auth);
  });
});
