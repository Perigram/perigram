import { describe, expect, it, vi } from 'vitest';
import { advanceProcessRun, createProcessRun, runProcessUntilSettled } from './orchestration.js';

function process(records, nodes, edges) {
  return {
    id: 'definition',
    dataflowVersion: 3,
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

describe('durable process orchestration', () => {
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
      { executeEffect }
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
        entityType: 'project',
        block: 'identity',
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' } }],
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
      { executeEffect }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputs: {
        entity: { type: 'project', id: 'project-1', identity: { name: 'Original' } },
        identity: { name: 'Original' }
      }
    }));
  });

  it('keeps date scheduling in an explicit wait node before an automatic effect', async () => {
    const definition = process([
      { id: 'create', kind: 'effect.createEntity', entityType: 'project', trigger: { mode: 'manual' }, fields: [] },
      { id: 'at', kind: 'source.literalItem', value: '2026-02-01T00:00:00.000Z', type: { base: 'dateTime', shape: 'item' } },
      { id: 'wait', kind: 'control.waitUntil' },
      { id: 'update', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'event' }, fields: [] }
    ], ['create', 'at', 'wait', 'update'], [
      {
        id: 'create-update-entity',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'update',
        targetHandle: 'data:entity',
        role: 'data'
      },
      data('at', 'wait', 'at'),
      control('create', 'completed', 'wait'),
      control('wait', 'out', 'update')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ type: 'project', id: 'project-1' });
    const before = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z'));
    const waiting = await runProcessUntilSettled(
      createProcessRun(definition, { nodeId: 'create' }, { now: before }),
      definition,
      { now: before, executeEffect }
    );

    expect(waiting.status).toBe('waiting');
    expect(waiting.wakeAt).toBe('2026-02-01T00:00:00.000Z');
    expect(executeEffect).toHaveBeenCalledOnce();

    const after = vi.fn().mockReturnValue(new Date('2026-02-01T00:00:01.000Z'));
    const completed = await runProcessUntilSettled(waiting, definition, { now: after, executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledTimes(2);
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

  it('persists a wait boundary and resumes after its wake time', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'duration', kind: 'source.literalItem', value: 'PT5S', type: { base: 'duration', shape: 'item' } },
      { id: 'wait', kind: 'control.waitDuration' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'duration', 'wait', 'stop'], [
      control('start', 'completed', 'wait'),
      data('duration', 'wait', 'duration'),
      control('wait', 'out', 'stop')
    ]);
    const now = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00Z'));
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const started = await advanceProcessRun(createProcessRun(definition, {}, { now }), definition, { now, executeEffect });
    const waiting = await advanceProcessRun(started, definition, { now, executeEffect });
    expect(waiting.status).toBe('waiting');
    const after = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:06Z'));
    const completed = await runProcessUntilSettled(waiting, definition, { now: after, executeEffect });
    expect(completed.status).toBe('succeeded');
  });

  it('terminates a failed effect after retry instead of emitting completion', async () => {
    const definition = process([
      {
        id: 'start',
        kind: 'effect.runCommand',
        commandId: 'start',
        trigger: { mode: 'manual' },
        retry: { maxAttempts: 2, delayMs: 0 }
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
    expect(executeEffect).toHaveBeenCalledTimes(2);
    expect(failed.steps.some(step => step.nodeId === 'stop')).toBe(false);
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
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect.mock.calls.slice(1).map(call => call[0].inputs.parameters)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('routes a typed process input payload into date operations and an explicit wait', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', entityType: 'project', trigger: { mode: 'manual' } },
      { id: 'entity', kind: 'source.processInput', path: 'entity', type: { base: 'entity', shape: 'item', entityType: 'project' } },
      { id: 'deconstruct', kind: 'record.deconstruct', entityType: 'project', blocks: ['status'] },
      { id: 'field', kind: 'record.getField', entityType: 'project', block: 'status', path: 'status.timestamp', fieldSchema: { block: 'status', type: { base: 'dateTime' } } },
      { id: 'date', kind: 'value.dateTime', operation: 'addDays', inputDefaults: { amount: 30 } },
      { id: 'wait', kind: 'control.waitUntil' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'entity', 'deconstruct', 'field', 'date', 'wait', 'stop'], [
      control('start', 'completed', 'wait'),
      {
        id: 'payload-deconstruct',
        source: 'entity',
        sourceHandle: 'data:value',
        target: 'deconstruct',
        targetHandle: 'data:entity',
        role: 'data'
      },
      {
        id: 'status-field',
        source: 'deconstruct',
        sourceHandle: 'data:status',
        target: 'field',
        targetHandle: 'data:block',
        role: 'data'
      },
      data('field', 'date', 'date'),
      data('date', 'wait', 'at'),
      control('wait', 'out', 'stop')
    ]);
    const now = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z'));
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const run = createProcessRun(definition, { nodeId: 'start' }, {
      now,
      context: { inputs: { entity: { status: { timestamp: '2026-01-01T10:00:00.000Z' } } } }
    });
    const waiting = await runProcessUntilSettled(
      run,
      definition,
      { now, executeEffect }
    );
    expect(waiting.status).toBe('waiting');
    expect(waiting.wakeAt).toBe('2026-01-31T10:00:00.000Z');
  });

  it('uses a typed manual event payload instead of an ambient current-entity node', async () => {
    const definition = process([
      {
        id: 'identity',
        kind: 'record.composeBlock',
        entityType: 'project',
        block: 'identity',
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', block: 'identity', type: { base: 'string' } }],
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
      { executeEffect }
    );

    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledWith(expect.objectContaining({
      inputs: {
        entity,
        identity: { name: 'Renamed' }
      }
    }));
  });
});
