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
});
