import { describe, expect, it } from 'vitest';
import {
  buildCassetteV2TrapezoidVertices,
  cassetteV2TrapezoidReferenceLength,
  resolveCassetteV2TrapezoidLocalPoints
} from './cassetteV2Trapezoid.js';

describe('cassette v2 trapezoid geometry', () => {
  it('resolves OCCS trapezoid local points with zero default offsets', () => {
    expect(resolveCassetteV2TrapezoidLocalPoints({
      defaultLength: 500,
      height: 400,
      baseStartOffset: 0,
      baseEndOffset: 0,
      topStartOffset: 0,
      topEndOffset: 0
    })).toEqual([
      [0, 0, 0],
      [500, 0, 0],
      [500, 400, 0],
      [0, 400, 0]
    ]);
  });

  it('uses positive offsets to extend points outward and negative offsets inward', () => {
    expect(resolveCassetteV2TrapezoidLocalPoints({
      defaultLength: 100,
      height: 40,
      baseStartOffset: 10,
      baseEndOffset: 15,
      topStartOffset: 5,
      topEndOffset: 8
    })).toEqual([
      [0, 0, 0],
      [125, 0, 0],
      [118, 40, 0],
      [5, 40, 0]
    ]);

    expect(buildCassetteV2TrapezoidVertices({
      defaultLength: 100,
      height: 40,
      baseStartOffset: 10,
      baseEndOffset: 15,
      topStartOffset: 5,
      topEndOffset: 8
    })).toEqual([
      [-10, 0, 0],
      [115, 0, 0],
      [108, 40, 0],
      [-5, 40, 0],
      [-10, 0, 0]
    ]);

    expect(buildCassetteV2TrapezoidVertices({
      defaultLength: 100,
      height: 40,
      baseStartOffset: -10,
      baseEndOffset: -15,
      topStartOffset: -5,
      topEndOffset: -8
    })).toEqual([
      [10, 0, 0],
      [85, 0, 0],
      [92, 40, 0],
      [5, 40, 0],
      [10, 0, 0]
    ]);
  });

  it('places a child trapezoid from the selected parent edge direction', () => {
    const parent = [[0, 0, 0], [500, 0, 0], [500, 400, 0], [0, 400, 0], [0, 0, 0]];
    const child = buildCassetteV2TrapezoidVertices({
      defaultLength: cassetteV2TrapezoidReferenceLength(parent, 2),
      height: 35,
      baseStartOffset: 0,
      baseEndOffset: 0,
      topStartOffset: 0,
      topEndOffset: 0
    }, {
      parentVertices: parent,
      parentEdgeIndex: 2
    });

    expect(child).toEqual([
      [0, 400, 0],
      [500, 400, 0],
      [500, 435, 0],
      [0, 435, 0],
      [0, 400, 0]
    ]);
  });
});
