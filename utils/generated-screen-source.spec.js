import { describe, expect, it } from 'vitest';
import { filterRootSourceItems } from './generated-screen-source.js';

describe('generated screen root sources', () => {
  it('keeps only entities without any declared containment parent', () => {
    const root = { _id: 'root', lineage: {} };
    const designChild = { _id: 'design-child', lineage: { sheetDesignId: 'design-1' } };
    const pileChild = { _id: 'pile-child', lineage: { pileId: 'pile-1' } };

    expect(filterRootSourceItems(
      [root, designChild, pileChild],
      ['sheetDesignId', 'pileId']
    )).toEqual([root]);
  });

  it('does not alter explicitly scoped child-source results', () => {
    const child = { _id: 'child', lineage: { projectId: 'project-1' } };
    expect(filterRootSourceItems([child], [])).toEqual([child]);
  });
});
