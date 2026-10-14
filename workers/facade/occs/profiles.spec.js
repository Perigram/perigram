import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  createEmptyOccsProfileSketch,
  closeOccsProfileSketchBoundary,
  evaluateOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occProfileEntitiesFromSketch,
  occProfileSketchFromEntities,
  occsProfileFromSketch,
  projectProfileSketchPointFromPrevious,
  setOccsProfileSketchClosed
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

  it('saves closed sketches closed and open sketches open with their break points', () => {
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
    // An open chain with at least two points is a saveable open profile.
    expect(isOccsProfileSketchSavable(openSketch)).toBe(true);
    expect(setOccsProfileSketchClosed(openSketch, true)).toMatchObject({
      closed: true,
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }
      ]
    });
    // Choosing open rebuilds the chain without the closing edge and keeps
    // the first and last vertices as the section's break points.
    const reopened = setOccsProfileSketchClosed(setOccsProfileSketchClosed(openSketch, true), false);
    expect(reopened).toMatchObject({ closed: false, edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' }
    ] });
    const openProfile = occsProfileFromSketch(reopened);
    expect(openProfile.section).toMatchObject({
      type: 'polyline',
      open: true,
      breakPoints: [['0', '0'], ['10', '10']]
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

  it('evaluates expression-bound geometry against the parameter table', () => {
    const sketch = {
      ...createDefaultOccsProfileSketch(),
      parameters: { W: 60, H: 'W/2', R: 3, D: 6, L: 'W*1.5' },
      points: [
        { id: 'p0', x: 0, y: 0 },
        { id: 'p1', x: 'W', y: 0 },
        { id: 'p2', x: 'W', y: 'H' },
        { id: 'p3', x: 0, y: 'H' }
      ],
      holes: [{ id: 'h0', type: 'circle', center: ['W/2', 'H/2'], diameter: 'D' }]
    };
    const evaluated = evaluateOccsProfileSketch(sketch);
    expect(evaluated.points.find(point => point.id === 'p2')).toMatchObject({ x: 60, y: 30 });
    expect(evaluated.holes[0]).toMatchObject({ center: [30, 15], diameter: 6 });

    const profile = occsProfileFromSketch(sketch);
    expect(profile.section.vertices).toEqual([['0', '0'], ['60', '0'], ['60', '30'], ['0', '30']]);
    expect(profile.sweep).toMatchObject({ length: '90' });
  });

  it('rejects unresolvable and cyclic expressions at the savable gate', () => {
    const square = createDefaultOccsProfileSketch();
    expect(isOccsProfileSketchSavable({
      ...square,
      points: square.points.map(point => ({ ...point, x: 'NOPE' }))
    })).toBe(false);
    expect(() => evaluateOccsProfileSketch({
      ...square,
      parameters: { ...square.parameters, W: 'H', H: 'W' }
    })).toThrow(/[Cc]yclic/);
    expect(isOccsProfileSketchSavable(square)).toBe(true);
  });

  it('round-trips an open chain through seeding and extraction without closing it', () => {
    const open = setOccsProfileSketchClosed(createDefaultOccsProfileSketch(), false);
    const entities = occProfileEntitiesFromSketch(open);
    expect(entities.some(entity => entity.type === 'ARC')).toBe(true);
    const extracted = occProfileSketchFromEntities(entities, open.parameters);
    expect(extracted).toMatchObject({ closed: false, unchained: 0 });
    expect(extracted.edges).toHaveLength(open.points.length - 1);
  });

  it('records unconnected pieces as unchained and refuses them at the save gate', () => {
    const connected = [
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'LINE', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } }
    ];
    expect(occProfileSketchFromEntities(connected, {}).unchained).toBe(0);

    // A stray segment no chain joins stays visible as model state, and
    // the gate refuses until the user connects or erases it.
    const strays = connected.concat([
      { type: 'LINE', start: { x: 50, y: 50 }, end: { x: 60, y: 50 } }
    ]);
    const sketch = occProfileSketchFromEntities(strays, {});
    expect(sketch.unchained).toBe(1);
    expect(sketch.points).toHaveLength(3); // the longest chain seeds the model
    expect(isOccsProfileSketchSavable(sketch)).toBe(false);
    expect(isOccsProfileSketchSavable({ ...sketch, unchained: 0 })).toBe(true);

    // A lone arc cannot start a chain either.
    expect(occProfileSketchFromEntities([
      { type: 'ARC', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI }
    ], {}).unchained).toBe(1);

    // Circles are holes, not chain pieces: a circles-only import keeps
    // them with an empty chain.
    const holesOnly = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 5, y: 5 }, radius: 2 }
    ], {});
    expect(holesOnly.unchained).toBe(0);
    expect(holesOnly.holes).toHaveLength(1);
  });

  it('starts sketches with an empty parameter table — nothing is pre-seeded', () => {
    expect(createEmptyOccsProfileSketch().parameters).toEqual({});
    expect(normalizeOccsProfileSketch({ points: [], edges: [] }).parameters).toEqual({});
    const authored = normalizeOccsProfileSketch({
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 'W', y: 0 }],
      edges: [{ from: 'a', to: 'b' }],
      parameters: { W: 10 }
    });
    expect(authored.parameters).toEqual({ W: 10 });
  });

  it('tags flattened arc interiors as chord points and keeps corners authored', () => {
    // line — half-circle — line, endpoint to endpoint: the arc's interior
    // flattens to chord points, its endpoints stay authored junctions.
    const sketch = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { type: 'ARC', center: { x: 30, y: 0 }, radius: 10, startAngle: Math.PI, endAngle: Math.PI * 2 },
      { type: 'LINE', start: { x: 40, y: 0 }, end: { x: 60, y: 0 } }
    ], {});
    const chords = sketch.points.filter(point => point.chord);
    const corners = sketch.points.filter(point => !point.chord);
    expect(chords.length).toBeGreaterThan(3);
    // Authored corners: the chain ends plus the two line-arc junctions.
    expect(corners.map(point => point.id)).toEqual([
      'p0', 'p1', `p${sketch.points.length - 2}`, `p${sketch.points.length - 1}`
    ]);
    expect(normalizeOccsProfileSketch(sketch).points.filter(point => point.chord)).toHaveLength(chords.length);
  });

  it('carries a placement basis anchor on closed shapes only', () => {
    const base = createDefaultOccsProfileSketch({ W: 40, H: 20 });
    const square = {
      ...base,
      points: [
        { id: 'p0', x: 0, y: 0 }, { id: 'p1', x: 'W', y: 0 },
        { id: 'p2', x: 'W', y: 'H' }, { id: 'p3', x: 0, y: 'H' }
      ]
    };
    const anchored = normalizeOccsProfileSketch({ ...square, anchors: { vertexId: 'p2' } });
    expect(anchored.anchors).toEqual({ vertexId: 'p2' });
    expect(normalizeOccsProfileSketch({ ...square, anchors: { vertexId: 'nope' } }).anchors).toBeNull();
    expect(occsProfileFromSketch(anchored).section.anchor).toEqual(['40', '20']);
    expect(occsProfileFromSketch(square).section.anchor).toBeUndefined();

    // Open shapes store no anchor — their two anchors derive from the
    // chain's first and last vertices (the break points).
    const open = setOccsProfileSketchClosed({ ...square, anchors: { vertexId: 'p2' } }, false);
    expect(open.anchors).toBeNull();
    expect(normalizeOccsProfileSketch({ ...open, anchors: { startDistance: 5, endDistance: 5 } }).anchors).toBeNull();
    const section = occsProfileFromSketch(open).section;
    expect(section.anchorDistances).toBeUndefined();
    expect(section.breakPoints).toHaveLength(2);
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
