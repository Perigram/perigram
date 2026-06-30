import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  createEmptyOccsProfileSketch,
  closeOccsProfileSketchBoundary,
  evaluateOccsProfileSketchPreview,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occsProfileFromSketch,
  projectProfileSketchPointFromPrevious,
  profileSketchFromDxfText
} from './profiles.js';

describe('OCCS profile helpers', () => {
  it('creates an empty sketch for blank profile drawing sessions', () => {
    const sketch = createEmptyOccsProfileSketch();
    expect(sketch).toMatchObject({
      points: [],
      edges: [],
      holes: [],
      modifiers: [],
      closed: false
    });
    expect(normalizeOccsProfileSketch(sketch)).toMatchObject({
      points: [],
      edges: [],
      holes: [],
      closed: false
    });
  });

  it('prepares a drawn boundary for profile save once it has at least three points', () => {
    expect(isOccsProfileSketchSavable(createEmptyOccsProfileSketch())).toBe(false);
    const openSketch = {
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 0 },
        { id: 'c', x: 10, y: 10 }
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' }
      ],
      closed: false
    };
    expect(isOccsProfileSketchSavable(openSketch)).toBe(true);
    expect(closeOccsProfileSketchBoundary(openSketch)).toMatchObject({
      closed: true,
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }
      ]
    });
    expect(isOccsProfileSketchSavable(createDefaultOccsProfileSketch())).toBe(true);
    expect(isOccsProfileSketchSavable({
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 0 },
        { id: 'c', x: 10, y: 10 }
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }
      ]
    })).toBe(true);
  });

  it('exports a sketch as an OCCS profile section with circle holes and fillets', () => {
    const sketch = createDefaultOccsProfileSketch();
    const profile = occsProfileFromSketch(sketch);

    expect(profile.section).toMatchObject({
      type: 'polygon',
      vertices: [['0', '0'], ['42', '0'], ['42', '28'], ['0', '28']],
      holes: [{ type: 'circle', center: ['21', '14'], diameter: '6' }],
      modifiers: [
        { type: 'fillet', vertexId: 'p0', radius: 3 },
        { type: 'fillet', vertexId: 'p1', radius: 3 },
        { type: 'fillet', vertexId: 'p2', radius: 3 },
        { type: 'fillet', vertexId: 'p3', radius: 3 }
      ]
    });
    expect(profile.sweep).toEqual({ type: 'linear', length: '120' });
  });

  it('normalizes legacy multi-vertex fillets into per-corner fillets', () => {
    const sketch = normalizeOccsProfileSketch({
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 0 },
        { id: 'c', x: 10, y: 10 }
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }
      ],
      modifiers: [{ type: 'fillet', vertices: ['a', 'c'], radius: 2 }]
    });

    expect(sketch.modifiers).toEqual([
      { type: 'fillet', vertexId: 'a', radius: 2 },
      { type: 'fillet', vertexId: 'c', radius: 2 }
    ]);
    expect(occsProfileFromSketch(sketch).section.modifiers).toEqual(sketch.modifiers);
  });

  it('projects the next drawn point by distance along the cursor vector', () => {
    expect(projectProfileSketchPointFromPrevious(
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      10
    )).toEqual({ x: 6, y: 8 });
  });

  it('projects the next drawn point in ortho mode along the dominant axis', () => {
    expect(projectProfileSketchPointFromPrevious(
      { x: 0, y: 0 },
      { x: 30, y: 10 },
      12,
      { ortho: true }
    )).toEqual({ x: 12, y: 0 });
    expect(projectProfileSketchPointFromPrevious(
      { x: 0, y: 0 },
      { x: 10, y: 30 },
      12,
      { ortho: true }
    )).toEqual({ x: 0, y: 12 });
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
