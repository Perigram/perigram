import { describe, it, expect } from 'vitest';

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

    const handlers = createReadOnlyToolHandlers({
      listEntities: () => cncEntities,
      getEntity: type => cncEntities.find(entity => entity.type === type),
      getWorkflow: type => cncWorkflows[type],
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
    await expect(handlers.validate_architecture()).resolves.toEqual({ ok: true });
  });
});
