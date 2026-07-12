import { describe, expect, it } from 'vitest';
import {
  buildCassetteV2ClipperLayout,
  CASSETTE_V2_CUT_OUTER_LAYER,
  CASSETTE_V2_FOLD_ROUTE_LAYER
} from './cassetteV2Clipper.js';

const key = (point) => `${Number(point[0]).toFixed(3)},${Number(point[1]).toFixed(3)}`;

const pathHasSegment = (path, from, to) => {
  const fromKey = key(from);
  const toKey = key(to);

  for (let index = 0; index < path.length - 1; index += 1) {
    const currentKey = key(path[index]);
    const nextKey = key(path[index + 1]);
    if (
      (currentKey === fromKey && nextKey === toKey) ||
      (currentKey === toKey && nextKey === fromKey)
    ) {
      return true;
    }
  }

  return false;
};

const pathsHaveSegment = (paths, from, to) => paths.some(path => pathHasSegment(path, from, to));

describe('cassette v2 clipper layout', () => {
  it('unions adjacent faces into cut.outer and derives the shared edge as fold.route', async () => {
    const layout = await buildCassetteV2ClipperLayout([
      {
        id: 'face_1',
        vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]]
      },
      {
        id: 'face_2',
        vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0], [100, 40, 0]]
      }
    ]);

    expect(CASSETTE_V2_CUT_OUTER_LAYER).toBe('cut.outer');
    expect(CASSETTE_V2_FOLD_ROUTE_LAYER).toBe('fold.route');
    expect(layout.cutOuterPaths).toHaveLength(1);
    expect(layout.foldPaths).toHaveLength(1);
    expect(pathHasSegment(layout.cutOuterPaths[0], [0, 40], [100, 40])).toBe(false);
    expect(pathHasSegment(layout.foldPaths[0], [0, 40], [100, 40])).toBe(true);
  });

  it('keeps only the non-union part of a partially covered face edge as a fold', async () => {
    const layout = await buildCassetteV2ClipperLayout([
      {
        id: 'face_1',
        vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]]
      },
      {
        id: 'face_2',
        vertices: [[75, 40, 0], [25, 40, 0], [25, 70, 0], [75, 70, 0], [75, 40, 0]]
      }
    ]);

    expect(layout.cutOuterPaths).toHaveLength(1);
    expect(layout.foldPaths).toHaveLength(1);
    expect(pathHasSegment(layout.cutOuterPaths[0], [25, 40], [75, 40])).toBe(false);
    expect(pathHasSegment(layout.foldPaths[0], [25, 40], [75, 40])).toBe(true);
    expect(pathHasSegment(layout.foldPaths[0], [0, 40], [100, 40])).toBe(false);
  });

  it('unions area-overlapping closed curves independent of winding and returns internal remnants as folds', async () => {
    const layout = await buildCassetteV2ClipperLayout([
      {
        id: 'face_1',
        vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]]
      },
      {
        id: 'face_2',
        vertices: [[50, 20, 0], [50, 60, 0], [150, 60, 0], [150, 20, 0], [50, 20, 0]]
      }
    ]);

    expect(layout.cutOuterPaths).toHaveLength(1);
    expect(pathsHaveSegment(layout.cutOuterPaths, [50, 20], [100, 20])).toBe(false);
    expect(pathsHaveSegment(layout.foldPaths, [50, 20], [100, 20])).toBe(true);
    expect(pathsHaveSegment(layout.foldPaths, [100, 20], [100, 40])).toBe(true);
    expect(pathsHaveSegment(layout.foldPaths, [100, 40], [50, 40])).toBe(true);
    expect(pathsHaveSegment(layout.foldPaths, [50, 40], [50, 20])).toBe(true);
  });
});
