import { describe, expect, it } from 'vitest';
import {
  combineDataPackets,
  createDataPacket,
  crossDataPackets,
  flattenDataPacket,
  graftDataPacket,
  selectDataBranch,
  simplifyDataPacket,
  transposeDataPacket
} from './data-tree.js';

describe('process v3 data trees', () => {
  it('broadcasts an item across an aligned list', () => {
    const result = combineDataPackets([
      createDataPacket(10),
      createDataPacket([1, 2, 3], 'list')
    ], ([left, right]) => left + right);

    expect(result).toEqual({
      shape: 'list',
      branches: [{ path: [], items: [11, 12, 13] }]
    });
  });

  it('broadcasts one branch but requires all other paths and lengths to align', () => {
    const tree = createDataPacket({
      branches: [
        { path: [0], items: [1, 2] },
        { path: [1], items: [3, 4] }
      ]
    }, 'tree');
    const one = createDataPacket([10], 'list');
    expect(combineDataPackets([tree, one], ([left, right]) => left + right)).toEqual({
      shape: 'tree',
      branches: [
        { path: [0], items: [11, 12] },
        { path: [1], items: [13, 14] }
      ]
    });
    expect(() => combineDataPackets([
      tree,
      createDataPacket([10, 20, 30], 'list')
    ], values => values)).toThrow('lengths do not align');
  });

  it('provides explicit structure transforms', () => {
    const list = createDataPacket(['a', 'b'], 'list');
    const grafted = graftDataPacket(list);
    expect(grafted.branches).toEqual([
      { path: [0], items: ['a'] },
      { path: [1], items: ['b'] }
    ]);
    expect(flattenDataPacket(grafted)).toEqual(list);
    expect(selectDataBranch(grafted, [1])).toEqual({
      shape: 'list',
      branches: [{ path: [], items: ['b'] }]
    });
  });

  it('simplifies shared paths, transposes aligned branches, and crosses explicitly', () => {
    const tree = createDataPacket({
      branches: [
        { path: [5, 0], items: [1, 2] },
        { path: [5, 1], items: [3, 4] }
      ]
    }, 'tree');
    expect(simplifyDataPacket(tree).branches.map(branch => branch.path)).toEqual([[0], [1]]);
    expect(transposeDataPacket(tree).branches).toEqual([
      { path: [0], items: [1, 3] },
      { path: [1], items: [2, 4] }
    ]);
    expect(crossDataPackets(
      createDataPacket([1, 2], 'list'),
      createDataPacket(['a', 'b'], 'list')
    ).branches[0].items).toEqual([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]);
  });
});
