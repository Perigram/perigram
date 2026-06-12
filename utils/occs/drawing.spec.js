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

  it('keeps wide-face dimension labels editable and offsets them inside the face', async () => {
    const drawing = await buildOccsDrawingFromFaceCurves([
      {
        node: { id: 'face_1' },
        trapezoid: { defaultLength: 'A', height: 'B' },
        dimensionLabels: { base: 'A', height: 'B' },
        vertices: [[0, 0, 0], [500, 0, 0], [500, 400, 0], [0, 400, 0], [0, 0, 0]],
        boundaryVertices: [[0, 0, 0], [500, 0, 0], [500, 400, 0], [0, 400, 0]]
      }
    ]);
    const dimensionLayer = drawing.layers.find(layer => layer.standardCode === 'dimension.cassette');
    const textPaths = dimensionLayer.paths.filter(path => path.kind === 'text');
    const baseLine = dimensionLayer.paths.find(path => path.id === 'dim_face_1_base_line');
    const heightLine = dimensionLayer.paths.find(path => path.id === 'dim_face_1_height_line');

    expect(textPaths.map(path => path.text)).toEqual(['A', 'B']);
    expect(textPaths.map(path => path.designerControl)).toEqual([
      { nodeId: 'face_1', key: 'defaultLength', value: 'A', dimensionKind: 'base' },
      { nodeId: 'face_1', key: 'height', value: 'B', dimensionKind: 'height' }
    ]);
    expect(baseLine.d).toContain('M 0 0 L 0 -30');
    expect(heightLine.d).toContain('M 0 0 L 30 0');
  });
});
