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

  it('starts a manual effect directly and feeds a selected deconstructed field into an automatic effect', async () => {
    const definition = process([
      {
        id: 'create',
        kind: 'effect.createEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        fields: ['identity.name'],
        inputDefaults: { 'identity.name': 'Original' }
      },
      {
        id: 'deconstruct',
        kind: 'record.deconstruct',
        entityType: 'project',
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
      },
      {
        id: 'update',
        kind: 'effect.updateEntity',
        entityType: 'project',
        trigger: { mode: 'event' },
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', type: { base: 'string', shape: 'item' } }]
      }
    ], ['create', 'deconstruct', 'update'], [
      {
        id: 'created-deconstruct',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'deconstruct',
        targetHandle: 'data:record',
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
        source: 'deconstruct',
        sourceHandle: 'data:identity.name',
        target: 'update',
        targetHandle: 'data:identity.name',
        role: 'data'
      },
      control('create', 'success', 'update')
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
        'identity.name': 'Original'
      }
    }));
  });

  it('delays a date-triggered effect until the connected date', async () => {
    const definition = process([
      { id: 'create', kind: 'effect.createEntity', entityType: 'project', trigger: { mode: 'manual' }, fields: [] },
      { id: 'at', kind: 'source.literalItem', value: '2026-02-01T00:00:00.000Z', type: { base: 'dateTime', shape: 'item' } },
      { id: 'update', kind: 'effect.updateEntity', entityType: 'project', trigger: { mode: 'date' }, fields: [] }
    ], ['create', 'at', 'update'], [
      {
        id: 'create-update-entity',
        source: 'create',
        sourceHandle: 'data:result',
        target: 'update',
        targetHandle: 'data:entity',
        role: 'data'
      },
      data('at', 'update', 'at'),
      control('create', 'success', 'update')
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
      control('start', 'success', 'branch'),
      data('condition', 'branch', 'condition'),
      control('branch', 'true', 'effect'),
      control('effect', 'success', 'stop')
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
      control('start', 'success', 'wait'),
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

  it('waits for every fork branch at join-all', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', trigger: { mode: 'manual' } },
      { id: 'fork', kind: 'control.fork', branches: 2 },
      { id: 'left', kind: 'effect.runCommand', commandId: 'left' },
      { id: 'right', kind: 'effect.runCommand', commandId: 'right' },
      { id: 'join', kind: 'control.joinAll' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'fork', 'left', 'right', 'join', 'stop'], [
      control('start', 'success', 'fork'),
      control('fork', 'branch1', 'left'),
      control('fork', 'branch2', 'right'),
      control('left', 'success', 'join'),
      control('right', 'success', 'join'),
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
      control('start', 'success', 'loop'),
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

  it('routes a typed automatic entity event payload into entity data operations', async () => {
    const definition = process([
      { id: 'start', kind: 'effect.runCommand', commandId: 'start', entityType: 'project', trigger: { mode: 'entityChanged' } },
      { id: 'entity', kind: 'source.processInput', path: 'entity', type: { base: 'entity', shape: 'item', entityType: 'project' } },
      { id: 'field', kind: 'record.getField', entityType: 'project', path: 'status.timestamp', fieldSchema: { type: { base: 'dateTime' } } },
      { id: 'date', kind: 'value.dateTime', operation: 'addDays', inputDefaults: { amount: 30 } },
      { id: 'wait', kind: 'control.waitUntil' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['start', 'entity', 'field', 'date', 'wait', 'stop'], [
      control('start', 'success', 'wait'),
      {
        id: 'payload-field',
        source: 'entity',
        sourceHandle: 'data:value',
        target: 'field',
        targetHandle: 'data:value',
        role: 'data'
      },
      data('field', 'date', 'date'),
      data('date', 'wait', 'at'),
      control('wait', 'out', 'stop')
    ]);
    const now = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z'));
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const run = createProcessRun(definition, { mode: 'entityChanged', entityType: 'project' }, {
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
        id: 'modify',
        kind: 'effect.updateEntity',
        entityType: 'project',
        trigger: { mode: 'manual' },
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', type: { base: 'string' } }],
        inputDefaults: { 'identity.name': 'Renamed' }
      }
    ], ['modify'], []);
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
        'identity.name': 'Renamed'
      }
    }));
  });
});
