import { describe, expect, it } from 'vitest';
import { extractCurvesFromDXFLayer, extractNestingPolygons } from './dxf-extractor.js';

const dxfFixture = `0
SECTION
2
ENTITIES
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
ENDSEC
0
EOF
`;

const degeneratePolygonDxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
OUTER
90
2
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
0
ENDSEC
0
EOF
`;

describe('DXF extraction', () => {
  it('extracts closed nesting polygons from the mapped semantic cut layer', () => {
    const polygons = extractNestingPolygons(
      Buffer.from(dxfFixture),
      { OUTER: 'cut.outer' },
      'cut.outer'
    );

    expect(polygons).toHaveLength(1);
    expect(polygons[0].coordinates).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]);
  });

  it('keeps open mapped curves for non-nesting source layer data', () => {
    const curves = extractCurvesFromDXFLayer(Buffer.from(dxfFixture), 'FOLD');

    expect(curves).toMatchObject([{
      coordinates: [[0, 25], [100, 25]],
      typeId: 'LINE'
    }]);
  });

  it('does not extract two-point closed curves as nesting polygons', () => {
    const polygons = extractNestingPolygons(
      Buffer.from(degeneratePolygonDxf),
      { OUTER: 'cut.outer' },
      'cut.outer'
    );

    expect(polygons).toEqual([]);
  });
});
