import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('Framework package contracts', () => {
  it('registers entity definitions in @cutkit/core', async () => {
    const { defineEntity, getEntityDefinition, listEntityDefinitions, BaseEntity } = await import('../packages/core/src/index.js');

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
      id: 'test-1',
      name: 'Test Entity',
      lineage: { organizationId: 'org-1' }
    });
  });

  it('validates workflow transitions in @cutkit/workflows', async () => {
    const { defineWorkflow, getWorkflow, validateTransition } = await import('../packages/workflows/src/index.js');

    const workflow = defineWorkflow('test_entity', {
      initial: 'DRAFT',
      states: { DRAFT: { canUpdateMeta: true }, ACTIVE: {}, CLOSED: { isTerminal: true } },
      transitions: [
        { from: 'DRAFT', to: 'ACTIVE', roles: ['EDITOR'] },
        { from: 'ACTIVE', to: 'CLOSED', roles: ['ADMIN'] }
      ]
    });

    expect(getWorkflow('test_entity')).toEqual(workflow);
    expect(validateTransition({ workflow, currentState: 'DRAFT', targetState: 'ACTIVE', role: 'EDITOR' }).ok).toBe(true);
    expect(validateTransition({ workflow, currentState: 'DRAFT', targetState: 'CLOSED', role: 'EDITOR' }).reason).toBe('invalid_transition');
    expect(validateTransition({ workflow, currentState: 'ACTIVE', targetState: 'CLOSED', role: 'EDITOR' }).reason).toBe('role_denied');
  });

  it('exposes CNC domain definitions and read-only MCP handlers', async () => {
    const { cncEntities, cncWorkflows, cncFrontendEntities } = await import('../packages/domain-cnc/src/index.js');
    const { createEndpointMap, getSingleEndpoint, getListEndpoint } = await import('../packages/vue/src/index.js');
    const { createReadOnlyToolHandlers } = await import('../packages/mcp/src/index.js');
    const { createFrameworkManifest, queryDocs, summarizeRoutes, summarizeSummaries } = await import('../packages/devtools/src/index.js');
    const manifest = createFrameworkManifest({
      packages: [{ name: '@cutkit/core' }],
      entities: cncEntities,
      frontendEntities: cncFrontendEntities,
      workflows: cncWorkflows,
      summaries: [],
      designSystem: {
        contracts: [],
        primitives: [{ key: 'EntityCard', kind: 'entity-chrome', componentPath: 'components/shared/EntityCard.vue', purpose: 'Card chrome' }],
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
    expect(cncWorkflows.queue.initial).toBe('DRAFT');
    const endpointMap = createEndpointMap(cncFrontendEntities);
    expect(getSingleEndpoint(endpointMap, 'project', 'p-1')).toBe('/api/project/p-1');
    expect(getListEndpoint(endpointMap, 'cassetteInstance', { 'lineage.queueId': 'q-1' })).toBe('/api/cassette-instances?lineage.queueId=q-1');
    await expect(handlers.list_entities()).resolves.toContainEqual(expect.objectContaining({ type: 'project' }));
    await expect(handlers.get_entity_schema({ type: 'queue' })).resolves.toMatchObject({ collection: 'queues' });
    await expect(handlers.list_routes()).resolves.toContainEqual(expect.objectContaining({ type: 'project', single: '/api/project/:id' }));
    await expect(handlers.list_ui_primitives()).resolves.toContainEqual(expect.objectContaining({ key: 'EntityCard', kind: 'entity-chrome' }));
    await expect(handlers.query_docs({ query: 'workflow' })).resolves.toContainEqual(expect.objectContaining({ path: 'README.md' }));
    await expect(handlers.get_framework_manifest()).resolves.toMatchObject({ schemaVersion: 1, validations: { ok: true } });
    await expect(handlers.validate_ui_contracts()).resolves.toEqual({ ok: true, issues: [] });
    await expect(handlers.validate_architecture()).resolves.toEqual({ ok: true });
  });

  it('keeps the committed framework manifest synchronized with source metadata', () => {
    const result = spawnSync(process.execPath, ['scripts/framework-inspect.js', 'manifest'], { encoding: 'utf8' });
    expect(result.status).toBe(0);

    const generated = JSON.parse(result.stdout);
    const committed = JSON.parse(readFileSync('framework.manifest.json', 'utf8'));
    expect(committed).toEqual(generated);
    expect(committed.validations).toEqual({ ok: true, issues: [] });
    expect(committed.designSystem.components.find(component => component.key === 'cassetteTemplate')?.fieldPaths).toEqual([
      'data.parameters.length',
      'data.type'
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
