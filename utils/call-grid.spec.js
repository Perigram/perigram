import { describe, expect, it } from 'vitest';
import { selectCallGridLayout, sortCallTiles, visuallyStableOrder } from './call-grid.js';

describe('selectCallGridLayout', () => {
  it('picks the smallest layout that fits every participant', () => {
    expect(selectCallGridLayout(1, 800, 600)).toMatchObject({ columns: 1, rows: 1 });
    expect(selectCallGridLayout(4, 800, 600)).toMatchObject({ columns: 2, rows: 2 });
    expect(selectCallGridLayout(9, 800, 600)).toMatchObject({ columns: 3, rows: 3 });
  });

  it('follows the container orientation for the two-tile pair', () => {
    expect(selectCallGridLayout(2, 800, 600)).toMatchObject({ columns: 2, rows: 1 });
    expect(selectCallGridLayout(2, 500, 900)).toMatchObject({ columns: 1, rows: 2 });
  });

  it('falls back to smaller layouts inside their minimum width', () => {
    // 9 participants need 3x3 at >=700px; a narrow pane drops to 2x2 and
    // paginates the rest.
    expect(selectCallGridLayout(9, 1200, 800)).toMatchObject({ columns: 3, rows: 3 });
    expect(selectCallGridLayout(9, 620, 800)).toMatchObject({ columns: 2, rows: 2 });
  });

  it('keeps the biggest layout as the fallback for huge counts', () => {
    expect(selectCallGridLayout(40, 1600, 900)).toMatchObject({ columns: 5, rows: 5 });
  });
});

describe('sortCallTiles', () => {
  const tile = (key, patch = {}) => ({ key, identity: key, isScreen: false, isLocal: false, speaking: false, audioLevel: 0, hasVideo: true, joinedAt: 0, ...patch });

  it('leads with the local camera, then screen shares, then speakers before listeners', () => {
    const ordered = sortCallTiles([
      tile('a'),
      tile('screen', { isScreen: true }),
      tile('me', { isLocal: true }),
      tile('speaker', { speaking: true, audioLevel: 0.8 })
    ]).map(entry => entry.key);
    expect(ordered).toEqual(['me', 'screen', 'speaker', 'a']);
  });

  it('orders silent cameras by speaking recency then join time', () => {
    const ordered = sortCallTiles([
      tile('late-speaker', { lastSpokeAt: 200, joinedAt: 300 }),
      tile('recent-speaker', { lastSpokeAt: 900, joinedAt: 500 }),
      tile('early-quiet', { joinedAt: 100 })
    ]).map(entry => entry.key);
    expect(ordered).toEqual(['recent-speaker', 'late-speaker', 'early-quiet']);
  });
});

describe('visuallyStableOrder', () => {
  it('moves nothing on a pure reorder', () => {
    const current = ['a', 'b', 'c'];
    expect(visuallyStableOrder(current, ['c', 'a', 'b'], 2)).toBe(current);
  });

  it('a new speaker takes the slot of a departed tile on the first page', () => {
    expect(visuallyStableOrder(['a', 'b', 'c', 'd'], ['x', 'b', 'c', 'a'], 2)).toEqual(['x', 'b', 'c', 'a']);
  });

  it('arrivals with free slots append after the survivors', () => {
    expect(visuallyStableOrder(['a', 'b'], ['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c']);
  });
});
