import { describe, expect, it, vi } from 'vitest';
import {
  advanceProcessRun,
  createProcessRun,
  previewProcessDataflow,
  resumeProcessRun,
  runProcessUntilSettled,
  transitionProcessRun,
  transitionProcessStep
} from './orchestration.js';
import { isMissingField } from './missing-field.js';
import { processDefinitionToGraphDocument, graphDocumentToProcessDefinition } from './process-graph.js';

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
const catalogContext = () => ({
  fieldSchemas: [{ path: 'name', block: 'identity', type: { base: 'string', shape: 'item' } }]
});

describe('durable process orchestration', () => {
  it.each(['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove'])(
    'routes %s through the shared mapped mutation boundary',
    async kind => {
      const construct = kind === 'cts.construct';
      const inputId = construct ? 'identity' : 'entity';
      const mutation = construct
        ? {
          id: 'mutation',
          kind,
          typeId: 'project',
          trigger: { mode: 'manual' },
          construction: { mode: 'genericCreate', inputs: [{ id: 'identity', type: 'json' }] }
        }
        : { id: 'mutation', kind, typeId: 'project', trigger: { mode: 'manual' } };
      const definition = process([
        { id: 'values', kind: 'source.literalList', value: construct
          ? [{ name: 'One' }, { name: 'Two' }]
          : [{ type: 'project', id: 'p1' }, { type: 'project', id: 'p2' }] },
        mutation
      ], ['values', 'mutation'], [data('values', 'mutation', inputId)]);
      const executeEffect = vi.fn(async ({ inputs }) => construct
        ? { type: 'project', id: inputs.identity.name }
        : inputs.entity);

      const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
        executeEffect,
        catalogContext
      });

      expect(completed.status).toBe('succeeded');
      expect(executeEffect).toHaveBeenCalledTimes(2);
      expect(completed.steps[0].output).toEqual({ branches: [{ path: [], items: construct
        ? [{ type: 'project', id: 'One' }, { type: 'project', id: 'Two' }]
        : [{ type: 'project', id: 'p1' }, { type: 'project', id: 'p2' }] }] });
    }
  );

  it('runs the durable process profile from the canonical graph document envelope', async () => {
    const definition = process([
      { id: 'values', kind: 'source.literalList', value: [{ type: 'project', id: 'p1' }] },
      { id: 'mutation', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'manual' } },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['values', 'mutation', 'stop'], [
      data('values', 'mutation', 'entity'),
      control('mutation', 'completed', 'stop')
    ]);
    const graph = processDefinitionToGraphDocument(definition);
    expect(graph.nodes.find(node => node.id === 'mutation')).toMatchObject({
      operation: { provider: 'perigram.processes', id: 'cts.mutate', version: '1' },
      config: { refId: 'mutation', record: { id: 'mutation', kind: 'cts.mutate' } }
    });
    expect(graph.metadata['perigram.process-definition'].sourceData).not.toHaveProperty('processNodes');
    expect(graph.metadata['perigram.process-definition']).not.toHaveProperty('nodeKinds');
    const preview = await previewProcessDataflow(graph, {}, { catalogContext });
    expect(preview.nodes.values).toBeDefined();

    const executeEffect = vi.fn(async ({ inputs }) => inputs.entity);
    const run = createProcessRun(graph, {});
    const completed = await runProcessUntilSettled(run, graph, { executeEffect, catalogContext });

    expect(completed.status).toBe('succeeded');
    expect(completed.steps[0].kind).toBe('cts.mutate');
    expect(executeEffect).toHaveBeenCalledOnce();
  });

  it('keeps the bare effect result and idempotency key for a single mapped item', async () => {
    const definition = process([
      { id: 'modify', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'manual' } }
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
      { id: 'mutation', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'manual' } },
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
      operation: 'cts.mutate',
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
      { id: 'names', kind: 'source.literalList', value: ['One', 'Two'] },
      { id: 'mutation', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'manual' } }
    ], ['entities', 'names', 'mutation'], [
      data('entities', 'mutation', 'entity'),
      data('names', 'mutation', 'name')
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
      kind: 'cts.transition',
      typeId: 'project',
      trigger: { mode: 'manual' },
      stateRef: 'ready'
    }], ['update'], [{
      id: 'ready-update',
      source: 'ready',
      sourceHandle: 'data:status',
      target: 'update',
      targetHandle: 'data:state',
      role: 'data'
    }]);
    definition.stateDefinitions = {
      ready: { id: 'ready', stateId: 'READY', label: 'Ready' }
    };
    definition.graph.nodes.unshift({
      id: 'ready',
      type: 'stateDefinition',
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
        state: 'READY'
      }
    }));
  });

  it('starts a manual effect and feeds a decomposed facet into an automatic effect', async () => {
    const definition = process([
      {
        id: 'rows',
        kind: 'cts.compose',
        block: 'fields',
        compositionMode: 'entries',
        entries: [{ id: 'name', key: 'name' }],
        inputDefaults: { 'entry:name': 'Original' }
      },
      {
        id: 'create',
        kind: 'cts.construct',
        typeId: 'project',
        trigger: { mode: 'manual' },
        construction: { mode: 'genericCreate', inputs: [{ id: 'fields', type: 'json' }] }
      },
      {
        id: 'decompose',
        kind: 'cts.decompose',
        typeId: 'project'
      },
      {
        id: 'update',
        kind: 'cts.mutate',
        typeId: 'project',
        trigger: { mode: 'event' }
      }
    ], ['rows', 'create', 'decompose', 'update'], [
      {
        id: 'rows-create',
        source: 'rows',
        sourceHandle: 'data:block',
        target: 'create',
        targetHandle: 'data:fields',
        role: 'data'
      },
      {
        id: 'created-decompose',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'decompose',
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
        id: 'name-update',
        source: 'decompose',
        sourceHandle: 'data:name',
        target: 'update',
        targetHandle: 'data:name',
        role: 'data'
      },
      control('create', 'completed', 'update')
    ]);
    const executeEffect = vi.fn()
      .mockResolvedValueOnce({ type: 'project', _id: 'project-1', name: 'Original', fields: { name: 'Original' } })
      .mockResolvedValueOnce({ type: 'project', _id: 'project-1', name: 'Original', fields: { name: 'Original' } });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputs: {
        entity: { type: 'project', _id: 'project-1', name: 'Original', fields: { name: 'Original' } },
        'name': 'Original'
      }
    }));
  });

  it('branches, executes an effect once with an idempotency key, and stops', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'condition', kind: 'source.literalItem', value: true, type: { base: 'boolean', shape: 'item' } },
      { id: 'branch', kind: 'control.if' },
      { id: 'effect', kind: 'cts.command', commandId: 'test' },
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
        kind: 'cts.command',
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
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
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
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
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
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } }
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

  it('parks a run on Wait Until and resumes through the pending-effect seam', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'until', kind: 'source.literalItem', type: { base: 'dateTime' }, value: '2030-01-01T00:00:00.000Z' },
      { id: 'wait', kind: 'control.waitUntil' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'until', 'wait', 'stop'], [
      control('start', 'completed', 'wait'),
      data('until', 'wait', 'until'),
      control('wait', 'completed', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });

    let run = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(run.status).toBe('waiting');
    expect(run.wakeAt).toBe('2030-01-01T00:00:00.000Z');
    expect(run.pendingEffect).toMatchObject({ nodeId: 'wait' });

    run = await resumeProcessRun(run, definition, { output: {} }, { executeEffect });
    const finished = await runProcessUntilSettled(run, definition, { executeEffect });
    expect(finished.status).toBe('succeeded');
    expect(finished.pendingEffect).toBeUndefined();
  });

  it('refuses a Wait Until without a dateTime', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'wait', kind: 'control.waitUntil' }
    ], ['start', 'wait'], [control('start', 'completed', 'wait')]);
    const run = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect: vi.fn().mockResolvedValue({})
    });
    expect(run.status).toBe('failed');
    expect(run.error.message).toMatch(/requires a dateTime/);
  });

  it('carries a structured refusal\'s failures onto the failed run error', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } }
    ], ['start'], []);
    const refusal = new Error('logo: spot logo has no matching part');
    refusal.data = { failures: [{ name: 'logo', message: 'spot logo has no matching part' }] };
    const run = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect: vi.fn().mockRejectedValue(refusal)
    });
    expect(run.status).toBe('failed');
    expect(run.error.failures).toEqual([{ name: 'logo', message: 'spot logo has no matching part' }]);
  });

  it('enforces the run and step transition tables', () => {
    const run = { status: 'running' };
    transitionProcessRun(run, 'waiting');
    transitionProcessRun(run, 'running');
    transitionProcessRun(run, 'succeeded');
    expect(() => transitionProcessRun(run, 'running')).toThrow(/Illegal process run transition succeeded/);

    const step = { status: 'pending' };
    transitionProcessStep(step, 'running');
    transitionProcessStep(step, 'waiting');
    transitionProcessStep(step, 'succeeded');
    expect(() => transitionProcessStep(step, 'running')).toThrow(/Illegal process step transition succeeded/);
    expect(() => transitionProcessStep({ status: 'pending' }, 'succeeded')).toThrow(/pending -> succeeded/);
    transitionProcessStep({ status: 'waiting' }, 'cancelled');
    transitionProcessRun({ status: 'waiting' }, 'cancelled');
  });

  it('settles a run with no pending tokens as succeeded', async () => {
    const run = { id: 'r-1', status: 'running', tokens: [], steps: [], loops: {}, updatedAt: null };
    const settled = await advanceProcessRun(run, process([], [], []), {});
    expect(settled.status).toBe('succeeded');
  });

  it('leaves terminal runs untouched', async () => {
    for (const status of ['succeeded', 'failed', 'cancelled']) {
      const run = { id: `r-${status}`, status, tokens: [{ nodeId: 'x' }], steps: [], loops: {} };
      const next = await advanceProcessRun(run, process([], [], []), {});
      expect(next.status).toBe(status);
      expect(next).toEqual(run);
    }
  });

  it('marks the failed node and run on an effect error', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } }
    ], ['start'], []);
    const failed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, {
      executeEffect: vi.fn().mockRejectedValue(new Error('boom'))
    });
    expect(failed.status).toBe('failed');
    expect(failed.steps[0]).toMatchObject({ status: 'failed', error: { message: 'boom' } });
  });

  it('starts a run at a scheduled entry', async () => {
    const definition = process([
      { id: 'daily', kind: 'cts.command', commandId: 'ping', trigger: { mode: 'schedule', schedule: { interval: 'P1D' } } }
    ], ['daily'], []);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const run = await runProcessUntilSettled(createProcessRun(definition, { nodeId: 'daily' }), definition, { executeEffect });
    expect(run.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledOnce();
  });

  it('starts a run at an event-subscribed entry and exposes the event payload', async () => {
    const definition = process([
      { id: 'onEvent', kind: 'cts.command', commandId: 'ping', eventId: 'order.shipped', trigger: { mode: 'event', eventId: 'order.shipped' } },
      { id: 'payload', kind: 'source.triggerPayload', path: 'event.payload.order' }
    ], ['onEvent', 'payload'], []);
    const run = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'onEvent', eventId: 'order.shipped', event: { type: 'order.shipped', payload: { order: 'o-1' } } }),
      definition,
      { executeEffect: vi.fn().mockResolvedValue({}) }
    );
    expect(run.status).toBe('succeeded');
  });

  it('waits for every fork branch at join-all', async () => {
    const definition = process([
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'fork', kind: 'control.fork', branches: 2 },
      { id: 'left', kind: 'cts.command', commandId: 'left' },
      { id: 'right', kind: 'cts.command', commandId: 'right' },
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
      { id: 'start', kind: 'cts.command', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'items', kind: 'source.literalList', value: [{ n: 1 }, { n: 2 }], type: { base: 'json', shape: 'list' } },
      { id: 'loop', kind: 'control.forEach', type: { base: 'json', shape: 'item' } },
      { id: 'effect', kind: 'cts.command', commandId: 'each' },
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
      { id: 'service', kind: 'cts.command', commandId: 'createProject', trigger: { mode: 'manual' } },
      { id: 'loop', kind: 'control.forEach', type: { base: 'entity', typeId: 'project', shape: 'item' } },
      { id: 'modify', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'event' } },
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
        kind: 'cts.compose',
        block: 'data',
        compositionMode: 'entries',
        entries: [{ id: 'name', key: 'name' }],
        inputDefaults: { 'entry:name': 'Renamed' }
      },
      {
        id: 'name',
        kind: 'value.recordField',
        path: 'name',
        type: { base: 'string', nullable: false }
      },
      {
        id: 'modify',
        kind: 'cts.mutate',
        typeId: 'project',
        trigger: { mode: 'manual' }
      }
    ], ['identity', 'name', 'modify'], [
      {
        id: 'identity-name',
        source: 'identity',
        sourceHandle: 'data:block',
        target: 'name',
        targetHandle: 'data:value',
        role: 'data'
      },
      {
        id: 'name-modify',
        source: 'name',
        sourceHandle: 'data:value',
        target: 'modify',
        targetHandle: 'data:name',
        role: 'data'
      }
    ]);
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
        'name': 'Renamed'
      }
    }));
  });

  it('resolves the run trigger payload into a construct lineage input', async () => {
    const definition = process([
      { id: 'payload', kind: 'source.triggerPayload', path: ['payload'] },
      {
        id: 'create',
        kind: 'cts.construct',
        typeId: 'queue',
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project' }]
        }
      }
    ], ['payload', 'create'], [
      { source: 'payload', sourceHandle: 'data:value', target: 'create', targetHandle: 'data:lineage.projectId', role: 'data' }
    ]);
    const project = { _id: 'project-1', identity: { name: 'Project' } };
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'queue-1' });

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { payload: project }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { 'lineage.projectId': project }
    }));
  });

  it('binds an upstream effect entity output from manual action context', async () => {
    const definition = process([
      {
        id: 'create-project',
        kind: 'cts.construct',
        typeId: 'project',
        trigger: { mode: 'manual' },
        construction: { mode: 'genericCreate', inputs: [] }
      },
      {
        id: 'create-queue',
        kind: 'cts.construct',
        typeId: 'queue',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project' }]
        }
      }
    ], ['create-project', 'create-queue'], [
      { source: 'create-project', sourceHandle: 'data:result', target: 'create-queue', targetHandle: 'data:lineage.projectId', role: 'data' }
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
      kind: 'cts.construct',
      record: expect.objectContaining({ id: 'create-queue' }),
      inputs: { 'lineage.projectId': { type: 'project', id: 'project-1' } }
    }));
  });

  it('binds a construct lineage input from the manual context entity', async () => {
    const definition = process([
      {
        id: 'create-queue',
        kind: 'cts.construct',
        typeId: 'queue',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project' }]
        }
      }
    ], ['create-queue']);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'queue-1' });
    const project = { _id: 'project-1', type: 'project', lineage: {} };
    const parents = { queue: project };

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create-queue' }, {
        context: { inputs: { entity: { type: 'queue', id: 'queue-1' } } }
      }),
      definition,
      {
        executeEffect,
        catalogContext,
        domain: { containment: [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }] },
        data: {
          resolveEntityRef: async ref => (ref.type === 'queue' ? { _id: 'queue-1', type: 'queue', lineage: { projectId: 'project-1' } } : project),
          parentEntity: async entity => parents[entity.type]
        }
      }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { 'lineage.projectId': project }
    }));
  });

  it('walks containment for a lineage input declared above the context entity', async () => {
    const definition = process([
      {
        id: 'create-sheet',
        kind: 'cts.construct',
        typeId: 'sheet',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project' }]
        }
      }
    ], ['create-sheet']);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'sheet-1' });
    const attempt = { _id: 'attempt-1', type: 'attempt', lineage: { queueId: 'queue-1' } };
    const queue = { _id: 'queue-1', type: 'queue', lineage: { projectId: 'project-1' } };
    const project = { _id: 'project-1', type: 'project', lineage: {} };
    const parents = { attempt: queue, queue: project };

    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create-sheet' }, {
        context: { inputs: { entity: { type: 'attempt', id: 'attempt-1' } } }
      }),
      definition,
      {
        executeEffect,
        catalogContext,
        domain: { containment: [{ parentType: 'attempt', childType: 'sheet', lineageKey: 'attemptId' }] },
        data: {
          resolveEntityRef: async ref => (ref.type === 'attempt' ? attempt : project),
          parentEntity: async entity => parents[entity.type]
        }
      }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { 'lineage.projectId': project }
    }));
  });

  it('omits an optional relation whose manual source has not run', async () => {
    const definition = process([
      {
        id: 'create-library',
        kind: 'cts.construct',
        typeId: 'library',
        trigger: { mode: 'manual' },
        construction: { mode: 'genericCreate', inputs: [] }
      },
      {
        id: 'create-project',
        kind: 'cts.construct',
        typeId: 'project',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'relations.library', path: 'relations.library', type: 'entity', typeId: 'library', required: false }]
        }
      }
    ], ['create-library', 'create-project'], [
      { source: 'create-library', sourceHandle: 'data:result', target: 'create-project', targetHandle: 'data:relations.library', role: 'data' }
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
        kind: 'cts.compose',
        block: 'data',
        compositionMode: 'entries',
        entries: [{ id: 'name', key: 'name', type: { base: 'string', shape: 'item' } }]
      },
      {
        id: 'create',
        kind: 'cts.construct',
        typeId: 'project',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'name', path: 'name', type: 'string', required: true }]
        }
      }
    ], ['identity', 'create'], [{
      id: 'identity-create',
      source: 'identity',
      sourceHandle: 'data:block',
      target: 'create',
      targetHandle: 'data:name',
      role: 'data'
    }]);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'project-1' });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }, {
        context: { inputs: { data: { name: 'Manual project' } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { name: 'Manual project' }
    }));
  });

  it('supplies a manual identity row without requiring a composer node', async () => {
    const definition = process([{
      id: 'create',
      kind: 'cts.construct',
      typeId: 'project',
      trigger: { mode: 'manual' },
      construction: {
        mode: 'genericCreate',
        inputs: [{ id: 'name', path: 'name', type: 'string', required: true }]
      }
    }], ['create'], []);
    const executeEffect = vi.fn().mockResolvedValue({ _id: 'project-1' });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }, {
        context: { inputs: { data: { name: 'Manual project' } } }
      }),
      definition,
      { executeEffect, catalogContext }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: { name: 'Manual project' }
    }));
  });

  it('uses explicit manual input instead of evaluating a wired operational output', async () => {
    const definition = process([
      {
        id: 'create-template',
        kind: 'cts.construct',
        typeId: 'cassette',
        trigger: { mode: 'manual' },
        construction: { mode: 'genericCreate', inputs: [] }
      },
      {
        id: 'create-design',
        kind: 'cts.construct',
        typeId: 'cassette_design',
        trigger: { mode: 'manual' },
        construction: {
          mode: 'bakeCassetteDesignFromTemplate',
          inputs: [{ id: 'templateId', type: 'entity', typeId: 'cassette', required: true }]
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

  it('includes resolved connected inputs for effects without executing them', async () => {
    const serviceContext = () => ({
      domain: {
        serviceContracts: {
          'plugin.docs.echo': {
            signature: {
              input: { base: 'record', fields: { text: { base: 'string' } } },
              output: { base: 'string' }
            }
          }
        }
      }
    });
    const definition = process([
      { id: 'text', kind: 'source.literalItem', value: 'connected value' },
      { id: 'echo', kind: 'cts.service', operator: 'plugin.docs.echo' }
    ], ['text', 'echo'], [data('text', 'echo', 'text')]);

    const result = await previewProcessDataflow(definition, {}, { catalogContext: serviceContext });

    expect(result.nodes.echo.inputs.text.branches[0].items).toEqual(['connected value']);
    expect(result.nodes.echo.outputs).toBeUndefined();
  });

  it('previews pure/read data without executing effects', async () => {
    const definition = process([
      { id: 'entities', kind: 'cts.read', select: 'all', typeId: 'queue' },
      { id: 'count', kind: 'collection.count', type: { base: 'entity' } },
      { id: 'effect', kind: 'cts.mutate', typeId: 'queue', trigger: { mode: 'event' } }
    ], ['entities', 'count', 'effect'], [{
      id: 'entities-count', source: 'entities', sourceHandle: 'data:result', target: 'count', targetHandle: 'data:value', role: 'data'
    }]);
    const executeEffect = vi.fn();
    const result = await previewProcessDataflow(definition, {}, {
      executeEffect,
      catalogContext,
      data: { queryEntities: async () => [{ _id: 'q1' }, { _id: 'q2' }] }
    });
    expect(result.nodes.count.outputs.value.branches[0].items).toEqual([2]);
    expect(result.nodes.effect).toMatchObject({ inputs: {} });
    expect(result.nodes.effect.outputs).toBeUndefined();
    expect(executeEffect).not.toHaveBeenCalled();
  });

  it('previews secret and opaque values as redacted', async () => {
    const definition = process([
      { id: 'secrets', kind: 'source.literalList', value: [{ secretRef: 'vault/1' }, { opaqueType: 'geometry' }, { safe: 1 }] }
    ], ['secrets'], []);
    const result = await previewProcessDataflow(definition, {}, { catalogContext });
    expect(result.nodes.secrets.outputs.value.branches[0].items).toEqual(['[redacted]', '[redacted]', { safe: 1 }]);
  });

  it('evaluates a value service node in preview through the service channel', async () => {
    const serviceContext = () => ({
      ...catalogContext(),
      domain: {
        serviceContracts: {
          'plugin.docs.csv-text': {
            signature: {
              input: { base: 'record', fields: { rows: { base: 'list', itemType: { base: 'record' } } } },
              output: { base: 'string' }
            }
          }
        }
      }
    });
    const definition = process([
      { id: 'rows', kind: 'source.literalList', value: [{ a: 1 }, { a: 2 }] },
      { id: 'csv', kind: 'cts.service', operator: 'plugin.docs.csv-text' },
      { id: 'rendered', kind: 'value.format', template: '{value}' }
    ], ['rows', 'csv', 'rendered'], [
      data('rows', 'csv', 'rows'),
      data('csv', 'rendered', 'value')
    ]);
    const previewService = vi.fn(async (operator, parameters) => {
      expect(operator).toBe('plugin.docs.csv-text');
      expect(parameters).toEqual({ rows: [{ a: 1 }, { a: 2 }] });
      return 'a\n1\n2';
    });
    const result = await previewProcessDataflow(definition, {}, {
      catalogContext: serviceContext,
      previewService
    });
    expect(result.nodes.csv.outputs.result.branches[0].items).toEqual(['a\n1\n2']);
    expect(result.nodes.rendered.outputs.value.branches[0].items).toEqual(['a\n1\n2']);
  });

  it('memoizes one preview service dispatch per fan-out consumer', async () => {
    const serviceContext = () => ({
      domain: {
        serviceContracts: {
          'plugin.docs.echo': {
            signature: { input: { base: 'record', fields: { text: { base: 'string' } } }, output: { base: 'string' } }
          }
        }
      }
    });
    const definition = process([
      { id: 'text', kind: 'source.literalItem', value: 'ping' },
      { id: 'echo', kind: 'cts.service', operator: 'plugin.docs.echo' },
      { id: 'one', kind: 'value.format', template: '1{value}' },
      { id: 'two', kind: 'value.format', template: '2{value}' }
    ], ['text', 'echo', 'one', 'two'], [
      data('text', 'echo', 'text'),
      data('echo', 'one', 'value'),
      data('echo', 'two', 'value')
    ]);
    const previewService = vi.fn(async () => 'pong');
    const result = await previewProcessDataflow(definition, {}, {
      catalogContext: serviceContext,
      previewService
    });
    expect(previewService).toHaveBeenCalledTimes(1);
    expect(result.nodes.one.outputs.value.branches[0].items).toEqual(['1pong']);
    expect(result.nodes.two.outputs.value.branches[0].items).toEqual(['2pong']);
  });

  it('does not execute service nodes outside preview scope but still exposes their inputs', async () => {
    const serviceContext = () => ({
      domain: {
        serviceContracts: {
          'plugin.docs.echo': {
            signature: {
              input: { base: 'record', fields: { text: { base: 'string' } } },
              output: { base: 'string' }
            }
          }
        }
      }
    });
    const definition = process([
      { id: 'text', kind: 'source.literalItem', value: 'ping' },
      { id: 'echo', kind: 'cts.service', operator: 'plugin.docs.echo', trigger: { mode: 'manual' } }
    ], ['text', 'echo'], [data('text', 'echo', 'text')]);
    const result = await previewProcessDataflow(definition, {}, { catalogContext: serviceContext });
    expect(result.nodes.echo.inputs.text.branches[0].items).toEqual(['ping']);
    expect(result.nodes.echo.outputs).toBeUndefined();
  });

  it('keeps missing fields distinct from present nulls in preview', async () => {
    const definition = process([
      { id: 'entity', kind: 'source.literalItem', value: { name: null } },
      { id: 'name', kind: 'cts.field', path: 'name' },
      { id: 'reference', kind: 'cts.field', path: 'reference' }
    ], ['entity', 'name', 'reference'], [
      data('entity', 'name', 'entity'),
      data('entity', 'reference', 'entity')
    ]);
    const result = await previewProcessDataflow(definition, {}, { catalogContext });
    const [presentNull] = result.nodes.name.outputs.value.branches[0].items;
    const [missing] = result.nodes.reference.outputs.value.branches[0].items;
    expect(presentNull).toBeNull();
    expect(isMissingField(missing)).toBe(true);
  });

  it('broadcasts a scalar authored default on a List socket instead of rejecting it', async () => {
    const definition = process([
      { id: 'concat', kind: 'collection.concat', inputDefaults: { left: 'a', right: 'b' } }
    ], ['concat'], []);
    const result = await previewProcessDataflow(definition, {}, { catalogContext });

    expect(result.nodes.concat.error).toBeUndefined();
    expect(result.nodes.concat.outputs.value.branches[0].items).toEqual(['a', 'b']);
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

  it('binds the run-context entity to the trigger effect only; downstream consumers take their wired edges', async () => {
    const trigger = { id: 'act', kind: 'cts.transition', typeId: 'project', trigger: { mode: 'manual' } };
    const downstream = { id: 'chained', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'event' } };
    const definition = process([trigger, downstream], ['act', 'chained'], [control('act', 'completed', 'chained')]);
    const executeEffect = vi.fn(async ({ inputs }) => inputs.entity || { type: 'project', id: 'updated' });
    const run = createProcessRun(definition, {}, {
      context: { inputs: { entity: { type: 'project', id: 'ctx-1' } } }
    });
    run.trigger = { nodeId: 'act' };

    await runProcessUntilSettled(run, definition, { executeEffect, catalogContext: catalogContext });

    const triggerEntity = executeEffect.mock.calls[0][0].inputs.entity;
    const chainedEntity = executeEffect.mock.calls[1][0].inputs.entity;
    expect(triggerEntity).toMatchObject({ id: 'ctx-1' });
    expect(chainedEntity).toBeUndefined();
  });

  it('keeps process wire semantics in canonical edges without a parallel edge metadata table', () => {
    const definition = {
      id: 'process.sample',
      dataflowVersion: 4,
      processNodes: { operation: { id: 'operation', kind: 'source.literal', value: 'hello' } },
      valueInputs: {
        'source-ref': { id: 'source-ref', path: 'name' },
        orphan: { id: 'orphan', path: 'unused' }
      },
      customDomainRecord: { retained: true },
      graph: {
        nodes: [
          { id: 'source', type: 'valueInput', position: { x: 1, y: 2 }, data: { refId: 'source-ref' } },
          { id: 'operation-node', type: 'processNode', position: { x: 3, y: 4 }, data: { refId: 'operation' } }
        ],
        edges: [{
          id: 'wire', source: 'source', sourceHandle: 'output:value',
          target: 'operation-node', targetHandle: 'input:value',
          role: 'control', label: 'Continue', type: 'smoothstep',
          data: { marker: 'kept' }
        }],
        viewport: { x: 5, y: 6, zoom: 1.25 }
      }
    };
    const graph = processDefinitionToGraphDocument(definition);
    expect(graph.nodes.find(node => node.id === 'source').config.record).toEqual({ id: 'source-ref', path: 'name' });
    expect(graph.metadata['perigram.process-definition'].sourceData.valueInputs).toEqual({
      orphan: { id: 'orphan', path: 'unused' }
    });
    expect(graph.edges[0]).toMatchObject({
      kind: 'control',
      metadata: { label: 'Continue', type: 'smoothstep', data: { marker: 'kept' } }
    });
    expect(graph.metadata['perigram.process-definition']).not.toHaveProperty('edgeMetadata');
    const restored = graphDocumentToProcessDefinition(graph);
    expect(restored.customDomainRecord).toEqual({ retained: true });
    expect(restored.valueInputs).toEqual({
      'source-ref': { id: 'source-ref', path: 'name' },
      orphan: { id: 'orphan', path: 'unused' }
    });
    expect(restored.graph.edges[0]).toMatchObject({
      role: 'control', label: 'Continue', type: 'smoothstep', data: { marker: 'kept' }
    });
    expect(restored.graph.viewport).toEqual({ x: 5, y: 6, zoom: 1.25 });
  });

});
