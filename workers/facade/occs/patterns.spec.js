import { describe, expect, it } from 'vitest';
import {
  edgeArrayStarts,
  expandOccsEdgeArray2d,
  expandOccsFaceArray2d
} from './patterns.js';

const FACE = [[0, 0], [500, 0], [500, 400], [0, 400]];
const COPY = { minX: 0, maxX: 42, minY: 0, maxY: 28 };

describe('placement patterns', () => {
  it('distributes whole edge-array copies between the margins', () => {
    const layout = edgeArrayStarts({
      edgeLength: 500,
      pattern: { mode: 'count', count: '3' },
      copyLength: 28,
      binding: 'start'
    });
    expect(layout.ok).toBe(true);
    expect(layout.starts).toEqual([0, 236, 472]);

    const centred = edgeArrayStarts({
      edgeLength: 500,
      pattern: { mode: 'count', count: '1' },
      copyLength: 28,
      binding: 'center'
    });
    expect(centred.starts).toEqual([236]);
  });

  it('refuses a count the edge cannot hold', () => {
    const layout = edgeArrayStarts({
      edgeLength: 500,
      pattern: { mode: 'count', count: '20' },
      copyLength: 28,
      binding: 'start'
    });
    expect(layout.ok).toBe(false);
    expect(layout.reason).toMatch(/overlaps/);
  });

  it('expands a rectangular face array with padding and steps', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: {
        type: 'faceArray',
        layout: 'rectangular',
        countX: '2',
        stepX: '0',
        countY: '2',
        stepY: '0',
        paddingX: '20',
        paddingY: '20'
      },
      copyBounds: COPY,
      binding: 'start'
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [point.x, point.y])).toEqual([
      [20, 20], [438, 20], [20, 352], [438, 352]
    ]);
  });

  it('staggers hex rows by half a column step', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: {
        type: 'faceArray',
        layout: 'hex',
        countX: '2',
        stepX: '100',
        countY: '2',
        stepY: '100',
        paddingX: '0',
        paddingY: '0'
      },
      copyBounds: COPY,
      binding: 'start'
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [point.x, point.y])).toEqual([
      [0, 0], [100, 0], [50, 100], [150, 100]
    ]);
  });

  it('places polar copies around the padded face center', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: {
        type: 'faceArray',
        layout: 'polar',
        count: '4',
        radius: '100',
        startAngle: '0',
        sweep: '360'
      },
      copyBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      binding: 'center'
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [Math.round(point.x), Math.round(point.y)])).toEqual([
      [350, 200], [250, 300], [150, 200], [250, 100]
    ]);
  });

  it('refuses a grid that does not fit the padded face', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: {
        type: 'faceArray',
        layout: 'rectangular',
        countX: '10',
        stepX: '80',
        countY: '1',
        stepY: '0',
        paddingX: '0',
        paddingY: '0'
      },
      copyBounds: COPY,
      binding: 'start'
    });
    expect(layout.ok).toBe(false);
    expect(layout.reason).toMatch(/does not fit/);
  });

  it('expands hardware points on the edge binding', () => {
    const layout = expandOccsEdgeArray2d({
      vertices: FACE,
      pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '3' },
      origin: [40, 0],
      binding: 'center',
      copyLength: 0
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => Math.round(point.x))).toEqual([40, 250, 460]);
  });
});
