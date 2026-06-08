import { describe, expect, it } from 'vitest';
import { buildOccsDrawingFromFaceCurves } from './drawing.js';

describe('OCCS drawing helpers', () => {
  it('maps resolved face curves to DrawingCanvas layers with OCCS standard codes', async () => {
    const drawing = await buildOccsDrawingFromFaceCurves([
      {
        node: { id: 'face_1' },
        vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]],
        boundaryVertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0]]
      },
      {
        node: { id: 'face_2' },
        vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0], [100, 40, 0]],
        boundaryVertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0]]
      }
    ]);

    expect(drawing.layers.map(layer => layer.standardCode)).toEqual([
      'contour.cassette_face',
      'cut.outer',
      'fold.route',
      'dimension.cassette'
    ]);
    expect(drawing.layers[2].paths).toEqual([{
      d: 'M 100 -40 L 0 -40',
      fill: 'none',
      stroke: 'layer'
    }]);
    expect(drawing.layers[3].paths.some(path => path.kind === 'text')).toBe(true);
  });
});
