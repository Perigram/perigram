import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  evaluateOccsProfileSketchPreview,
  occsProfileFromSketch,
  profileSketchFromDxfText
} from './profiles.js';

describe('OCCS profile helpers', () => {
  it('exports a sketch as an OCCS profile section with circle holes and fillets', () => {
    const sketch = createDefaultOccsProfileSketch();
    const profile = occsProfileFromSketch(sketch);

    expect(profile.section).toMatchObject({
      type: 'polygon',
      vertices: [['0', '0'], ['42', '0'], ['42', '28'], ['0', '28']],
      holes: [{ type: 'circle', center: ['21', '14'], diameter: '6' }],
      modifiers: [{ type: 'fillet', vertices: ['p0', 'p1', 'p2', 'p3'], radius: 3 }]
    });
    expect(profile.sweep).toEqual({ type: 'linear', length: '120' });
  });

  it('evaluates numeric preview coordinates without a parametric solver', () => {
    const sketch = createDefaultOccsProfileSketch({ W: '50', H: '20', D: '10' });
    const preview = evaluateOccsProfileSketchPreview(sketch);

    expect(preview.points.find(point => point.id === 'p2')).toMatchObject({
      x: 42,
      y: 28,
      xValue: 42,
      yValue: 28
    });
    expect(preview.holes[0]).toMatchObject({
      centerValue: [21, 14],
      diameterValue: 6
    });
  });

  it('imports a closed DXF polyline and circles as profile sketch geometry', () => {
    const dxf = `0
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
40
20
0
10
40
20
20
10
0
20
20
0
CIRCLE
8
HOLES
10
20
20
10
40
5
0
ENDSEC
0
EOF`;
    const sketch = profileSketchFromDxfText(dxf);

    expect(sketch.points.map(point => [point.x, point.y])).toEqual([
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20]
    ]);
    expect(sketch.holes[0]).toMatchObject({
      type: 'circle',
      center: [20, 10],
      diameter: 10
    });
  });
});
