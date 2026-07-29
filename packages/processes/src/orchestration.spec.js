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
  it('branches, executes an effect once with an idempotency key, and stops', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger' },
      { id: 'condition', kind: 'source.literalItem', value: true, type: { base: 'boolean', shape: 'item' } },
      { id: 'branch', kind: 'control.if' },
      { id: 'effect', kind: 'effect.runCommand', commandId: 'test' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['trigger', 'condition', 'branch', 'effect', 'stop'], [
      control('trigger', 'start', 'branch'),
      data('condition', 'branch', 'condition'),
      control('branch', 'true', 'effect'),
      control('effect', 'success', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect).toHaveBeenCalledOnce();
    expect(executeEffect.mock.calls[0][0].idempotencyKey).toContain(completed.id);
  });

  it('persists a wait boundary and resumes after its wake time', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger' },
      { id: 'duration', kind: 'source.literalItem', value: 'PT5S', type: { base: 'duration', shape: 'item' } },
      { id: 'wait', kind: 'control.waitDuration' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['trigger', 'duration', 'wait', 'stop'], [
      control('trigger', 'start', 'wait'),
      data('duration', 'wait', 'duration'),
      control('wait', 'out', 'stop')
    ]);
    const now = vi.fn()
      .mockReturnValueOnce(new Date('2026-01-01T00:00:00Z'))
      .mockReturnValueOnce(new Date('2026-01-01T00:00:00Z'))
      .mockReturnValueOnce(new Date('2026-01-01T00:00:00Z'))
      .mockReturnValue(new Date('2026-01-01T00:00:06Z'));
    const waiting = await advanceProcessRun(createProcessRun(definition, {}, { now }), definition, { now });
    expect(waiting.status).toBe('waiting');
    const completed = await runProcessUntilSettled(waiting, definition, { now });
    expect(completed.status).toBe('succeeded');
  });

  it('waits for every fork branch at join-all', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger' },
      { id: 'fork', kind: 'control.fork', branches: 2 },
      { id: 'left', kind: 'effect.runCommand', commandId: 'left' },
      { id: 'right', kind: 'effect.runCommand', commandId: 'right' },
      { id: 'join', kind: 'control.joinAll' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['trigger', 'fork', 'left', 'right', 'join', 'stop'], [
      control('trigger', 'start', 'fork'),
      control('fork', 'branch1', 'left'),
      control('fork', 'branch2', 'right'),
      control('left', 'success', 'join'),
      control('right', 'success', 'join'),
      control('join', 'out', 'stop')
    ]);
    const executeEffect = vi.fn().mockResolvedValue({ ok: true });
    const completed = await runProcessUntilSettled(createProcessRun(definition, {}), definition, { executeEffect });
    expect(completed.status).toBe('succeeded');
    expect(executeEffect.mock.calls.map(call => call[0].record.commandId).sort()).toEqual(['left', 'right']);
    expect(completed.steps.filter(step => step.nodeId === 'join')).toHaveLength(2);
  });

  it('executes a structured foreach body with an item scoped to each token', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger' },
      { id: 'items', kind: 'source.literalList', value: [{ n: 1 }, { n: 2 }], type: { base: 'json', shape: 'list' } },
      { id: 'loop', kind: 'control.forEach', type: { base: 'json', shape: 'item' } },
      { id: 'effect', kind: 'effect.runCommand', commandId: 'each' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['trigger', 'items', 'loop', 'effect', 'stop'], [
      control('trigger', 'start', 'loop'),
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
    expect(executeEffect.mock.calls.map(call => call[0].inputs.parameters)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('routes a typed automatic entity event payload into entity data operations', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.entityChangedTrigger', entityType: 'project' },
      { id: 'field', kind: 'record.getField', entityType: 'project', path: 'status.timestamp', fieldSchema: { type: { base: 'dateTime' } } },
      { id: 'date', kind: 'value.dateTime', operation: 'addDays', inputDefaults: { amount: 30 } },
      { id: 'wait', kind: 'control.waitUntil' },
      { id: 'stop', kind: 'control.stopSuccess' }
    ], ['trigger', 'field', 'date', 'wait', 'stop'], [
      control('trigger', 'start', 'wait'),
      {
        id: 'payload-field',
        source: 'trigger',
        sourceHandle: 'data:payload',
        target: 'field',
        targetHandle: 'data:value',
        role: 'data'
      },
      data('field', 'date', 'date'),
      data('date', 'wait', 'at'),
      control('wait', 'out', 'stop')
    ]);
    const currentEntity = vi.fn().mockResolvedValue({ status: { timestamp: '2026-01-01T10:00:00.000Z' } });
    const now = vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00.000Z'));
    const waiting = await advanceProcessRun(
      createProcessRun(definition, { kind: 'control.entityChangedTrigger', entityType: 'project' }, { now }),
      definition,
      { now, data: { currentEntity } }
    );
    expect(waiting.status).toBe('waiting');
    expect(waiting.wakeAt).toBe('2026-01-31T10:00:00.000Z');
    expect(currentEntity).toHaveBeenCalledWith('project');
  });

  it('uses a typed manual event payload instead of an ambient current-entity node', async () => {
    const definition = process([
      { id: 'trigger', kind: 'control.manualTrigger', entityType: 'project' },
      {
        id: 'modify',
        kind: 'effect.updateEntity',
        entityType: 'project',
        fields: ['identity.name'],
        fieldSchemas: [{ path: 'identity.name', type: { base: 'string' } }],
        inputDefaults: { 'identity.name': 'Renamed' }
      }
    ], ['trigger', 'modify'], [
      control('trigger', 'start', 'modify'),
      {
        id: 'payload-modify',
        source: 'trigger',
        sourceHandle: 'data:payload',
        target: 'modify',
        targetHandle: 'data:entity',
        role: 'data'
      }
    ]);
    const entity = { _id: 'project-1', identity: { name: 'Original' } };
    const executeEffect = vi.fn().mockResolvedValue({ ...entity, identity: { name: 'Renamed' } });
    const completed = await runProcessUntilSettled(
      createProcessRun(definition, { kind: 'control.manualTrigger' }),
      definition,
      { executeEffect, data: { currentEntity: vi.fn().mockResolvedValue(entity) } }
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
