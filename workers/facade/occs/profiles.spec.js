import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  createEmptyOccsProfileSketch,
  closeOccsProfileSketchBoundary,
  evaluateOccsProfileSketchPreview,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  projectProfileSketchPointFromPrevious
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

  it('round-trips a filleted sketch through CAD entity records', () => {
    const sketch = normalizeOccsProfileSketch({
      points: [
        { id: 'p0', x: 0, y: 0 },
        { id: 'p1', x: 42, y: 0 },
        { id: 'p2', x: 42, y: 28 },
        { id: 'p3', x: 0, y: 28 }
      ],
      holes: [{ id: 'h0', type: 'circle', center: [21, 14], diameter: 6 }],
      closed: true,
      modifiers: [
        { type: 'fillet', vertexId: 'p1', radius: 3 },
        { type: 'fillet', vertexId: 'p3', radius: 5 }
      ],
      constraints: []
    });

    const entities = occProfileEntitiesFromSketch(sketch);
    expect(entities.filter(entity => entity.type === 'ARC')).toHaveLength(2);
    expect(entities.filter(entity => entity.type === 'CIRCLE')).toHaveLength(1);

    const round = occProfileSketchFromEntities(entities);
    expect(round.points.map(point => [point.x, point.y])).toEqual([
      [0, 0],
      [42, 0],
      [42, 28],
      [0, 28]
    ]);
    expect(round.closed).toBe(true);
    expect(round.holes[0]).toMatchObject({ center: [21, 14], diameter: 6 });
    expect(round.modifiers).toEqual([
      { type: 'fillet', vertexId: 'p1', radius: 3 },
      { type: 'fillet', vertexId: 'p3', radius: 5 }
    ]);
  });

  it('chains shuffled line entities into the closed boundary', () => {
    const sketch = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 10, y: 10 }, end: { x: 0, y: 10 } },
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'LINE', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } },
      { type: 'LINE', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } }
    ]);
    expect(sketch.closed).toBe(true);
    expect(sketch.points).toHaveLength(4);
    expect(sketch.points.map(point => [point.x, point.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])).toEqual([
      [0, 0],
      [0, 10],
      [10, 0],
      [10, 10]
    ]);
  });

  it('flattens non-tangent arcs to chords and keeps tangent corners as fillets', () => {
    const tangentCorner = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 39, y: 0 } },
      { type: 'ARC', center: { x: 39, y: 3 }, radius: 3, startAngle: -Math.PI / 2, endAngle: 0 },
      { type: 'LINE', start: { x: 42, y: 3 }, end: { x: 42, y: 28 } },
      { type: 'LINE', start: { x: 42, y: 28 }, end: { x: 0, y: 28 } },
      { type: 'LINE', start: { x: 0, y: 28 }, end: { x: 0, y: 0 } }
    ]);
    expect(tangentCorner.points.map(point => [point.x, point.y])).toEqual([
      [0, 0],
      [42, 0],
      [42, 28],
      [0, 28]
    ]);
    expect(tangentCorner.modifiers).toEqual([
      { type: 'fillet', vertexId: 'p1', radius: 3 }
    ]);

    const kinkedArc = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { type: 'ARC', center: { x: 20, y: 5 }, radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
      { type: 'LINE', start: { x: 20, y: 10 }, end: { x: 0, y: 10 } },
      { type: 'LINE', start: { x: 0, y: 10 }, end: { x: 0, y: 0 } }
    ]);
    expect(kinkedArc.modifiers).toEqual([]);
    expect(kinkedArc.points.length).toBeGreaterThan(4);
  });
});
