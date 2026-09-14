import { describe, expect, it, vi } from 'vitest';
import { advanceProcessRun, createProcessRun, previewProcessDataflow, resumeProcessRun, runProcessUntilSettled } from './orchestration.js';
import { isMissingField } from './missing-field.js';

function process(records, nodes, edges) {
  return {
    id: 'definition',
    dataflowVersion: 4,
    processNodes: Object.fromEntries(records.map(record => [record.id, record])),
    graph: { nodes: nodes.map(id => ({ id, type: 'processNode', data: { refId: id } })), edges }
  };
}

const control = (source, sourceHandle, target) => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  sourceHandle: `control:${sourceHandle}`,
  target,
  targetHandle: 'control:in',
  role: 'control'
});
const data = (source, target, targetHandle) => ({
  id: `${source}-${target}-${targetHandle}`,
  source,
  sourceHandle: 'data:value',
  target,
  targetHandle: `data:${targetHandle}`,
  role: 'data'
});
const catalogContext = record => ({
  fieldSchemas: record.block === 'identity'
    ? [{ path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } }]
    : []
});

describe('durable process orchestration', () => {
  it.each(['effect.createEntity', 'effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity', 'effect.deleteEntity'])(
    'routes %s through the shared mapped mutation boundary',
    async kind => {
      const inputId = kind === 'effect.createEntity' ? 'identity' : 'entity';
      const definition = process([
        { id: 'values', kind: 'source.literalList', value: kind === 'effect.createEntity'
          ? [{ name: 'One' }, { name: 'Two' }]
          : [{ type: 'project', id: 'p1' }, { type: 'project', id: 'p2' }] },
        { id: 'mutation', kind, entityType: 'project', trigger: { mode: 'manual' }, blocks: kind === 'effect.createEntity' ? ['identity'] : [] }
      ], ['values', 'mutation'], [data('values', 'mutation', inputId)]);
      const executeEffect = vi.fn(async ({ inputs }) => kind === 'effect.createEntity'
        ? { type: 'project', id: inputs.identity.name }
        : inputs.entity);

      const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
        executeEffect,
        catalogContext
      });

      expect(completed.status).toBe('succeeded');
      expect(executeEffect).toHaveBeenCalledTimes(2);
      expect(completed.steps[0].output).toEqual({ branches: [{ path: [], items: kind === 'effect.createEntity'
        ? [{ type: 'project', id: 'One' }, { type: 'project', id: 'Two' }]
        : [{ type: 'project', id: 'p1' }, { type: 'project', id: 'p2' }] }] });
    }
  );

  it('keeps the bare effect result and idempotency key for a single mapped item', async () => {
    const definition = process([
      { id: 'modify', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'manual' }, blocks: [] }
    ], ['modify'], []);
    const updated = { type: 'project', id: 'project-1', identity: { name: 'Renamed' } };
    const executeEffect = vi.fn().mockResolvedValue(updated);

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'modify' }, {
        context: { inputs: { entity: { type: 'project', id: 'project-1' } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledOnce();
    expect(executeEffect.mock.calls[0][0].idempotencyKey).toBe(completed.steps[0].idempotencyKey);
    expect(completed.steps[0].output).toEqual(updated);
  });

  it('completes a mapped mutation step with a failure-carrying output when a later item fails', async () => {
    const definition = process([
      { id: 'values', kind: 'source.literalList', value: [
        { type: 'project', id: 'p1' },
        { type: 'project', id: 'p2' },
        { type: 'project', id: 'p3' }
      ] },
      { id: 'mutation', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'manual' }, blocks: [] },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['values', 'mutation', 'stop'], [
      data('values', 'mutation', 'entity'),
      control('mutation', 'completed', 'stop')
    ]);
    const executeEffect = vi.fn(async ({ inputs }) => {
      if (inputs.entity.id === 'p2') throw new Error('write denied');
      return inputs.entity;
    });

    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect,
      catalogContext
    });

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledTimes(3);
    const step = completed.steps.find(item => item.nodeId === 'mutation');
    expect(step.status).toBe('succeeded');
    expect(step.output.failures).toEqual([{
      operation: 'effect.updateEntity',
      branchPath: [],
      itemIndex: 1,
      entityRef: { type: 'project', id: 'p2' },
      error: { name: 'Error', message: 'write denied' }
    }]);
    expect(step.output.completedMutations.map(item => item.entityRef.id)).toEqual(['p1', 'p3']);
    expect(step.output.result.branches[0].items[1]).toEqual(step.output.failures[0]);
    expect(completed.steps.some(item => item.nodeId === 'stop')).toBe(true);
  });

  it('fails the run before the first write on incompatible mutation inputs', async () => {
    const definition = process([
      { id: 'entities', kind: 'source.literalList', value: [
        { type: 'project', id: 'p1' },
        { type: 'project', id: 'p2' },
        { type: 'project', id: 'p3' }
      ] },
      { id: 'names', kind: 'source.literalList', value: [{ name: 'One' }, { name: 'Two' }] },
      { id: 'mutation', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'manual' }, blocks: ['identity'] }
    ], ['entities', 'names', 'mutation'], [
      data('entities', 'mutation', 'entity'),
      data('names', 'mutation', 'identity')
    ]);
    const executeEffect = vi.fn();

    const failed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect,
      catalogContext
    });

    expect(failed.status).toBe('failed');
    expect(failed.error.message).toContain('items must be scalar or aligned');
    expect(executeEffect).not.toHaveBeenCalled();
  });

  it('resolves a connected status definition at execution time', async () => {
    const definition = process([{
      id: 'update',
      kind: 'effect.updateEntity',
      entityType: 'project',
      trigger: { mode: 'manual' },
      fields: [],
      statusRef: 'ready'
    }], ['update'], [{
      id: 'ready-update',
      source: 'ready',
      sourceHandle: 'data:status',
      target: 'update',
      targetHandle: 'data:status.state.primary',
      role: 'data'
    }]);
    definition.statusDefinitions = {
      ready: { id: 'ready', statusId: 'READY', label: 'Ready' }
    };
    definition.graph.nodes.unshift({
      id: 'ready',
      type: 'statusDefinition',
      data: { refId: 'ready' }
    });
    const executeEffect = vi.fn().mockResolvedValue({ type: 'project', id: 'project-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'update' }, {
        context: { inputs: { entity: { type: 'project', id: 'project-1' } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: {
        entity: { type: 'project', id: 'project-1' },
        'status.state.primary': 'READY'
      }
    }));
  });

  it('starts a manual effect and feeds a deconstructed block into an automatic effect', async () => {
    const definition = process([
      {
        id: 'identity',
        kind: 'record.composeBlock',
        block: 'identity',
        fields: ['identity.name'],
        inputDefaults: { 'identity.name': 'Original' }
      },
      {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        blocks: ['identity']
      },
      {
        id: 'deconstruct',
        kind: 'record.deconstruct',
        entityType: 'project',
        blocks: ['identity']
      },
      {
        id: 'update',
        kind: 'effect.updateEntity',
        entityType: 'project',
        trigger: { mode: 'event' },
        blocks: ['identity']
      }
    ], ['identity', 'create', 'deconstruct', 'update'], [
      {
        id: 'identity-create',
        source: 'identity',
        sourceHandle: 'data:block',
        target: 'create',
        targetHandle: 'data:identity',
        role: 'data'
      },
      {
        id: 'created-deconstruct',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'deconstruct',
        targetHandle: 'data:entity',
        role: 'data'
      },
      {
        id: 'created-update',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'update',
        targetHandle: 'data:entity',
        role: 'data'
      },
      {
        id: 'identity-update',
        source: 'deconstruct',
        sourceHandle: 'data:identity',
        target: 'update',
        targetHandle: 'data:identity',
        role: 'data'
      },
      control('create', 'completed', 'update')
    ]);
    const executeEffect = vi.fn()
      .mockResolvedValueOnce({ type: 'project', id: 'project-1', identity: { name: 'Original' } })
      .mockResolvedValueOnce({ type: 'project', id: 'project-1', identity: { name: 'Original' } });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputs: {
        entity: { type: 'project', id: 'project-1', identity: { name: 'Original' } },
        identity: { name: 'Original' }
      }
    }));
  });

  it('branches, executes an effect once with an idempotency key, and stops', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'condition', kind: 'source.literalItem', value: true, type: { base: 'boolean', shape: 'item' } },
      { id: 'branch', kind: 'control.if' },
      { id: 'effect', kind: 'effect.runCommand', commandId: 'test' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'condition', 'branch', 'effect', 'stop'], [
      control('start', 'completed', 'branch'),
      data('condition', 'branch', 'condition'),
      control('branch', 'true', 'effect'),
      control('effect', 'completed', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledTimes(2);
    expect(executeEffect.mock.calls[1][0].idempotencyKey).toContain(completed.id);
  });

  it('terminates a failed effect without emitting completion', async () => {
    const definition = process([
      {
        id: 'start',
        kind: 'effect.runCommand',
        commandId: 'start',
        trigger: { mode: 'manual' }
      },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'stop'], [
      control('start', 'completed', 'stop')
    ]);
    const executeEffect = vi.fn().mockRejectedValue(new Error('command failed'));

    const failed = await runProcessUntilSettled(
      createProcessRun(definition, {}),
      definition,
      { executeEffect }
    );

    expect(failed.status).toBe('failed');
    expect(failed.error.message).toBe('command failed');
    expect(executeEffect).toHaveBeenCalledTimes(1);
    expect(failed.steps.some(step => step.nodeId === 'stop')).toBe(false);
  });

  it('keeps an externally dispatched effect waiting without emitting completion', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'stop'], [control('start', 'completed', 'stop')]);

    const waiting = await advanceProcessRun(createProcessRun(definition, {}), definition, {
      executeEffect: async () => ({ __processEffectPending: true, invocationId: 'invocation-1' })
    });

    expect(waiting.status).toBe('waiting');
    expect(waiting.pendingEffect).toEqual(expect.objectContaining({
      nodeId: 'start',
      invocationId: 'invocation-1'
    }));
    expect(waiting.steps[0]).toEqual(expect.objectContaining({
      status: 'waiting',
      invocationId: 'invocation-1',
      output: null
    }));
    expect(waiting.tokens).toEqual([]);
    expect(waiting.steps.some(step => step.nodeId === 'stop')).toBe(false);
  });

  it('resumes a waiting effect with its completion output and continues the run', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'stop'], [control('start', 'completed', 'stop')]);

    const waiting = await advanceProcessRun(createProcessRun(definition, {}), definition, {
      executeEffect: async () => ({ __processEffectPending: true, invocationId: 'invocation-1' })
    });
    expect(waiting.status).toBe('waiting');

    const resumed = await resumeProcessRun(waiting, definition, {
      invocationId: 'invocation-1',
      output: { entities: [{ type: 'sheet', id: 'sheet-1' }] }
    }, {
      catalogContext: () => ({
        command: { output: { entities: [{ type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }] } }
      })
    });

    expect(resumed.status).toBe('running');
    expect(resumed.pendingEffect).toBeUndefined();
    expect(resumed.steps[0]).toEqual(expect.objectContaining({
      status: 'succeeded',
      invocationId: 'invocation-1',
      output: { entities: [{ type: 'sheet', id: 'sheet-1' }] }
    }));
    expect(resumed.tokens).toHaveLength(1);
    expect(resumed.tokens[0].nodeId).toBe('stop');
    expect(resumed.tokens[0].values['start:sheet']).toBeTruthy();

    const finished = await runProcessUntilSettled(resumed, definition, {});
    expect(finished.status).toBe('succeeded');
  });

  it('leaves the waiting run unchanged for a different invocation completion', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } }
    ], ['start'], []);

    const waiting = await advanceProcessRun(createProcessRun(definition, {}), definition, {
      executeEffect: async () => ({ __processEffectPending: true, invocationId: 'invocation-1' })
    });

    const untouched = await resumeProcessRun(waiting, definition, {
      invocationId: 'invocation-other',
      output: { entities: [] }
    }, {});
    expect(untouched).toEqual(waiting);
  });

  it('waits for every fork branch at join-all', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'fork', kind: 'control.fork', branches: 2 },
      { id: 'left', kind: 'effect.runCommand', commandId: 'left' },
      { id: 'right', kind: 'effect.runCommand', commandId: 'right' },
      { id: 'join', kind: 'control.joinAll' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'fork', 'left', 'right', 'join', 'stop'], [
      control('start', 'completed', 'fork'),
      control('fork', 'branch1', 'left'),
      control('fork', 'branch2', 'right'),
      control('left', 'completed', 'join'),
      control('right', 'completed', 'join'),
      control('join', 'out', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect.mock.calls.map(call => call[0].record.commandId).sort()).toEqual(['left', 'right', 'start']);
    expect(completed.steps.filter(step => step.nodeId === 'join')).toHaveLength(2);
  });

  it('executes a structured foreach body with an item scoped to each token', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'items', kind: 'source.literalList', value: [{ n: 1 }, { n: 2 }], type: { base: 'json', shape: 'list' } },
      { id: 'loop', kind: 'control.forEach', type: { base: 'json', shape: 'item' } },
      { id: 'effect', kind: 'effect.runCommand', commandId: 'each' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'items', 'loop', 'effect', 'stop'], [
      control('start', 'completed', 'loop'),
      data('items', 'loop', 'items'),
      control('loop', 'each', 'effect'),
      {
        id: 'loop-item-effect',
        source: 'loop',
        sourceHandle: 'data:item',
        target: 'effect',
        targetHandle: 'data:parameters',
        role: 'data'
      },
      control('loop', 'done', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect,
      catalogContext: record => record.commandId === 'each'
        ? { command: { input: { parameters: [{ name: 'parameters', type: 'object' }] } } }
        : {}
    });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect.mock.calls.slice(1).map(call => call[0].inputs.parameters)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('hydrates declared command entity outputs before downstream entity operations', async () => {
    const definition = process([
      { id: 'service', kind: 'effect.runCommand', commandId: 'createProject', trigger: { mode: 'manual' } },
      { id: 'loop', kind: 'control.forEach', type: { base: 'entity', entityType: 'project', shape: 'item' } },
      { id: 'modify', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'event' }, blocks: [] },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['service', 'loop', 'modify', 'stop'], [
      control('service', 'completed', 'loop'),
      {
        id: 'service-project-loop',
        source: 'service',
        sourceHandle: 'data:project',
        target: 'loop',
        targetHandle: 'data:items',
        role: 'data'
      },
      control('loop', 'each', 'modify'),
      {
        id: 'loop-project-modify',
        source: 'loop',
        sourceHandle: 'data:item',
        target: 'modify',
        targetHandle: 'data:entity',
        role: 'data'
      },
      control('loop', 'done', 'stop')
    ]);
    const executeEffect = vi.fn()
      .mockResolvedValueOnce({ entities: [{ type: 'project', id: 'project-1' }] })
      .mockResolvedValueOnce({ ok: true });
    const catalogContext = record => record.commandId === 'createProject'
      ? { command: { output: { entities: [{ type: 'project', persistenceOwner: 'commandOwned', timing: 'immediate' }] } } }
      : {};
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect,
      catalogContext,
      data: { resolveEntityRef: async ref => ({ _id: ref.id, type: ref.type, identity: { name: 'Project' } }) }
    });

    expect(completed.status).toBe('succeeded');
    expect(executeEffect.mock.calls[1][0].inputs.entity).toMatchObject({ _id: 'project-1', type: 'project' });
  });

  it('uses a typed manual event payload instead of an ambient current-entity node', async () => {
    const definition = process([
      {
        id: 'identity',
        kind: 'record.composeBlock',
        block: 'identity',
        fields: ['identity.name'],
        inputDefaults: { 'identity.name': 'Renamed' }
      },
      {
        id: 'modify',
        kind: 'effect.updateEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        blocks: ['identity']
      }
    ], ['identity', 'modify'], [{
      id: 'identity-modify',
      source: 'identity',
      sourceHandle: 'data:block',
      target: 'modify',
      targetHandle: 'data:identity',
      role: 'data'
    }]);
    const entity = { _id: 'project-1', identity: { name: 'Original' } };
    const executeEffect = vi.fn().mockResolvedValue({ ...entity, identity: { name: 'Renamed' } });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'modify' }, {
        context: { inputs: { entity } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: {
        entity,
        identity: { name: 'Renamed' }
      }
    }));
  });

  it('resolves a manual trigger entity edge through its declared payload output', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger', entityType: 'project' },
      {
        id: 'lineage',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [{ id: 'project', key: 'projectId', entityType: 'project' }]
      },
      {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'queue',
        trigger: { mode: 'event' },
        blocks: ['lineage']
      }
    ], ['trigger', 'lineage', 'create'], [
      { source: 'trigger', sourceHandle: 'data:entity', target: 'lineage', targetHandle: 'data:entry:project', role: 'data' },
      { source: 'trigger', sourceHandle: 'control:start', target: 'create', targetHandle: 'control:in', role: 'control' },
      { source: 'lineage', sourceHandle: 'data:block', target: 'create', targetHandle: 'data:lineage', role: 'data' }
    ]);
    const project = { _id: 'project-1', identity: { name: 'Project' } };
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'queue-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'trigger', payload: project }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { lineage: { projectId: 'project-1' } }
    }));
  });

  it('binds an upstream effect entity output from manual action context', async () => {
    const definition = process([
      {
        id: 'create-project',
        kind: 'effect.createEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        blocks: ['identity']
      },
      {
        id: 'lineage',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [{ id: 'project', key: 'projectId', entityType: 'project' }]
      },
      {
        id: 'create-queue',
        kind: 'effect.createEntity',
        entityType: 'queue',
        trigger: { mode: 'manual' },
        blocks: ['lineage']
      }
    ], ['create-project', 'lineage', 'create-queue'], [
      { source: 'create-project', sourceHandle: 'data:result', target: 'lineage', targetHandle: 'data:entry:project', role: 'data' },
      { source: 'lineage', sourceHandle: 'data:block', target: 'create-queue', targetHandle: 'data:lineage', role: 'data' }
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'queue-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create-queue' }, {
        context: { inputs: { entities: { project: 'project-1' } } }
      }),
      definition,
      {
        executeEffect,
        catalogContext,
        data: { resolveEntityRef: async ref => ({ _id: ref.id, type: ref.type }) }
      }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledTimes(1);
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'effect.createEntity',
      record: expect.objectContaining({ id: 'create-queue' }),
      inputs: { lineage: { projectId: 'project-1' } }
    }));
  });

  it('omits an optional relation whose manual source has not run', async () => {
    const definition = process([
      {
        id: 'create-library',
        kind: 'effect.createEntity',
        entityType: 'library',
        trigger: { mode: 'manual' }
      },
      {
        id: 'relations',
        kind: 'record.composeBlock',
        block: 'relations',
        compositionMode: 'relations',
        entries: [{ id: 'library', key: 'library', entityType: 'library', cardinality: 'one' }]
      },
      {
        id: 'create-project',
        kind: 'effect.createEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        blocks: ['relations']
      }
    ], ['create-library', 'relations', 'create-project'], [
      { source: 'create-library', sourceHandle: 'data:result', target: 'relations', targetHandle: 'data:entry:library', role: 'data' },
      { source: 'relations', sourceHandle: 'data:block', target: 'create-project', targetHandle: 'data:relations', role: 'data' }
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'project-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create-project' }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledOnce();
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ id: 'create-project' }),
      inputs: {}
    }));
  });

  it('maps manual field data into stable open-block entry sockets', async () => {
    const definition = process([
      {
        id: 'identity',
        kind: 'record.composeBlock',
        block: 'identity',
        compositionMode: 'entries',
        compositionValueBase: 'json',
        entries: [{ id: 'name', key: 'name', type: { base: 'string', shape: 'item' } }]
      },
      {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        blocks: ['identity']
      }
    ], ['identity', 'create'], [{
      id: 'identity-create',
      source: 'identity',
      sourceHandle: 'data:block',
      target: 'create',
      targetHandle: 'data:identity',
      role: 'data'
    }]);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'project-1' });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }, {
        context: { inputs: { data: { identity: { name: 'Manual project' } } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { identity: { name: 'Manual project' } }
    }));
  });

  it('supplies a manual identity block without requiring a composer node', async () => {
    const definition = process([{
      id: 'create',
      kind: 'effect.createEntity',
      entityType: 'project',
      trigger: { mode: 'manual' },
      blocks: ['identity']
    }], ['create'], []);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'project-1' });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }, {
        context: { inputs: { data: { identity: { name: 'Manual project' } } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { identity: { name: 'Manual project' } }
    }));
  });

  it('uses explicit manual input instead of evaluating a wired operational output', async () => {
    const definition = process([
      {
        id: 'create-template',
        kind: 'effect.createEntity',
        entityType: 'cassette',
        trigger: { mode: 'manual' }
      },
      {
        id: 'create-design',
        kind: 'effect.createEntity',
        entityType: 'cassette_design',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'bakeCassetteDesignFromTemplate',
          inputs: [{ id: 'templateId', type: 'entity', entityType: 'cassette', required: true }]
        }
      }
    ], ['create-template', 'create-design'], [{
      id: 'template-design',
      source: 'create-template',
      sourceHandle: 'data:result',
      target: 'create-design',
      targetHandle: 'data:templateId',
      role: 'data'
    }]);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'design-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create-design' }, {
        context: { inputs: { data: { templateId: 'cassette-1' } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledOnce();
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ id: 'create-design' }),
      inputs: { templateId: 'cassette-1' }
    }));
  });

  it('previews pure/read data without executing effects', async () => {
    const definition = process([
      { id: 'entities', kind: 'read.queryEntities', entityType: 'queue' },
      { id: 'count', kind: 'collection.count', type: { base: 'entity' } },
      { id: 'effect', kind: 'effect.updateEntity', entityType: 'queue', trigger: { mode: 'event' } }
    ], ['entities', 'count', 'effect'], [{
      id: 'entities-count', source: 'entities', sourceHandle: 'data:entities', target: 'count', targetHandle: 'data:value', role: 'data'
    }]);
    const executeEffect = vi.fn();
    const result = await previewProcessDataflow(definition, {}, {
      executeEffect,
      catalogContext,
      data: { queryEntities: async () => [{ _id: 'q1' }, { _id: 'q2' }] }
    });
    expect(result.nodes.count.outputs.value.branches[0].items).toEqual([2]);
    expect(result.nodes.effect).toBeUndefined();
    expect(executeEffect).not.toHaveBeenCalled();
  });

  it('advances run and step statuses on a read-only graph without entering the effect boundary', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger' },
      { id: 'entities', kind: 'read.queryEntities', entityType: 'queue' },
      { id: 'count', kind: 'collection.count', type: { base: 'entity' } }
    ], ['trigger', 'entities', 'count'], [
      { id: 'trigger-entities', source: 'trigger', sourceHandle: 'data:entity', target: 'entities', targetHandle: 'data:value', role: 'data' },
      control('trigger', 'out', 'entities'),
      { id: 'entities-count', source: 'entities', sourceHandle: 'data:entities', target: 'count', targetHandle: 'data:value', role: 'data' }
    ]);
    const executeEffect = vi.fn();
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect,
      catalogContext,
      data: { queryEntities: async () => [{ _id: 'q1' }, { _id: 'q2' }] }
    });

    expect(completed.status).toBe('succeeded');
    expect(completed.steps.length).toBeGreaterThan(0);
    expect(completed.steps.every(step => ['succeeded', 'skipped'].includes(step.status))).toBe(true);
    expect(executeEffect).not.toHaveBeenCalled();
  });

  it('previews secret and opaque values as redacted', async () => {
    const definition = process([
      { id: 'secrets', kind: 'source.literalList', value: [{ secretRef: 'vault/1' }, { opaqueType: 'geometry' }, { safe: 1 }] }
    ], ['secrets'], []);
    const result = await previewProcessDataflow(definition, {}, { catalogContext });
    expect(result.nodes.secrets.outputs.value.branches[0].items).toEqual(['[redacted]', '[redacted]', { safe: 1 }]);
  });

  it('keeps missing fields distinct from present nulls in preview', async () => {
    const definition = process([
      { id: 'block', kind: 'source.literalItem', value: { name: null } },
      { id: 'name', kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { id: 'reference', kind: 'record.getField', block: 'identity', path: 'identity.reference' }
    ], ['block', 'name', 'reference'], [
      data('block', 'name', 'block'),
      data('block', 'reference', 'block')
    ]);
    const result = await previewProcessDataflow(definition, {}, { catalogContext });
    const [presentNull] = result.nodes.name.outputs.value.branches[0].items;
    const [missing] = result.nodes.reference.outputs.value.branches[0].items;
    expect(presentNull).toBeNull();
    expect(isMissingField(missing)).toBe(true);
  });

  it('reports branch paths, item counts, and truncation under a preview limit', async () => {
    const definition = process([
      {
        id: 'tree',
        kind: 'source.literalTree',
        value: { branches: [{ path: [0], items: [1, 2] }, { path: [1], items: [3] }] }
      }
    ], ['tree'], []);
    const result = await previewProcessDataflow(definition, {}, { catalogContext, previewLimit: 2 });
    const tree = result.nodes.tree.outputs.value;
    expect(tree.branchCount).toBe(2);
    expect(tree.itemCount).toBe(3);
    expect(tree.truncated).toBe(true);
    expect(tree.branches[0]).toMatchObject({ path: [0], itemCount: 2, items: [1, 2] });
    expect(tree.branches[1]).toMatchObject({ path: [1], itemCount: 1, items: [] });
  });

});
