import { describe, expect, it } from 'vitest';
import { createDataPacket } from './data-tree.js';
import { applyPatch, evaluateEntityPredicate, executeProcessDataNode } from './evaluator.js';
import {
  MISSING_FIELD_TAG,
  isMissingField,
  missingFieldMarker,
  serializeProcessResult
} from './missing-field.js';

describe('missing-field marker', () => {
  it('survives the structuredClone calls used by packet operations', () => {
    const marker = missingFieldMarker('identity.reference');
    const cloned = structuredClone(marker);
    expect(isMissingField(marker)).toBe(true);
    expect(isMissingField(cloned)).toBe(true);
    expect(cloned.path).toBe('identity.reference');
  });

  it('is not produced for a present null value', async () => {
    const result = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name' },
      { block: createDataPacket({ name: null }) }
    );
    expect(result.branches[0].items).toEqual([null]);
    expect(isMissingField(result.branches[0].items[0])).toBe(false);
  });

  it('serializes markers to the missing tag and leaves present null untouched', () => {
    const payload = {
      scalar: missingFieldMarker('identity.reference'),
      present: null,
      list: [missingFieldMarker('data.note'), 1, null],
      nested: { deep: { value: missingFieldMarker('lineage.queueId') } }
    };
    const serialized = serializeProcessResult(payload);
    expect(serialized).toEqual({
      scalar: { missing: true, path: 'identity.reference' },
      present: null,
      list: [{ missing: true, path: 'data.note' }, 1, null],
      nested: { deep: { value: { missing: true, path: 'lineage.queueId' } } }
    });
    // No marker key leaks and JSON round-trips without degradation.
    expect(JSON.stringify(serialized)).not.toContain(MISSING_FIELD_TAG);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });
});

describe('missing vs present-nullable field in the evaluator', () => {
  const block = { name: null };

  it('reads a missing path as a marker carrying the read path', async () => {
    const result = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket(block) }
    );
    const value = result.branches[0].items[0];
    expect(isMissingField(value)).toBe(true);
    expect(value.path).toBe('identity.reference');
  });

  it('reads a missing path below a present null as missing, not null', async () => {
    const result = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.name.length' },
      { block: createDataPacket(block) }
    );
    expect(isMissingField(result.branches[0].items[0])).toBe(true);
  });

  it('does not wrap a missing lineage read into a typed entity reference', async () => {
    const result = await executeProcessDataNode(
      {
        kind: 'record.getField',
        block: 'lineage',
        path: 'lineage.queueId',
        compositionMode: 'ancestors',
        type: { base: 'entityRef', shape: 'item', entityType: 'queue' }
      },
      { block: createDataPacket({}) }
    );
    const value = result.branches[0].items[0];
    expect(isMissingField(value)).toBe(true);
  });

  it('distinguishes missing from null in Logic isNull/isNotNull', async () => {
    const field = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket(block) }
    );
    const isNull = await executeProcessDataNode({ kind: 'value.logic', operation: 'isNull' }, { left: field });
    const isNotNull = await executeProcessDataNode({ kind: 'value.logic', operation: 'isNotNull' }, { left: field });
    expect(isNull.branches[0].items).toEqual([false]);
    expect(isNotNull.branches[0].items).toEqual([false]);

    const present = createDataPacket(null);
    const nullCheck = await executeProcessDataNode({ kind: 'value.logic', operation: 'isNull' }, { left: present });
    const notNullCheck = await executeProcessDataNode({ kind: 'value.logic', operation: 'isNotNull' }, { left: present });
    expect(nullCheck.branches[0].items).toEqual([true]);
    expect(notNullCheck.branches[0].items).toEqual([false]);
  });

  it('treats a missing value as absent for Coalesce fallbacks', async () => {
    const field = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket(block) }
    );
    const result = await executeProcessDataNode(
      { kind: 'value.coalesce' },
      { value: field, fallback: createDataPacket('fallback') }
    );
    expect(result.branches[0].items).toEqual(['fallback']);
  });

  it('reports missing and null as distinct Required errors', async () => {
    const missing = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket(block) }
    );
    await expect(executeProcessDataNode({ kind: 'value.required', id: 'req' }, { value: missing }))
      .rejects.toThrow('missing at identity.reference');
    await expect(executeProcessDataNode({ kind: 'value.required', id: 'req' }, { value: createDataPacket(null) }))
      .rejects.toThrow('null required value');
  });

  it('fails required validation on a missing value', async () => {
    const missing = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket(block) }
    );
    await expect(executeProcessDataNode(
      { kind: 'value.validate', required: true },
      { value: missing }
    )).rejects.toThrow('Value is required');
  });

  it('keeps entity predicates on missing paths distinct from null', () => {
    const entity = { identity: { name: null } };
    expect(evaluateEntityPredicate(
      { kind: 'field', path: 'identity.name', operation: 'isNull' }, entity
    )).toBe(true);
    expect(evaluateEntityPredicate(
      { kind: 'field', path: 'identity.reference', operation: 'isNull' }, entity
    )).toBe(false);
    expect(evaluateEntityPredicate(
      { kind: 'field', path: 'identity.reference', operation: 'isNotNull' }, entity
    )).toBe(false);
  });

  it('appends and removes on a missing patch path as if it were absent', () => {
    const appended = applyPatch({ identity: {} }, {
      entityType: 'machine',
      changes: [{ path: 'data.tags', operation: 'append', value: 'a' }]
    });
    expect(appended.data.tags).toEqual(['a']);
    const removed = applyPatch({ identity: {} }, {
      entityType: 'machine',
      changes: [{ path: 'data.tags', operation: 'remove', value: 'a' }]
    });
    expect(removed.data.tags).toEqual([]);
  });

  it('composes a missing entry as absent content instead of writing a marker', async () => {
    const missing = await executeProcessDataNode(
      { kind: 'record.getField', block: 'identity', path: 'identity.reference' },
      { block: createDataPacket({}) }
    );
    const composed = await executeProcessDataNode(
      { kind: 'record.composeBlock', block: 'identity', fields: ['identity.reference'] },
      { 'identity.reference': missing }
    );
    expect(composed.branches[0].items).toEqual([{}]);
  });
});
