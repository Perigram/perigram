import { describe, expect, it } from 'vitest';
import { buildLayerPenMap, generateSvgData } from './dxfParser.js';

const lineDxf = `0
SECTION
2
ENTITIES
0
LINE
8
FOLD
10
0
20
25
11
100
21
25
0
LWPOLYLINE
8
OUTER
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
50
10
0
20
50
0
ENDSEC
0
EOF
`;

describe('DXF layer pen mapping', () => {
  it('resolves canonical layer standard DTO fields', () => {
    const result = buildLayerPenMap(
      { SOURCE: 'fold.route' },
      [{ _id: 'std-fold', data: { code: 'fold.route', defaultPenId: 'pen-blue' } }],
      [{ _id: 'pen-blue', data: { stroke: { color: '#0000ff', weight: 0.25, pattern: 'DASHED' } } }]
    );

    expect(result.SOURCE?._id).toBe('pen-blue');
  });

  it('generates visible path data for DXF lines and polylines', async () => {
    const drawing = await generateSvgData(lineDxf);

    expect(drawing.viewBox).toBe('0 -50 100 50');
    expect(drawing.layers.find(layer => layer.name === 'FOLD')?.paths).toEqual(['M 0 -25 L 100 -25']);
    expect(drawing.layers.find(layer => layer.name === 'OUTER')?.paths).toEqual(['M 0 0 L 100 0 L 100 -50 L 0 -50 Z']);
  });
});
