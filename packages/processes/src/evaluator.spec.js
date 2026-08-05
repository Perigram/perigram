import { describe, expect, it, vi } from 'vitest';
import { createDataPacket } from './data-tree.js';
import { applyPatch, evaluateEntityPredicate, executeProcessDataNode } from './evaluator.js';

describe('process v3 data execution', () => {
  it('evaluates current time from the runtime clock when accessed', async () => {
    const now = vi.fn(() => new Date('2026-08-04T12:34:56.000Z'));
    const result = await executeProcessDataNode({ kind: 'source.currentTime' }, {}, { now });

    expect(now).toHaveBeenCalledOnce();
    expect(result.branches[0].items).toEqual(['2026-08-04T12:34:56.000Z']);
  });

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

  it('returns the requested typed block from entity deconstruction', async () => {
    const result = await executeProcessDataNode(
      {
        id: 'deconstruct',
        kind: 'record.deconstruct',
        blocks: ['identity', 'status']
      },
      { entity: createDataPacket({ identity: { name: 'Queue' }, status: { timestamp: '2026-01-01T00:00:00.000Z' } }) },
      { outputId: 'status' }
    );

    expect(result.branches[0].items).toEqual([{ timestamp: '2026-01-01T00:00:00.000Z' }]);
  });

  it('composes and modifies typed blocks without entity field paths leaking into their values', async () => {
    const composed = await executeProcessDataNode(
      { kind: 'record.composeBlock', block: 'identity', fields: ['identity.name', 'identity.slug'] },
      {
        'identity.name': createDataPacket('Queue'),
        'identity.slug': createDataPacket('queue')
      }
    );
    const modified = await executeProcessDataNode(
      { kind: 'record.modifyBlock', block: 'identity', fields: ['identity.name'] },
      {
        block: composed,
        'identity.name': createDataPacket('Cut queue')
      }
    );

    expect(composed.branches[0].items).toEqual([{ name: 'Queue', slug: 'queue' }]);
    expect(modified.branches[0].items).toEqual([{ name: 'Cut queue', slug: 'queue' }]);
  });

  it('packs packet lists into one array-valued block field and unpacks them explicitly', async () => {
    const refs = [{ type: 'queue', id: 'q1' }, { type: 'queue', id: 'q2' }];
    const packed = await executeProcessDataNode(
      { kind: 'collection.packArray' },
      { value: createDataPacket(refs, 'list') }
    );
    const unpacked = await executeProcessDataNode(
      { kind: 'collection.unpackArray' },
      { value: packed }
    );

    expect(packed.branches[0].items).toEqual([refs]);
    expect(unpacked.shape).toBe('list');
    expect(unpacked.branches[0].items).toEqual(refs);
  });

  it('composes lineage keys from typed ancestor references', async () => {
    const composed = await executeProcessDataNode(
      {
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [
          { id: 'organization', key: 'organizationId', entityType: 'organization' },
          { id: 'nesting-run', key: 'runId', entityType: 'nesting_run' }
        ]
      },
      {
        'entry:organization': createDataPacket({ type: 'organization', id: 'org-1' }),
        'entry:nesting-run': createDataPacket({ type: 'nesting_run', id: 'run-1' })
      }
    );
    expect(composed.branches[0].items).toEqual([{
      organizationId: 'org-1',
      runId: 'run-1'
    }]);
  });

  it('composes a socket-derived entity relation', async () => {
    const composed = await executeProcessDataNode({
      kind: 'record.composeBlock',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'library', key: 'library', entityType: 'library', cardinality: 'one' }]
    }, {
      'entry:library': createDataPacket({ type: 'library', id: 'library-1' })
    });
    expect(composed.branches[0].items).toEqual([{
      library: { type: 'library', id: 'library-1' }
    }]);
  });

  it('reads a lineage id back as the declared typed entity reference', async () => {
    const result = await executeProcessDataNode(
      {
        kind: 'record.getField',
        block: 'lineage',
        path: 'lineage.queueId',
        compositionMode: 'ancestors',
        type: { base: 'entityRef', shape: 'item', entityType: 'queue' }
      },
      { block: createDataPacket({ queueId: 'queue-1' }) }
    );
    expect(result.branches[0].items).toEqual([{ type: 'queue', id: 'queue-1' }]);
  });

  it('composes typed named entries for open data blocks', async () => {
    const composed = await executeProcessDataNode(
      {
        kind: 'record.composeBlock',
        block: 'data',
        compositionMode: 'entries',
        entries: [
          { id: 'note', key: 'note', type: { base: 'string', shape: 'item' } },
          { id: 'quantity', key: 'metrics.quantity', type: { base: 'number', shape: 'item' } }
        ]
      },
      {
        'entry:note': createDataPacket('Ready'),
        'entry:quantity': createDataPacket(12)
      }
    );
    expect(composed.branches[0].items).toEqual([{ note: 'Ready', metrics: { quantity: 12 } }]);
  });
});
