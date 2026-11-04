import { describe, expect, it } from 'vitest';
import {
  expandOccsEdgeArray2d,
  expandOccsFaceArray2d,
  linearArrayStarts
} from './patterns.js';

const FACE = [[0, 0], [500, 0], [500, 400], [0, 400]];
const COPY = { minX: 0, maxX: 42, minY: 0, maxY: 28 };

const edgeArray = (x = {}, extra = {}) => ({
  version: 1,
  space: 'edge',
  kind: 'linear',
  binding: 'start',
  x: { mode: 'count', count: '1', step: '0', gap: '0', span: '0', start: '0', end: '0', ...x },
  item: { rotation: '0', orientation: 'fixed', mirrorX: false, mirrorY: false },
  ...extra
});

const gridArray = (x = {}, y = {}, extra = {}) => ({
  version: 1,
  space: 'face',
  kind: 'grid',
  binding: 'start',
  x: { mode: 'count', count: '2', step: '0', gap: '0', span: '0', start: '0', end: '0', ...x },
  y: { mode: 'count', count: '2', step: '0', gap: '0', span: '0', start: '0', end: '0', ...y },
  item: { rotation: '0', orientation: 'fixed', mirrorX: false, mirrorY: false },
  clip: 'none',
  ...extra
});

describe('placement patterns', () => {
  it('distributes whole edge-array copies between the margins', () => {
    const layout = linearArrayStarts({
      edgeLength: 500,
      pattern: edgeArray({ count: '3' }),
      copyLength: 28
    });
    expect(layout.ok).toBe(true);
    expect(layout.starts).toEqual([0, 236, 472]);

    const centred = linearArrayStarts({
      edgeLength: 500,
      pattern: edgeArray({ count: '1' }, { binding: 'center' }),
      copyLength: 28
    });
    expect(centred.starts).toEqual([236]);
  });

  it('refuses a count the edge cannot hold', () => {
    const layout = linearArrayStarts({
      edgeLength: 500,
      pattern: edgeArray({ count: '20' }),
      copyLength: 28
    });
    expect(layout.ok).toBe(false);
    expect(layout.reason).toMatch(/overlaps/);
  });

  it('expands a rectangular face array with padding and steps', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: gridArray(
        { count: '2', start: '20', end: '20' },
        { count: '2', start: '20', end: '20' }
      ),
      copyBounds: COPY
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [point.x, point.y])).toEqual([
      [20, 20], [438, 20], [20, 352], [438, 352]
    ]);
  });

  it('keeps copies that rest flush on the face boundary', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: gridArray(
        { count: '3' },
        { count: '2' }
      ),
      copyBounds: COPY
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [point.x, point.y])).toEqual([
      [0, 0], [229, 0], [458, 0], [0, 372], [229, 372], [458, 372]
    ]);
  });

  it('staggers hex rows by half a column step', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: gridArray(
        { mode: 'span', count: '2', span: '100' },
        { mode: 'span', count: '2', span: '100' },
        { stagger: { enabled: true, axis: 'x', amount: '0' } }
      ),
      copyBounds: COPY
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
        version: 1,
        space: 'face',
        kind: 'radial',
        polar: {
          centerX: '0', centerY: '0', rings: '1', count: '4',
          radius: '100', ringSpacing: '0', startAngle: '0', sweep: '360'
        },
        item: { rotation: '0', orientation: 'fixed', mirrorX: false, mirrorY: false },
        clip: 'none'
      },
      copyBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    });
    expect(layout.ok).toBe(true);
    expect(layout.points.map(point => [Math.round(point.x), Math.round(point.y)])).toEqual([
      [350, 200], [250, 300], [150, 200], [250, 100]
    ]);
  });

  it('refuses a span that does not fit the padded face', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: gridArray(
        { mode: 'span', count: '2', span: '1000' },
        { count: '1' }
      ),
      copyBounds: COPY
    });
    expect(layout.ok).toBe(false);
    expect(layout.reason).toMatch(/span does not fit/);
  });

  it('supports step, gap, and span rules per axis', () => {
    const step = linearArrayStarts({
      edgeLength: 200,
      pattern: edgeArray({ mode: 'step', step: '80' }),
      copyLength: 40
    });
    expect(step.starts).toEqual([0, 80, 160]);

    const gap = linearArrayStarts({
      edgeLength: 200,
      pattern: edgeArray({ mode: 'gap', gap: '20' }),
      copyLength: 40
    });
    expect(gap.starts).toEqual([0, 60, 120]);

    const span = linearArrayStarts({
      edgeLength: 200,
      pattern: edgeArray({ mode: 'span', count: '3', span: '120' }),
      copyLength: 40
    });
    expect(span.starts).toEqual([0, 60, 120]);
  });

  it('rotates the grid frame and suppresses copies by key', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: gridArray(
        { mode: 'span', count: '2', span: '100' },
        { mode: 'span', count: '2', span: '100' },
        {
          frame: { rotation: '90' },
          suppress: ['0:1'],
          clip: 'none'
        }
      ),
      copyBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    });
    expect(layout.ok).toBe(true);
    expect(layout.points).toHaveLength(3);
    expect(layout.skipped).toEqual([{ key: '0:1', reason: 'suppressed' }]);
    expect(layout.points[0].rotation).toBe(0);
  });

  it('places multiple radial rings with radial copy orientation', () => {
    const layout = expandOccsFaceArray2d({
      vertices: FACE,
      pattern: {
        version: 1,
        space: 'face',
        kind: 'radial',
        polar: {
          centerX: '0', centerY: '0', rings: '2', count: '3',
          radius: '60', ringSpacing: '50', startAngle: '0', sweep: '360'
        },
        item: { rotation: '0', orientation: 'radial', mirrorX: false, mirrorY: false },
        clip: 'none'
      },
      copyBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    });
    expect(layout.ok).toBe(true);
    expect(layout.points).toHaveLength(6);
    expect(layout.points.map(point => point.ring)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(Math.round(layout.points[1].x)).toBe(220);
    expect(layout.points[1].rotation).toBeCloseTo(120, 5);
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
