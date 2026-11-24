import { describe, expect, it } from 'vitest';
import {
  createDataTree,
  flattenDataPacket,
  graftDataPacket,
  packetValue,
  simplifyDataPacket,
  solveDataTrees,
  transposeDataPacket
} from './data-tree.js';

describe('process v4 data-tree solver', () => {
  it('uses longest item and branch matching by default', () => {
    const tree = createDataTree({ branches: [
      { path: [0], items: [1, 2, 3] },
      { path: [1], items: [4] }
    ] }, 'tree');
    const short = createDataTree([10, 20], 'list');
    expect(solveDataTrees([
      { tree, access: 'item' },
      { tree: short, access: 'item' }
    ], ([left, right]) => left + right)).toEqual({ branches: [
      { path: [0], items: [11, 22, 23] },
      { path: [1], items: [14, 24] }
    ] });
  });

  it('supports list access independently for every branch', () => {
    const tree = createDataTree({ branches: [
      { path: [0], items: [1, 2, 3] },
      { path: [1], items: [4, 5] }
    ] }, 'tree');
    expect(solveDataTrees([{ tree, access: 'list' }], ([items]) => items.reduce((sum, item) => sum + item, 0)))
      .toEqual({ branches: [{ path: [0], items: [6] }, { path: [1], items: [9] }] });
  });

  it('reads an empty tree as an empty list', () => {
    expect(packetValue({ branches: [] }, 'list')).toEqual([]);
  });

  it('supports shortest and cross matching', () => {
    const left = createDataTree([1, 2, 3], 'list');
    const right = createDataTree(['a', 'b'], 'list');
    expect(solveDataTrees([{ tree: left }, { tree: right }], values => values, { matching: 'shortest' }).branches[0].items)
      .toEqual([[1, 'a'], [2, 'b']]);
    expect(solveDataTrees([{ tree: left }, { tree: right }], values => values, { matching: 'cross' }).branches[0].items)
      .toEqual([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b'], [3, 'a'], [3, 'b']]);
  });

  it('cross matches branches as well as items', () => {
    const left = createDataTree({ branches: [{ path: [0], items: [1] }, { path: [1], items: [2] }] }, 'tree');
    const right = createDataTree({ branches: [{ path: [0], items: ['a'] }, { path: [1], items: ['b'] }] }, 'tree');
    const result = solveDataTrees([{ tree: left }, { tree: right }], values => values, { matching: 'cross' });
    expect(result.branches.flatMap(branch => branch.items)).toEqual([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]);
  });

  it('applies explicit topology transforms', () => {
    const tree = createDataTree({ branches: [
      { path: [5, 0], items: [1, 2] },
      { path: [5, 1], items: [3] }
    ] }, 'tree');
    expect(simplifyDataPacket(tree).branches.map(branch => branch.path)).toEqual([[0], [1]]);
    expect(flattenDataPacket(tree).branches[0].items).toEqual([1, 2, 3]);
    expect(graftDataPacket(createDataTree(['a', 'b'], 'list')).branches.map(branch => branch.path)).toEqual([[0], [1]]);
    expect(transposeDataPacket(tree).branches).toEqual([
      { path: [0], items: [1, 3] },
      { path: [1], items: [2, null] }
    ]);
  });
});
