import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('Framework package contracts', () => {
  it('registers entity definitions in @cutkit/core', async () => {
    const {
      BaseEntity,
      createRegistry,
      createEntityRef,
      createCommandResult,
      createTaskResult
    } = await import('../packages/core/src/index.js');

    const registry = createRegistry({ id: 'test' });
    const definition = registry.defineEntity({
      type: 'test_entity',
      collection: 'test_entities',
      blocks: ['identity', 'lineage', 'status']
    });
    const entity = new BaseEntity({
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });

    expect(definition.collection).toBe('test_entities');
    expect(registry.getEntityDefinition('test_entity')).toEqual(definition);
    expect(registry.listEntityDefinitions()).toContainEqual(definition);
    expect(entity.toJSON()).toMatchObject({
      _id: 'test-1',
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });
    expect(entity.toJSON()).not.toHaveProperty('id');
    expect(entity.toJSON()).not.toHaveProperty('name');

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
    const attachmentKind = registry.defineAttachmentKind({
      kind: 'TEST_REPORT',
      bucket: 'reports',
      mimeType: 'application/pdf'
    });
    const domain = registry.defineDomain({
      id: 'test-domain',
      entities: [{ type: 'domain_entity', collection: 'domain_entities' }],
      tasks: {},
      attachmentKinds: {}
    });
    const handler = async () => createCommandResult({
      commandId: 'runTest',
      entities: [createEntityRef('test_entity', 'test-1')]
    });
    registry.registerCommandHandler('runTest', handler);
    expect(registry.getCommandDefinition('runTest')).toEqual(command);
    expect(registry.listCommandDefinitions()).toContainEqual(command);
    expect(registry.getTaskDefinition('test.task')).toEqual(task);
    expect(registry.listTaskDefinitions()).toContainEqual(task);
    expect(registry.getAttachmentKindDefinition('TEST_REPORT')).toEqual(attachmentKind);
    expect(registry.listAttachmentKindDefinitions()).toContainEqual(attachmentKind);
    expect(registry.getDomain('test-domain')).toEqual(domain);
    expect(registry.listDomains()).toContainEqual(domain);
    expect(registry.getCommandHandler('runTest')).toBe(handler);
    await expect(handler()).resolves.toMatchObject({
      commandId: 'runTest',
      entities: [{ type: 'test_entity', id: 'test-1' }]
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
    isolated.registerEntityService('isolated_entity', { getById: async () => null });
    isolated.registerCommandHandler('isolatedAction', async () => ({ ok: true }));
    isolated.registerHookHandler('isolatedHook', async () => null);
    expect(isolated.getDomain('isolated-domain')).toMatchObject({ id: 'isolated-domain' });
    expect(isolated.getCommandDefinition('isolatedAction')).toMatchObject({ service: 'isolated' });
    expect(isolated.getTaskDefinition('isolated.task')).toMatchObject({ service: 'isolated' });
    expect(isolated.getEntityService('isolated_entity')).toBeTruthy();
    expect(isolated.getCommandHandler('isolatedAction')).toBeTruthy();
    expect(isolated.getHookHandler('isolatedHook')).toBeTruthy();
  });

  it('validates workflow transitions in @cutkit/workflows', async () => {
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

  it('exposes CNC domain definitions and read-only MCP handlers', async () => {
    const {
      cncAttachmentKinds,
      cncDesignSystem,
      cncDesignSystemEntityContracts,
      cncDomain,
      cncEntities,
      cncFrontendEntities,
      cncCommands,
      cncTasks,
      cncWorkflows
    } = await import('../packages/domain-cnc/src/index.js');
    const { createDomainUiAdapter, createEndpointMap, getSingleEndpoint, getListEndpoint } = await import('../packages/vue/src/index.js');
    const { createReadOnlyToolHandlers } = await import('../packages/mcp/src/index.js');
    const { createFrameworkManifest, queryDocs, summarizeRoutes, summarizeSummaries, validateUiPrimitives } = await import('../packages/devtools/src/index.js');
    const manifest = createFrameworkManifest({
      packages: [{ name: '@cutkit/core' }],
      entities: cncEntities,
      frontendEntities: cncFrontendEntities,
      workflows: cncWorkflows,
      commands: cncCommands,
      tasks: cncTasks,
      attachmentKinds: cncAttachmentKinds,
      summaries: [],
      designSystem: {
        contracts: cncDesignSystem.contracts,
        primitives: cncDesignSystem.primitives,
        variants: cncDesignSystem.variants,
        groups: cncDesignSystem.groups,
        componentInventory: {},
        tokens: {}
      },
      dataModelFields: []
    });

    const handlers = createReadOnlyToolHandlers({
      listEntities: () => cncEntities,
      getEntity: type => cncEntities.find(entity => entity.type === type),
      getWorkflow: type => cncWorkflows[type],
      getFrameworkManifest: () => manifest,
      listRoutes: () => summarizeRoutes(cncFrontendEntities),
      listSummaries: () => summarizeSummaries([]),
      listCommands: () => manifest.commands,
      listUiComponents: () => manifest.designSystem.components,
      listUiPrimitives: () => manifest.designSystem.primitives,
      listDesignTokens: () => manifest.designSystem.tokens,
      listRelationships: () => manifest.relationships,
      validateUiContracts: () => manifest.validations,
      queryDocs: query => queryDocs([{ path: 'README.md', content: 'Workflow framework documentation' }], query),
      validateArchitecture: () => ({ ok: true }),
      validateTransition: () => ({ ok: true })
    });

    expect(cncEntities.find(entity => entity.type === 'queue')?.collection).toBe('queues');
    expect(cncEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'layer_standard', collection: 'layer_standards' }),
      expect.objectContaining({ type: 'material', collection: 'materials' }),
      expect.objectContaining({ type: 'pen_template', collection: 'pen_templates' }),
      expect.objectContaining({ type: 'tool_profile', collection: 'tool_profiles' })
    ]));
    expect(cncWorkflows.queue.initial).toBe('DRAFT');
    expect(cncCommands.solveNesting).toMatchObject({
      service: 'nesting',
      action: 'solve',
      output: { tasks: ['nesting.solve'] },
      access: { permissions: expect.arrayContaining([expect.objectContaining({ feature: 'queues', level: 'write' })]) }
    });
    expect(cncCommands.saveCassetteTemplate).toMatchObject({
      service: 'cassettes',
      action: 'saveTemplate',
      output: { entities: ['cassette'] }
    });
    expect(cncCommands.generateAttachment).toMatchObject({
      service: 'artifacts',
      action: 'generate',
      access: { permissions: [expect.objectContaining({ feature: 'artifacts', level: 'write' })] }
    });
    expect(cncWorkflows.queue.transitions.every(transition => !transition.roles)).toBe(true);
    expect(cncDomain).toMatchObject({ id: 'cnc', commands: cncCommands, tasks: cncTasks, attachmentKinds: cncAttachmentKinds });
    expect(cncDomain.ui.designSystem).toBe(cncDesignSystem);
    expect(cncDesignSystemEntityContracts).toContainEqual(expect.objectContaining({ key: 'cassette', entityType: 'cassette' }));
    expect(cncTasks.nestingSolve).toMatchObject({ id: 'nesting.solve', service: 'nesting' });
    expect(cncTasks.nestingSolve.output.entities).toEqual(['nesting_run', 'sheet_design']);
    expect(cncTasks.nestingSolve.output).not.toHaveProperty('attachments');
    expect(cncAttachmentKinds.LAYOUT_DXF).toMatchObject({ bucket: 'nestDxf', preview: { mode: 'dxf' } });
    const endpointMap = createEndpointMap(cncFrontendEntities);
    const domainUi = createDomainUiAdapter(cncDomain);
    expect(getSingleEndpoint(endpointMap, 'project', 'p-1')).toBe('/api/project/p-1');
    expect(getListEndpoint(endpointMap, 'cassetteInstance', { 'lineage.queueId': 'q-1' })).toBe('/api/cassette-instances?lineage.queueId=q-1');
    expect(domainUi.getSingleEndpoint('project', 'p-1')).toBe('/api/project/p-1');
    expect(domainUi.getAttachmentPreview('LAYOUT_DXF')).toEqual({ mode: 'dxf' });
    expect(domainUi.getDownloadEndpoint('artifact', 'a-1')).toBe('/api/artifacts/a-1');
    await expect(handlers.list_entities()).resolves.toContainEqual(expect.objectContaining({ type: 'project' }));
    await expect(handlers.get_entity_schema({ type: 'queue' })).resolves.toMatchObject({ collection: 'queues' });
    await expect(handlers.list_routes()).resolves.toContainEqual(expect.objectContaining({ type: 'project', single: '/api/project/:id' }));
    await expect(handlers.list_commands()).resolves.toContainEqual(expect.objectContaining({ id: 'solveNesting' }));
    await expect(handlers.list_commands()).resolves.toContainEqual(expect.objectContaining({ id: 'saveCassetteTemplate' }));
    await expect(handlers.list_commands()).resolves.toContainEqual(expect.objectContaining({ id: 'generateAttachment' }));
    await expect(handlers.list_ui_primitives()).resolves.toContainEqual(expect.objectContaining({ key: 'EntityCard', kind: 'entity-chrome' }));
    await expect(handlers.query_docs({ query: 'workflow' })).resolves.toContainEqual(expect.objectContaining({ path: 'README.md' }));
    await expect(handlers.get_framework_manifest()).resolves.toMatchObject({ schemaVersion: 1, validations: { ok: true } });
    await expect(handlers.validate_ui_contracts()).resolves.toEqual({ ok: true, issues: [] });
    await expect(handlers.validate_architecture()).resolves.toEqual({ ok: true });
    expect(validateUiPrimitives(manifest.designSystem.primitives)).toEqual([]);
    expect(validateUiPrimitives([{ key: 'BrokenPrimitive' }])).toContainEqual(expect.objectContaining({
      key: 'BrokenPrimitive',
      issue: 'missing kind'
    }));
  });

  it('keeps the command runtime domain-agnostic', () => {
    const source = readFileSync('server/core/commands/service.js', 'utf8');
    expect(source).not.toContain('@cutkit/domain-cnc');
    expect(source).not.toMatch(/features\/.*\/operations/);
    const composition = readFileSync('server/runtime/app-registry.js', 'utf8');
    expect(composition).toContain('cncDomain');
    expect(composition).toContain('saveCassetteTemplate');
  });

  it('keeps the committed framework manifest synchronized with source metadata', () => {
    const result = spawnSync( process.execPath, ['scripts/framework-inspect.js', 'manifest'], { encoding: 'utf8' });
    expect(result.status).toBe(0);

    const generated = JSON.parse(result.stdout);
    const committed = JSON.parse(readFileSync('framework.manifest.json', 'utf8'));
    expect(committed).toEqual(generated);
    expect(committed.validations).toEqual({ ok: true, issues: [] });
    expect(committed.designSystem.components.find(component => component.key === 'cassetteTemplate')?.fieldPaths).toEqual([
      'data.parameters.length'
    ]);
    expect(committed.designSystem.primitives).toContainEqual(expect.objectContaining({
      key: 'EntityPage',
      componentPath: 'components/shared/EntityPage.vue'
    }));

    const docsResult = spawnSync( process.execPath, ['scripts/framework-inspect.js', 'query-docs', 'EntityPage'], { encoding: 'utf8' });
    expect(docsResult.status).toBe(0);
    expect(JSON.parse(docsResult.stdout)).toContainEqual(expect.objectContaining({
      path: 'components/shared/README.md'
    }));
  });
});
