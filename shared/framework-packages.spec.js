import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('Framework package contracts', () => {
  it('registers entity definitions in @cutkit/core', async () => {
    const {
      BaseEntity,
      createEntityRef,
      createServiceActionResult,
      defineEntity,
      defineServiceAction,
      defineServiceContract,
      getEntityDefinition,
      getServiceActionDefinition,
      getServiceContract,
      listEntityDefinitions,
      listServiceActionDefinitions,
      listServiceContracts,
      registerServiceActionHandler,
      getServiceActionHandler,
      clearServiceActionHandlers
    } = await import('../packages/core/src/index.js');

    const definition = defineEntity({
      type: 'test_entity',
      collection: 'test_entities',
      blocks: ['identity', 'lineage', 'status']
    });
    const entity = new BaseEntity({
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });

    expect(definition.collection).toBe('test_entities');
    expect(getEntityDefinition('test_entity')).toEqual(definition);
    expect(listEntityDefinitions()).toContainEqual(definition);
    expect(entity.toJSON()).toMatchObject({
      _id: 'test-1',
      identity: { uid: 'test-1', name: 'Test Entity' },
      lineage: { organizationId: 'org-1' }
    });
    expect(entity.toJSON()).not.toHaveProperty('id');
    expect(entity.toJSON()).not.toHaveProperty('name');

    const contract = defineServiceContract({
      service: 'test',
      actions: ['runTest'],
      triggers: ['test.requested']
    });
    const action = defineServiceAction({
      id: 'runTest',
      service: 'test',
      action: 'run',
      input: { entities: [{ name: 'target', type: 'test_entity', required: true }] },
      triggers: [{ event: 'test.requested' }],
      access: { permissions: [{ feature: 'test_entities', level: 'write' }] }
    });
    const handler = async () => createServiceActionResult({
      actionId: 'runTest',
      entities: [createEntityRef('test_entity', 'test-1')]
    });
    registerServiceActionHandler('runTest', handler);
    expect(getServiceContract('test')).toEqual(contract);
    expect(listServiceContracts()).toContainEqual(contract);
    expect(getServiceActionDefinition('runTest')).toEqual(action);
    expect(listServiceActionDefinitions()).toContainEqual(action);
    expect(getServiceActionHandler('runTest')).toBe(handler);
    await expect(handler()).resolves.toMatchObject({
      actionId: 'runTest',
      entities: [{ type: 'test_entity', id: 'test-1' }]
    });
    clearServiceActionHandlers();
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
    const { cncEntities, cncWorkflows, cncFrontendEntities, cncServiceActions } = await import('../packages/domain-cnc/src/index.js');
    const { createEndpointMap, getSingleEndpoint, getListEndpoint } = await import('../packages/vue/src/index.js');
    const { createReadOnlyToolHandlers } = await import('../packages/mcp/src/index.js');
    const { createFrameworkManifest, queryDocs, summarizeRoutes, summarizeSummaries, validateUiPrimitives } = await import('../packages/devtools/src/index.js');
    const manifest = createFrameworkManifest({
      packages: [{ name: '@cutkit/core' }],
      entities: cncEntities,
      frontendEntities: cncFrontendEntities,
      workflows: cncWorkflows,
      serviceActions: cncServiceActions,
      summaries: [],
      designSystem: {
        contracts: [],
        primitives: [{
          key: 'EntityCard',
          kind: 'entity-chrome',
          componentPath: 'components/shared/EntityCard.vue',
          purpose: 'Card chrome',
          docs: ['components/shared/README.md']
        }],
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
      listServiceActions: () => manifest.serviceActions,
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
    expect(cncServiceActions.solveNesting).toMatchObject({
      service: 'nesting',
      action: 'solve',
      access: { permissions: expect.arrayContaining([expect.objectContaining({ feature: 'queues', level: 'write' })]) }
    });
    expect(cncServiceActions.generateArtifact).toMatchObject({
      service: 'artifacts',
      action: 'generate',
      access: { permissions: [expect.objectContaining({ feature: 'artifacts', level: 'write' })] }
    });
    expect(cncWorkflows.queue.transitions.every(transition => !transition.roles)).toBe(true);
    const endpointMap = createEndpointMap(cncFrontendEntities);
    expect(getSingleEndpoint(endpointMap, 'project', 'p-1')).toBe('/api/project/p-1');
    expect(getListEndpoint(endpointMap, 'cassetteInstance', { 'lineage.queueId': 'q-1' })).toBe('/api/cassette-instances?lineage.queueId=q-1');
    await expect(handlers.list_entities()).resolves.toContainEqual(expect.objectContaining({ type: 'project' }));
    await expect(handlers.get_entity_schema({ type: 'queue' })).resolves.toMatchObject({ collection: 'queues' });
    await expect(handlers.list_routes()).resolves.toContainEqual(expect.objectContaining({ type: 'project', single: '/api/project/:id' }));
    await expect(handlers.list_service_actions()).resolves.toContainEqual(expect.objectContaining({ id: 'solveNesting' }));
    await expect(handlers.list_service_actions()).resolves.toContainEqual(expect.objectContaining({ id: 'generateArtifact' }));
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

  it('keeps the committed framework manifest synchronized with source metadata', () => {
    const result = spawnSync(process.execPath, ['scripts/framework-inspect.js', 'manifest'], { encoding: 'utf8' });
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

    const docsResult = spawnSync(process.execPath, ['scripts/framework-inspect.js', 'query-docs', 'EntityPage'], { encoding: 'utf8' });
    expect(docsResult.status).toBe(0);
    expect(JSON.parse(docsResult.stdout)).toContainEqual(expect.objectContaining({
      path: 'components/shared/README.md'
    }));
  });
});
