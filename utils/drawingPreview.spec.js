import { describe, expect, it } from 'vitest';
import {
  applyLayerPens,
  normalizeCassetteDrawing,
  normalizeGeometryDrawing
} from './drawingPreview.js';

const cassetteResult = {
  viewBox: '0 0 100 100',
  path: 'M 0 0 L 100 0 L 100 100 Z',
  vertices: [[0, 0], [100, 0], [100, -100]],
  allCurves: [
    { path: 'M 10 10 L 20 10 L 20 20 Z', isExtrusion: true },
    { path: 'M 0 0 L 100 0 L 100 100 Z', isBoundary: true }
  ]
};

describe('drawing preview contract', () => {
  it('normalizes parametric cassette geometry without injecting production layer standards', () => {
    const drawing = normalizeCassetteDrawing(cassetteResult, { params: { A: 100 } });

    expect(drawing.layers).toHaveLength(2);
    expect(drawing.layers[0].name).toBe('geometry');
    expect(drawing.layers[0].standardCode).toBeUndefined();
    expect(drawing.layers[1]).toMatchObject({
      name: 'dimension.cassette',
      standardCode: 'dimension.cassette'
    });
    expect(drawing.layers[1].paths[0]).toMatchObject({
      kind: 'text',
      text: 'A'
    });
    expect(JSON.stringify(drawing)).not.toContain('1_1_FACE');
    expect(JSON.stringify(drawing)).not.toContain('1_3_UNFOLD_BOUNDARY');
  });

  it('uses caller-provided layer metadata for cassette geometry', () => {
    const drawing = normalizeCassetteDrawing(cassetteResult, {
      params: { A: 100 },
      layers: {
        face: { name: 'face-layer', standardCode: 'FACE_STD' },
        boundary: { name: 'boundary-layer', standardCode: 'BOUNDARY_STD' }
      }
    });

    expect(drawing.layers.map(layer => layer.name)).toEqual(['face-layer', 'boundary-layer', 'dimension.cassette']);
    expect(drawing.layers.map(layer => layer.standardCode)).toEqual(['FACE_STD', 'BOUNDARY_STD', 'dimension.cassette']);
  });

  it('preserves designer overlays from layered geometry previews', () => {
    const drawing = normalizeGeometryDrawing({
      viewBox: '0 0 10 10',
      designerFaces: [{ nodeId: 'face_1', d: 'M 0 0 L 10 0 L 10 10 Z' }],
      designerFoldEdges: [{ foldNodeId: 'face_2', angle: '90' }],
      designerSections: { handles: [{ orientation: 'vertical' }], segments: [{ orientation: 'vertical', d: 'M 5 0 L 5 10' }] },
      designerEdges: [{ nodeId: 'face_1', edgeIndex: 0 }],
      foldedPreview: { faces: [{ nodeId: 'face_1' }], folds: [] },
      layers: [{ name: 'geometry', paths: ['M 0 0 L 10 0'] }]
    });

    expect(drawing.designerFaces).toEqual([{ nodeId: 'face_1', d: 'M 0 0 L 10 0 L 10 10 Z' }]);
    expect(drawing.designerFoldEdges).toEqual([{ foldNodeId: 'face_2', angle: '90' }]);
    expect(drawing.designerSections).toEqual({ handles: [{ orientation: 'vertical' }], segments: [{ orientation: 'vertical', d: 'M 5 0 L 5 10' }] });
    expect(drawing.designerEdges).toEqual([{ nodeId: 'face_1', edgeIndex: 0 }]);
    expect(drawing.foldedPreview).toEqual({ faces: [{ nodeId: 'face_1' }], folds: [] });
  });

  it('can prefer baked layerData over stored preview layers for geometry-first previews', () => {
    const drawing = normalizeGeometryDrawing({
      __cutkitPreferLayerData: true,
      data: {
        geometry: {
          preview: {
            viewBox: '0 0 100 50',
            layers: [{ name: 'dimension.cassette', standardCode: 'dimension.cassette', paths: [{ kind: 'text', x: 50, y: 25, text: 'PREVIEW' }] }]
          }
        },
        layerData: [
          {
            layer: 'cut.outer',
            coordinates: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0], [0, 0, 0]]
          }
        ]
      }
    });

    expect(drawing.layers.map(layer => layer.standardCode)).toEqual(['cut.outer']);
  });

  it('normalizes polygon geometry with holes when no layers are stored', () => {
    const drawing = normalizeGeometryDrawing({
      data: {
        geometry: {
          data: {
            polygon: {
              outer: [[0, 0], [100, 0], [100, 50], [0, 50]],
              inner: [[[10, 10], [20, 10], [20, 20], [10, 20]]]
            }
          }
        }
      }
    });

    expect(drawing.viewBox).toBe('-4 -4 108 58');
    expect(drawing.layers).toHaveLength(1);
    expect(drawing.layers[0].paths[0]).toMatchObject({
      fill: 'layer',
      stroke: 'layer',
      fillRule: 'evenodd'
    });
    expect(drawing.layers[0].paths[0].d).toContain('M 0 0 L 100 0 L 100 50 L 0 50 L 0 0 Z');
    expect(drawing.layers[0].paths[0].d).toContain('M 10 10 L 20 10 L 20 20 L 10 20 L 10 10 Z');
  });

  it('normalizes baked cassette layerData into semantic drawing layers', () => {
    const drawing = normalizeGeometryDrawing({
      data: {
        layerData: [
          {
            layer: 'cut.outer',
            coordinates: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0], [0, 0, 0]]
          },
          {
            layer: 'fold.route',
            coordinates: [[10, 0, 0], [10, 50, 0]]
          },
          {
            layer: 'code.cassette_mark',
            geometry: { type: 'text', point: [12, 12], text: 'T-1', fontSize: 8 }
          }
        ]
      }
    });

    expect(drawing.viewBox).toBe('-4 -4 108 58');
    expect(drawing.layers.map(layer => layer.standardCode)).toEqual(['cut.outer', 'fold.route', 'code.cassette_mark']);
    expect(drawing.layers[0].paths[0]).toMatchObject({
      d: 'M 0 0 L 100 0 L 100 50 L 0 50 L 0 0 Z',
      stroke: 'layer'
    });
    expect(drawing.layers[2].paths[0]).toMatchObject({
      kind: 'text',
      text: 'T-1',
      x: 12,
      y: 12
    });
  });

  it('includes baked dimension text points in the preview viewBox', () => {
    const drawing = normalizeGeometryDrawing({
      data: {
        layerData: [
          {
            layer: 'cut.outer',
            coordinates: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0], [0, 0, 0]]
          },
          {
            layer: 'dimension.cassette',
            geometry: {
              type: 'dimension',
              from: [0, 0, 0],
              to: [100, 0, 0],
              text: '100',
              offset: 60
            }
          }
        ]
      }
    });

    expect(drawing.viewBox).toBe('-4 -4 108 79');
    expect(drawing.layers[1].paths[0]).toMatchObject({
      d: 'M 0 0 L 0 60 M 100 0 L 100 60 M 0 60 L 100 60'
    });
    expect(drawing.layers[1].paths[1]).toMatchObject({
      kind: 'text',
      text: '100',
      x: 50,
      y: 71
    });
  });

  it('resolves pens from explicit mapping before layer standard metadata', () => {
    const drawing = applyLayerPens({
      viewBox: '0 0 10 10',
      layers: [{
        name: 'source-layer',
        standardCode: 'BOUNDARY_STD',
        paths: ['M 0 0 L 10 0']
      }]
    }, {
      layerMapping: { 'source-layer': 'MAPPED_STD' },
      standards: [
        { _id: 'boundary-standard', code: 'BOUNDARY_STD', defaultPenId: 'boundary-pen' },
        { _id: 'mapped-standard', code: 'MAPPED_STD', defaultPenId: 'mapped-pen' }
      ],
      pens: [
        { _id: 'boundary-pen', stroke: { color: '#111111', weight: 1, pattern: 'SOLID' } },
        { _id: 'mapped-pen', stroke: { color: '#ff0000', weight: 2, pattern: 'DASHED' } }
      ]
    });

    expect(drawing.layers[0].color).toBe('#ff0000');
    expect(drawing.layers[0].weight).toBe(2);
    expect(drawing.layers[0].dasharray).toBe('5,5');
    expect(drawing.layers[0].standardCode).toBe('MAPPED_STD');
    expect(drawing.layers[0].standardId).toBe('mapped-standard');
    expect(drawing.layers[0].penId).toBe('mapped-pen');
  });

  it('resolves layer standards and pens from canonical DTO data fields', () => {
    const drawing = applyLayerPens({
      viewBox: '0 0 10 10',
      layers: [{
        name: 'fold-route',
        standardCode: 'fold.route',
        paths: ['M 0 0 L 10 0']
      }]
    }, {
      standards: [
        { _id: 'fold-standard', data: { code: 'fold.route', defaultPenId: 'fold-pen' } }
      ],
      pens: [
        { _id: 'fold-pen', data: { stroke: { color: '#0000ff', weight: 0.25, pattern: 'DASHED' } } }
      ]
    });

    expect(drawing.layers[0].color).toBe('#0000ff');
    expect(drawing.layers[0].weight).toBe(0.25);
    expect(drawing.layers[0].dasharray).toBe('5,5');
    expect(drawing.layers[0].standardId).toBe('fold-standard');
    expect(drawing.layers[0].penId).toBe('fold-pen');
  });

  it('preserves explicit layer styling when a standard pen is missing', () => {
    const drawing = applyLayerPens({
      viewBox: '0 0 10 10',
      layers: [{
        name: 'contour.cassette_face',
        standardCode: 'contour.cassette_face',
        color: '#2563eb',
        weight: 2,
        paths: ['M 0 0 L 10 0']
      }]
    }, {
      standards: [
        { _id: 'face-standard', data: { code: 'contour.cassette_face', defaultPenId: 'missing-pen' } }
      ],
      pens: []
    });

    expect(drawing.layers[0].color).toBe('#2563eb');
    expect(drawing.layers[0].weight).toBe(2);
    expect(drawing.layers[0].standardId).toBe('face-standard');
    expect(drawing.layers[0].penId).toBeNull();
  });
});
