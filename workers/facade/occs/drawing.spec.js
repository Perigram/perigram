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
    // Layer names carry the registry production export names, never bare
    // codes — the designer's layer panel speaks the old standard's
    // vocabulary in every drawing mode.
    expect(drawing.layers.map(layer => layer.name)).toEqual([
      '1_1_Лицо_Кассеты',
      '2_1_Обрезь_3,15',
      '3_1_Фрезеровка_90',
      '5_1_Размер_Кассета'
    ]);
    expect(drawing.layers[2].paths).toEqual([{
      d: 'M 100 -40 L 0 -40',
      fill: 'none',
      stroke: 'layer'
    }]);
    expect(drawing.layers[3].paths).toEqual([]);
    expect(drawing.dimensionAnnotations.map(annotation => ({
      nodeId: annotation.nodeId,
      key: annotation.key,
      dimensionKind: annotation.dimensionKind,
      text: annotation.text
    }))).toEqual([
      { nodeId: 'face_1', key: 'defaultLength', dimensionKind: 'base', text: '100' },
      { nodeId: 'face_1', key: 'height', dimensionKind: 'height', text: '40' },
      { nodeId: 'face_2', key: 'defaultLength', dimensionKind: 'base', text: '100' },
      { nodeId: 'face_2', key: 'height', dimensionKind: 'height', text: '30' }
    ]);
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
    const annotations = drawing.dimensionAnnotations;

    expect(dimensionLayer.paths).toEqual([]);
    expect(annotations.map(annotation => annotation.text)).toEqual(['A', 'B']);
    expect(annotations.map(annotation => ({
      nodeId: annotation.nodeId,
      key: annotation.key,
      dimensionKind: annotation.dimensionKind
    }))).toEqual([
      { nodeId: 'face_1', key: 'defaultLength', dimensionKind: 'base' },
      { nodeId: 'face_1', key: 'height', dimensionKind: 'height' }
    ]);
    expect(annotations[0].loc[1]).toBeGreaterThan(0);
    expect(annotations[1].loc[0]).toBeGreaterThan(0);
  });
});
