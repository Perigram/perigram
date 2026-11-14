import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('Framework package contracts', () => {
  it('keeps package exports, aliases, and manifest inventory in sync', () => {
    const packageNames = readdirSync('packages', { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => JSON.parse(readFileSync(`packages/${entry.name}/package.json`, 'utf8')).name)
      .sort();

    const aliasNames = file => {
      const source = readFileSync(file, 'utf8');
      const block = source.match(/const perigramAliases = \{([\s\S]*?)\};/);
      expect(block, file).not.toBeNull();
      return [...block[1].matchAll(/['"](@perigram\/[^'"]+)['"]\s*:/g)]
        .map(match => match[1])
        .sort();
    };

    for (const file of ['nuxt.config.js', 'vitest.config.js', 'vitest.ssr.config.js']) {
      expect(aliasNames(file), file).toEqual(packageNames);
    }

    const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
    expect(Object.keys(tsconfig.compilerOptions.paths).filter(name => name.startsWith('@perigram/')).sort())
      .toEqual(packageNames);

    const manifest = JSON.parse(readFileSync('framework.manifest.json', 'utf8'));
    expect(manifest.packages.map(item => item.name).sort()).toEqual(packageNames);

    const inspect = readFileSync('scripts/framework-inspect.js', 'utf8');
    const packageList = inspect.match(/const PACKAGE_NAMES = \[([\s\S]*?)\];/);
    expect(packageList).not.toBeNull();
    expect([...packageList[1].matchAll(/'(@perigram\/[^']+)'/g)].map(match => match[1]).sort())
      .toEqual(packageNames);
  });

  it('registers entity definitions in @perigram/core', async () => {
    const {
      BaseEntity,
      CANONICAL_BLOCK_SCHEMAS,
      CANONICAL_ENTITY_BLOCKS,
      createRegistry,
      createInstanceRef,
      createProvenance,
      createCommandResult,
      createTaskResult
    } = await import('../packages/core/src/index.js');

    const registry = createRegistry({ id: 'test' });
    const entity = new BaseEntity({
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });

    expect(entity.toJSON()).toMatchObject({
      _id: 'test-1',
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });
    expect(entity.toJSON()).not.toHaveProperty('id');
    expect(entity.toJSON()).not.toHaveProperty('name');
    expect(CANONICAL_ENTITY_BLOCKS).toEqual([
      'identity',
      'origin',
      'status',
      'lineage',
      'relations',
      'provenance',
      'specs',
      'attachments',
      'data',
      'summary'
    ]);
    expect(CANONICAL_BLOCK_SCHEMAS.lineage.map(field => field.path)).toEqual(['lineage']);
    expect(CANONICAL_BLOCK_SCHEMAS.identity.map(field => field.path)).toContain('identity.name');
    expect(CANONICAL_BLOCK_SCHEMAS.specs.map(field => field.path)).toEqual(['specs']);

    const command = registry.defineCommand({
      id: 'runTest',
      service: 'test',
      action: 'run',
      input: { entities: [{ name: 'target', type: 'test_entity', required: true }] },
      triggers: [{ event: 'test.requested' }],
      access: { permissions: [{ feature: 'test_entities', level: 'write' }] }
    });
    const task = registry.defineTask({
      id: 'test.task',
      service: 'test',
      executor: { type: 'server', handler: 'test.task' },
      input: { entities: [{ name: 'target', type: 'test_entity', required: true }] },
      output: { entities: ['test_entity'] }
    });
    const domain = registry.defineDomain({
      id: 'test-domain',
      tasks: {}
    });
    const handler = async () => createCommandResult({
      commandId: 'runTest',
      entities: [createInstanceRef('test_entity', 'test-1')]
    });
    registry.registerCommandHandler('runTest', handler);
    expect(registry.getCommandDefinition('runTest')).toEqual(command);
    expect(registry.listCommandDefinitions()).toContainEqual(command);
    expect(registry.getTaskDefinition('test.task')).toEqual(task);
    expect(registry.listTaskDefinitions()).toContainEqual(task);
    expect(registry.getDomain('test-domain')).toEqual(domain);
    expect(registry.listDomains()).toContainEqual(domain);
    expect(registry.getCommandHandler('runTest')).toBe(handler);
    await expect(handler()).resolves.toMatchObject({
      commandId: 'runTest',
      entities: [{ type: 'test_entity', id: 'test-1' }]
    });
    expect(createInstanceRef('test_entity', 'test-1', 'revision-2')).toEqual({
      type: 'test_entity',
      id: 'test-1',
      revisionId: 'revision-2'
    });
    expect(createProvenance(createInstanceRef('test_entity', 'test-1', 'revision-2'), { scope: 'geometry' })).toEqual({
      source: { type: 'test_entity', id: 'test-1', revisionId: 'revision-2' },
      scope: 'geometry'
    });
    expect(new BaseEntity({
      identity: { uid: 'derived-1', name: 'Derived' },
      relations: {
        library: { type: 'library', id: 'library-1' },
        invalid: { typeId: 'library', instanceId: 'legacy-library' }
      },
      provenance: {
        derivedFrom: {
          source: { type: 'test_entity', id: 'test-1', revisionId: 'revision-2' },
          scope: 'geometry'
        }
      }
    }).toJSON()).toMatchObject({
      relations: { library: { type: 'library', id: 'library-1' } },
      provenance: {
        derivedFrom: {
          source: { type: 'test_entity', id: 'test-1', revisionId: 'revision-2' },
          scope: 'geometry'
        }
      }
    });
    expect(createTaskResult({ taskId: 'test.task' })).toMatchObject({ taskId: 'test.task', ok: true });

    const isolated = createRegistry({ id: 'isolated-test' });
    isolated.defineDomain({
      id: 'isolated-domain',
      entities: [{ type: 'isolated_entity', collection: 'isolated_entities' }],
      commands: {
        isolatedAction: { id: 'isolatedAction', service: 'isolated', action: 'run' }
      },
      tasks: {
        isolatedTask: { id: 'isolated.task', service: 'isolated', executor: { type: 'server', handler: 'isolated.task' } }
      }
    });
    isolated.registerInstanceService('isolated_entity', { getById: async () => null });
    isolated.registerCommandHandler('isolatedAction', async () => ({ ok: true }));
    isolated.registerHookHandler('isolatedHook', async () => null);
    expect(isolated.getDomain('isolated-domain')).toMatchObject({ id: 'isolated-domain' });
    expect(isolated.getCommandDefinition('isolatedAction')).toMatchObject({ service: 'isolated' });
    expect(isolated.getTaskDefinition('isolated.task')).toMatchObject({ service: 'isolated' });
    expect(isolated.getInstanceService('isolated_entity')).toBeTruthy();
    expect(isolated.getCommandHandler('isolatedAction')).toBeTruthy();
    expect(isolated.getHookHandler('isolatedHook')).toBeTruthy();
  });

  it('validates workflow transitions in @perigram/workflows', async () => {
    const { defineWorkflow, getWorkflow, validateTransition } = await import('../packages/workflows/src/index.js');

    const workflow = defineWorkflow('test_entity', {
      initial: 'DRAFT',
      states: { DRAFT: { canUpdateMeta: true }, ACTIVE: {}, CLOSED: { isTerminal: true } },
      transitions: [
        { from: 'DRAFT', to: 'ACTIVE', access: { permissions: [{ feature: 'test_entities', level: 'write' }] } },
        { from: 'ACTIVE', to: 'CLOSED', access: { permissions: [{ feature: 'test_entities', level: 'admin' }] } }
      ]
    });

    expect(getWorkflow('test_entity')).toEqual(workflow);
    expect(validateTransition({ workflow, currentState: 'DRAFT', targetState: 'ACTIVE', role: 'VIEWER' }).ok).toBe(true);
    expect(validateTransition({ workflow, currentState: 'DRAFT', targetState: 'CLOSED', role: 'VIEWER' }).reason).toBe('invalid_transition');
    expect(validateTransition({ workflow, currentState: 'ACTIVE', targetState: 'CLOSED', role: 'VIEWER' }).ok).toBe(true);
  });

  it('exposes the facade plugin listing and read-only MCP handlers', async () => {
    const { facadeFileTypes, facadeServices } = await import('../test-tools/facade-plugin.js');
    const {
      DESIGN_SYSTEM_ENTITY_CONTRACTS,
      DESIGN_SYSTEM_PRIMITIVES,
      DESIGN_SYSTEM_VARIANTS,
      DESIGN_SYSTEM_GROUPS
    } = await import('../utils/design-system-contract.js');
    const { createTypeRegistry, frameworkTypes, projectDomainFromView } = await import('../packages/cts/src/index.js');
    const techDrawingListing = (await import('../workers/tech-drawing/listing.json', { with: { type: 'json' } })).default;
    const techDrawingTypes = techDrawingListing.declarations.types;
    const { createReadOnlyToolHandlers } = await import('../packages/mcp/src/index.js');
    const { createFrameworkManifest, summarizeRoutes, summarizeSummaries, validateUiPrimitives } = await import('../packages/devtools/src/index.js');

    // The registry view is the domain catalog (one source): entities and
    // workflows project from the mounted declarations.
    const registry = createTypeRegistry({ id: 'framework-packages-view' });
    for (const declaration of [...frameworkTypes, ...techDrawingTypes, ...facadeFileTypes]) registry.defineType(declaration);
    const projected = projectDomainFromView(registry, null);
    const entities = projected.entities;
    const workflows = projected.workflows || {};
    const endpoints = entities.map(entity => ({ type: entity.type, path: `/api/instances/${entity.collection}` }));

    const manifest = createFrameworkManifest({
      packages: [{ name: '@perigram/core' }],
      entities,
      frontendEntities: endpoints,
      workflows,
      commands: facadeServices,
      tasks: [],
      attachmentKinds: projected.attachmentKinds,
      summaries: [],
      designSystem: {
        contracts: DESIGN_SYSTEM_ENTITY_CONTRACTS,
        primitives: DESIGN_SYSTEM_PRIMITIVES,
        variants: DESIGN_SYSTEM_VARIANTS,
        groups: DESIGN_SYSTEM_GROUPS,
        componentInventory: {},
        tokens: {}
      },
      dataModelFields: []
    });

    const handlers = createReadOnlyToolHandlers({
      listEntities: () => entities,
      getEntity: type => entities.find(entity => entity.type === type),
      getWorkflow: type => workflows[type],
      getFrameworkManifest: () => manifest,
      listRoutes: () => summarizeRoutes(endpoints),
      listSummaries: () => summarizeSummaries([]),
      listCommands: () => manifest.commands,
      listUiComponents: () => manifest.designSystem.components,
      listUiPrimitives: () => manifest.designSystem.primitives,
      listDesignTokens: () => manifest.designSystem.tokens,
      listRelationships: () => manifest.relationships,
      validateUiContracts: () => manifest.validations
    });

    expect(typeof handlers.list_entities).toBe('function');
    expect(entities.length).toBeGreaterThan(5);
    expect(facadeServices.map(service => service.id)).toEqual(expect.arrayContaining([
      'plugin.facade.nesting-solve',
      'plugin.facade.bake'
    ]));
    expect(typeof handlers.get_entity_schema).toBe('function');
  });


  it('keeps the command runtime domain-agnostic', () => {
    const source = readFileSync('server/core/commands/service.js', 'utf8');
    expect(source).not.toContain('@perigram/domain-cnc');
    expect(source).not.toMatch(/features\/.*\/operations/);
    // The facade domain is no pack import: its declarations live in the
    // plugin listing and its compute in the external executor — the
    // registry mounts only the documents pack beside framework services.
    const composition = readFileSync('server/runtime/app-registry.js', 'utf8');
    expect(composition).not.toContain('cncDomain');
    expect(composition).not.toContain('facadePack');
    expect(composition).toContain('generateAttachment');
  });

  it('keeps the committed framework manifest synchronized with source metadata', () => {
    const result = spawnSync( process.execPath, ['scripts/framework-inspect.js', 'manifest'], { encoding: 'utf8' });
    expect(result.status).toBe(0);

    const generated = JSON.parse(result.stdout);
    const committed = JSON.parse(readFileSync('framework.manifest.json', 'utf8'));
    expect(committed).toEqual(generated);
    expect(committed.validations).toEqual({ ok: true, issues: [] });
    // The legacy residual fact map died with the fact channel: no
    // design-system component carries legacy fact rows anymore.
    expect(committed.designSystem.primitives).toContainEqual(expect.objectContaining({
      key: 'InstanceCard',
      componentPath: 'components/shared/InstanceCard.vue'
    }));
    expect(committed.designSystem.primitives.map(primitive => primitive.key)).not.toContain('InstancePage');
  });
});