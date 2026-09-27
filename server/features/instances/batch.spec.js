import { describe, expect, it } from 'vitest';
import { batchRowDraft, expandBatchRows } from './batch.js';

// The pure halves of the batch construction seam: quantity expansion and
// row → construction-draft projection. The orchestration (access gate,
// mode resolution, construction) is HTTP-path integration owned by the
// route contract in the README.

describe('expandBatchRows', () => {
  it('expands quantity into identical drafts and tracks source row indexes', () => {
    const { drafts, rowIndexes } = expandBatchRows([
      { name: 'A', data: { width: '1200' }, quantity: 3 },
      { name: 'B', data: { width: '400' } }
    ]);
    expect(drafts).toHaveLength(4);
    expect(drafts[0]).toEqual({ name: 'A', data: { width: '1200' } });
    expect(drafts[2]).toEqual({ name: 'A', data: { width: '1200' } });
    expect(rowIndexes).toEqual([0, 0, 0, 1]);
  });

  it('caps a single row quantity', () => {
    const { drafts } = expandBatchRows([{ name: 'A', quantity: 10000 }]);
    expect(drafts).toHaveLength(100);
  });

  it('refuses batches whose expansion exceeds the total cap', () => {
    const rows = Array.from({ length: 6 }, () => ({ name: 'A', quantity: 100 }));
    expect(() => expandBatchRows(rows)).toThrowError(/expands|exceeds|500/i);
  });
});

describe('batchRowDraft', () => {
  const options = {
    declaredFields: new Set(['width', 'template', 'parameters']),
    lineageKey: 'queueId',
    parentId: 'parent-1',
    source: { typeId: 'xlsx-workbook', id: 'wb-1' },
    mode: 'genericCreate',
    mapping: { Width: 'field:width' }
  };

  it('projects fields, stamps the declared parent lineage key, and records import provenance', () => {
    const draft = batchRowDraft({ name: 'Panel', data: { width: '1200' } }, 3, options);
    expect(draft.identity).toEqual({ name: 'Panel' });
    expect(draft.data).toEqual({ width: '1200' });
    expect(draft.lineage).toEqual({ queueId: 'parent-1' });
    expect(draft.provenance.op).toBe('table-import');
    expect(draft.provenance.sources).toEqual([{ type: 'xlsx-workbook', id: 'wb-1' }]);
    expect(draft.provenance.effective).toEqual({ mode: 'genericCreate', mapping: options.mapping });
  });

  it('refuses undeclared fields instead of silently dropping them', () => {
    expect(() => batchRowDraft({ data: { nope: 1 } }, 0, options)).toThrowError(/undeclared field nope/);
  });

  it('keeps row lineage edges beside the stamped parent key and omits empty identity', () => {
    const draft = batchRowDraft({ data: { width: '1' }, lineage: { lot: 'L7' } }, 0, options);
    expect(draft.lineage).toEqual({ lot: 'L7', queueId: 'parent-1' });
    expect(draft.identity).toBeUndefined();
  });

  it('works without parent or source', () => {
    const draft = batchRowDraft({ name: 'X', data: { width: '1' } }, 0, {
      declaredFields: options.declaredFields,
      lineageKey: null,
      parentId: null,
      source: null,
      mode: 'bake',
      mapping: null
    });
    expect(draft.lineage).toBeUndefined();
    expect(draft.provenance.sources).toEqual([]);
    expect(draft.provenance.effective).toEqual({ mode: 'bake' });
  });
});
