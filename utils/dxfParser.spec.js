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

const blocksDxf = `0
SECTION
2
BLOCKS
0
BLOCK
2
CORNER
10
0
20
0
0
LINE
8
0
10
0
20
0
11
10
21
0
0
LINE
8
DETAIL
10
0
20
0
11
0
21
10
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
PLACE
2
CORNER
10
50
20
50
41
2
42
2
50
90
0
ENDSEC
0
EOF
`;

const curvesDxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
BULGE
90
2
10
0
20
0
42
1
10
10
20
0
0
SPLINE
8
SPLINE
70
8
71
3
40
0
40
0
40
0
40
0
40
1
40
1
40
1
40
1
10
0
20
0
10
1
20
2
10
3
20
2
10
4
20
0
0
ELLIPSE
8
ELLIPSE
10
50
20
50
11
20
21
0
40
0.5
41
0
42
6.283185307179586
0
TEXT
8
LABEL
10
5
20
5
40
2.5
1
Hello
50
15
0
MTEXT
8
LABEL
10
7
20
7
40
3
1
{\\fSimSun;World}
0
ENDSEC
0
EOF
`;

const offLayerDxf = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
HIDDEN
62
-7
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
HIDDEN
10
0
20
0
11
100
21
0
0
LINE
8
VISIBLE
10
0
20
5
11
100
21
5
0
ENDSEC
0
EOF
`;

const pathPoints = (d) => d.split(' ').filter(token => token && Number.isFinite(Number(token)));

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

describe('DXF preview entity coverage', () => {
  it('flattens INSERT block references through their placement', async () => {
    const drawing = await generateSvgData(blocksDxf);
    const layer = (name) => drawing.layers.find(item => item.name === name);

    // Layer 0 inside the block inherits the insert's layer; the block's
    // own layers stay. At (50,50), doubled scale, 90° rotation: the
    // block's x-axis line lands vertical, the y-axis line horizontal.
    expect(drawing.layers.map(item => item.name).sort()).toEqual(['DETAIL', 'PLACE']);
    expect(layer('PLACE').paths).toEqual(['M 50 -50 L 50 -70']);
    expect(layer('DETAIL').paths).toEqual(['M 50 -50 L 30 -50']);
  });

  it('draws bulges, splines, ellipses and text primitives', async () => {
    const drawing = await generateSvgData(curvesDxf);
    const layer = (name) => drawing.layers.find(item => item.name === name);

    // bulge=1 over a 10-unit chord is the CCW semicircle through model
    // (5,-5); the flipped SVG y stays positive.
    const bulge = pathPoints(String(layer('BULGE').paths[0])).map(Number);
    const bulgeYs = bulge.filter((_, index) => index % 2 === 1);
    expect(Math.max(...bulgeYs)).toBeCloseTo(5, 1);

    // The clamped cubic spline is a Bézier over these controls; its
    // dome peaks at model y=1.5 (SVG y=-1.5) and spans x=0..4.
    const spline = pathPoints(String(layer('SPLINE').paths[0])).map(Number);
    const xs = spline.filter((_, index) => index % 2 === 0);
    const ys = spline.filter((_, index) => index % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.001);
    expect(Math.min(...ys)).toBeCloseTo(-1.5, 2);
    expect(Math.max(...xs)).toBeCloseTo(4, 1);

    // The full ellipse is a closed path.
    expect(layer('ELLIPSE').paths[0]).toMatch(/ Z$/);

    const texts = layer('LABEL').paths;
    expect(texts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: 'Hello', fontSize: 2.5, transform: expect.stringMatching(/rotate\(-14\.9/) })
    ]));
    // MTEXT formatting codes strip to the bare text.
    expect(texts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: 'World' })
    ]));
  });

  it('keeps off layers out of the preview', async () => {
    const drawing = await generateSvgData(offLayerDxf);

    expect(drawing.layers.map(layer => layer.name)).toEqual(['VISIBLE']);
  });
});
