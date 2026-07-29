import { describe, expect, it, vi } from 'vitest';
import { createDataPacket } from './data-tree.js';
import { applyPatch, evaluateEntityPredicate, executeProcessDataNode } from './evaluator.js';

describe('process v3 data execution', () => {
  it('broadcasts an item over aligned list values', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.math', operation: 'multiply' },
      { left: createDataPacket([2, 3], 'list'), right: createDataPacket(10) }
    );
    expect(result.branches[0].items).toEqual([20, 30]);
  });

  it('keeps entity predicates declarative and filters in read context', async () => {
    const predicate = { kind: 'field', entityType: 'sheet', path: 'specs.width', operation: 'gte', value: 100 };
    expect(evaluateEntityPredicate(predicate, { specs: { width: 120 } })).toBe(true);
    const queryEntities = vi.fn().mockResolvedValue([{ id: 'wide' }]);
    const result = await executeProcessDataNode(
      { kind: 'read.queryEntities', entityType: 'sheet' },
      { predicate: createDataPacket(predicate) },
      { queryEntities }
    );
    expect(queryEntities).toHaveBeenCalledWith('sheet', predicate);
    expect(result.branches[0].items).toEqual([{ id: 'wide' }]);
  });

  it('builds composable field patches without mutating the source record', async () => {
    const patch = await executeProcessDataNode(
      { kind: 'record.fieldChange', entityType: 'project', path: 'identity.name' },
      { value: createDataPacket('Cutting room') }
    );
    const source = { identity: { name: 'Old' } };
    const result = applyPatch(source, patch.branches[0].items[0]);
    expect(result.identity.name).toBe('Cutting room');
    expect(source.identity.name).toBe('Old');
  });

  it('uses typed in-node defaults when a value socket is not connected', async () => {
    const result = await executeProcessDataNode(
      { kind: 'value.math', operation: 'add', inputDefaults: { right: 30 } },
      { left: createDataPacket(12) }
    );
    expect(result.branches[0].items).toEqual([42]);
  });

  it('uses one logic node for gates and comparisons', async () => {
    const comparison = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'gte' },
      { left: createDataPacket(30), right: createDataPacket(20) }
    );
    const gate = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'and' },
      { left: createDataPacket(true), right: createDataPacket(false) }
    );
    expect(comparison.branches[0].items).toEqual([true]);
    expect(gate.branches[0].items).toEqual([false]);
  });

  it('adds calendar offsets to entity timestamps and compares dates', async () => {
    const shifted = await executeProcessDataNode(
      { kind: 'value.dateTime', operation: 'addDays', inputDefaults: { amount: 30 } },
      { date: createDataPacket('2026-01-01T10:00:00.000Z') }
    );
    const difference = await executeProcessDataNode(
      { kind: 'value.dateTime', operation: 'differenceDays' },
      { left: shifted, right: createDataPacket('2026-01-01T10:00:00.000Z') }
    );
    expect(shifted.branches[0].items).toEqual(['2026-01-31T10:00:00.000Z']);
    expect(difference.branches[0].items).toEqual([30]);
  });

  it('supports unary math, complete gates, and structured text edits', async () => {
    const sqrt = await executeProcessDataNode(
      { kind: 'value.math', operation: 'sqrt' },
      { value: createDataPacket(81) }
    );
    const nand = await executeProcessDataNode(
      { kind: 'value.logic', operation: 'nand' },
      { left: createDataPacket(true), right: createDataPacket(true) }
    );
    const trim = await executeProcessDataNode(
      { kind: 'value.string', operation: 'trim' },
      { value: createDataPacket('  CutKit  ') }
    );
    const substring = await executeProcessDataNode(
      { kind: 'value.string', operation: 'substring' },
      { text: createDataPacket('process'), start: createDataPacket(1), end: createDataPacket(4) }
    );

    expect(sqrt.branches[0].items).toEqual([9]);
    expect(nand.branches[0].items).toEqual([false]);
    expect(trim.branches[0].items).toEqual(['CutKit']);
    expect(substring.branches[0].items).toEqual(['roc']);
  });

  it('returns the requested typed output from entity deconstruction', async () => {
    const result = await executeProcessDataNode(
      {
        id: 'deconstruct',
        kind: 'record.deconstruct',
        fields: ['identity.name', 'status.timestamp']
      },
      { record: createDataPacket({ identity: { name: 'Queue' }, status: { timestamp: '2026-01-01T00:00:00.000Z' } }) },
      { outputId: 'status.timestamp' }
    );

    expect(result.branches[0].items).toEqual(['2026-01-01T00:00:00.000Z']);
  });
});
