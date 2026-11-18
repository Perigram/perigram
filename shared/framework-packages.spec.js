import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe('Framework package contracts', () => {
  it('keeps only the four contract packages named in SPEC §29', () => {
    const packageDirs = readdirSync('packages', { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    expect(packageDirs).toEqual(['core', 'cts', 'plugin-sdk', 'processes']);

    const packageNames = packageDirs.map(name =>
      JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8')).name
    ).sort();
    expect(packageNames).toEqual([
      '@perigram/core',
      '@perigram/cts',
      '@perigram/plugin-sdk',
      '@perigram/processes'
    ]);

    for (const name of packageDirs) {
      const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
      expect(manifest.exports?.['.'], name).toBe('./src/index.js');
    }

    const rootManifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(rootManifest.dependencies).toMatchObject({
      '@perigram/core': '0.1.0',
      '@perigram/cts': '0.1.0',
      '@perigram/plugin-sdk': '0.1.0',
      '@perigram/processes': '0.1.0'
    });

    expect(JSON.parse(readFileSync('packages/processes/package.json', 'utf8')).exports).toMatchObject({
      './authoring': './src/authoring.js',
      './designer': './src/designer.js',
      './node-catalog': './src/node-catalog.js',
      './screen-contract': './src/screen-contract.js',
      './types': './src/types.js',
      './ui-contract-projection': './src/ui-contract-projection.js'
    });
    expect(JSON.parse(readFileSync('packages/cts/package.json', 'utf8')).exports).toMatchObject({
      './pack/cnc': './src/pack/cnc.js',
      './pack/framework': './src/pack/framework.js'
    });
    expect(JSON.parse(readFileSync('packages/plugin-sdk/package.json', 'utf8')).exports)
      .toMatchObject({ './surface-check': './src/surface-check.js' });

    const processManifest = JSON.parse(readFileSync('packages/processes/package.json', 'utf8'));
    expect(processManifest.dependencies).toEqual({
      '@perigram/core': '0.1.0',
      '@perigram/cts': '0.1.0'
    });

    const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const lockPackages = Object.entries(lockfile.packages)
      .filter(([path, manifest]) => path.startsWith('packages/') && manifest.name)
      .map(([, manifest]) => manifest.name)
      .sort();
    expect(lockPackages).toEqual(packageNames);

    const frameworkManifest = JSON.parse(readFileSync('framework.manifest.json', 'utf8'));
    expect(frameworkManifest.packages.map(item => item.name).sort()).toEqual(packageNames);

    const inspector = readFileSync('scripts/framework-inspect.js', 'utf8');
    const declared = inspector.match(/const PACKAGE_NAMES = \[([\s\S]*?)\];/);
    expect(declared).not.toBeNull();
    expect([...declared[1].matchAll(/'(@perigram\/[^']+)'/g)].map(match => match[1]).sort())
      .toEqual(packageNames);
  });

  it('resolves each contract package through its public export map', async () => {
    const modules = await Promise.all([
      import('@perigram/cts'),
      import('@perigram/core'),
      import('@perigram/plugin-sdk'),
      import('@perigram/processes'),
      import('@perigram/processes/authoring'),
      import('@perigram/processes/designer'),
      import('@perigram/processes/node-catalog'),
      import('@perigram/processes/screen-contract'),
      import('@perigram/processes/types'),
      import('@perigram/processes/ui-contract-projection'),
      import('@perigram/cts/pack/cnc'),
      import('@perigram/cts/pack/framework'),
      import('@perigram/plugin-sdk/surface-check')
    ]);
    expect(modules).toHaveLength(13);
    expect(modules.every(module => module && typeof module === 'object')).toBe(true);
  });

  it('keeps the four-package dependency graph acyclic and one-way', () => {
    const packageDirs = ['cts', 'core', 'plugin-sdk', 'processes'];
    const graph = Object.fromEntries(packageDirs.map(name => [name, new Set()]));

    const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.isFile() && path.endsWith('.js') ? [path] : [];
    });

    for (const owner of packageDirs) {
      for (const file of walk(resolve('packages', owner, 'src'))) {
        const source = readFileSync(file, 'utf8');
        const specifiers = [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)]
          .map(match => match[1]);

        for (const specifier of specifiers) {
          let target = null;
          if (specifier.startsWith('@perigram/')) {
            target = specifier.slice('@perigram/'.length).split('/')[0];
          } else if (specifier.startsWith('#packages/')) {
            target = specifier.slice('#packages/'.length).split('/')[0];
          } else if (specifier.startsWith('.')) {
            const resolved = resolve(dirname(file), specifier);
            target = resolved.match(/[/\\]packages[/\\]([^/\\]+)[/\\]/)?.[1] || null;
          }
          if (target && target !== owner && graph[owner]) graph[owner].add(target);
        }
      }
    }

    expect(Object.fromEntries(Object.entries(graph).map(([name, targets]) => [name, [...targets].sort()])))
      .toEqual({
        cts: [],
        core: [],
        'plugin-sdk': [],
        processes: ['core', 'cts']
      });
  });

  it('keeps application imports on public package exports, not source paths', () => {
    const result = spawnSync(process.execPath, ['scripts/report-package-consumers.js'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.imports.filter(item => item.kind !== 'package-name')).toEqual([]);
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
    } = await import('@perigram/core');

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

  it('validates workflow transitions in @perigram/core', async () => {
    const { normalizeWorkflow, validateTransition } = await import('@perigram/core');

    const workflow = normalizeWorkflow({
      initial: 'DRAFT',
      states: { DRAFT: { canUpdateMeta: true }, ACTIVE: {}, CLOSED: { isTerminal: true } },
      transitions: [
        { from: 'DRAFT', to: 'ACTIVE', access: { permissions: [{ feature: 'test_entities', level: 'write' }] } },
        { from: 'ACTIVE', to: 'CLOSED', access: { permissions: [{ feature: 'test_entities', level: 'admin' }] } }
      ]
    });

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
    const { createTypeRegistry, frameworkTypes, projectDomainFromView } = await import('@perigram/cts');
    const techDrawingListing = (await import('../workers/tech-drawing/listing.json', { with: { type: 'json' } })).default;
    const techDrawingTypes = techDrawingListing.declarations.types;
    const { createReadOnlyToolHandlers } = await import('../scripts/mcp-handlers.js');
    const { createFrameworkManifest, summarizeRoutes, summarizeSummaries, validateUiPrimitives } = await import('../scripts/framework-inspect-lib.js');

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
    expect(facadeServices.map(service => service.id)).toContain('plugin.facade.bake');
    expect(facadeServices.map(service => service.id)).not.toContain('plugin.facade.nesting-solve');
    expect(nestingListing.declarations.services.map(service => service.id)).toContain('nesting-solve');
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