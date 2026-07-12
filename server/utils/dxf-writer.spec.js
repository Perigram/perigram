import { describe, expect, it } from 'vitest';
import { generateLayeredDxf, svgPathToPolyline } from './dxf-writer.js';

describe('DXF writer', () => {
  it('converts sheet preview paths and OCCS source layers into layered DXF entities', () => {
    const dxf = generateLayeredDxf({
      layers: [
        {
          standardCode: 'contour.material_sheet',
          paths: ['M 0 0 H 500 V 600 H 0 Z']
        }
      ],
      layerData: [
        {
          layer: 'cut.outer',
          coordinates: [[10, 10], [110, 10], [110, 60], [10, 60], [10, 10]]
        },
        {
          layer: 'fold.route',
          coordinates: [[10, 35], [110, 35]]
        },
        {
          layer: 'code.cassette_mark',
          geometry: {
            type: 'text',
            point: [20, 20],
            text: 'Tray A',
            fontSize: 8
          }
        }
      ]
    });

    expect(dxf).toContain('contour.material_sheet');
    expect(dxf).toContain('cut.outer');
    expect(dxf).toContain('fold.route');
    expect(dxf).toContain('code.cassette_mark');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('Tray A');
  });

  it('parses absolute horizontal and vertical path commands', () => {
    const polyline = svgPathToPolyline('M 0 0 H 500 V 600 H 0 Z');

    expect(polyline.closed).toBe(true);
    expect(polyline.points).toEqual([
      [0, 0],
      [500, 0],
      [500, 600],
      [0, 600]
    ]);
  });
});
