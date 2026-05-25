import { describe, expect, it } from 'vitest';
import {
  applyLayerPens,
  normalizeCassetteDrawing
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

    expect(drawing.layers).toHaveLength(1);
    expect(drawing.layers[0].name).toBe('geometry');
    expect(drawing.layers[0].standardCode).toBeUndefined();
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

    expect(drawing.layers.map(layer => layer.name)).toEqual(['face-layer', 'boundary-layer']);
    expect(drawing.layers.map(layer => layer.standardCode)).toEqual(['FACE_STD', 'BOUNDARY_STD']);
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
});
