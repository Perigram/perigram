import { describe, expect, it } from 'vitest';
import { filterRootSourceItems } from './generated-screen-source.js';

describe('generated screen root sources', () => {
  it('keeps only entities without any declared containment parent', () => {
    const root = { _id: 'root', lineage: {} };
    const designChild = { _id: 'design-child', lineage: { sheetDesignId: 'design-1' } };
    const pileChild = { _id: 'pile-child', lineage: { pileId: 'pile-1' } };

    expect(filterRootSourceItems(
      [root, designChild, pileChild],
      { entityType: 'sheet', rootLineageKeys: ['sheetDesignId', 'pileId'] },
      {
        designs: { source: { entityType: 'sheet_design', mode: 'list' }, items: [{ _id: 'design-1' }] },
        piles: { source: { entityType: 'material_pile', mode: 'list' }, items: [{ _id: 'pile-1' }] }
      },
      [
        { parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' },
        { parentType: 'material_pile', childType: 'sheet', lineageKey: 'pileId' }
      ]
    )).toEqual([root]);
  });

  it('keeps a child as top-level when its parent is not readable', () => {
    const child = { _id: 'child', lineage: { projectId: 'hidden-project' } };
    expect(filterRootSourceItems(
      [child],
      { entityType: 'queue', rootLineageKeys: ['projectId'] },
      { queues: { source: { entityType: 'queue', mode: 'list' }, items: [child] } },
      [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }]
    )).toEqual([child]);
  });

  it('does not alter explicitly scoped child-source results', () => {
    const child = { _id: 'child', lineage: { projectId: 'project-1' } };
    expect(filterRootSourceItems([child], { entityType: 'queue', rootLineageKeys: [] })).toEqual([child]);
  });
});
