import { describe, expect, it } from 'vitest';
import {
  createDefaultOccsProfileSketch,
  createDefaultOccsProfileTemplateData,
  createEmptyOccsProfileSketch,
  closeOccsProfileSketchBoundary,
  evaluateOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  adoptOccsProfileBindingParameter,
  renameOccsProfileSketchParameter,
  occProfileEntitiesFromSketch,
  occProfileSectionChainedVertices,
  occProfileSketchFromEntities,
  mergeOccsProfileSketchGeometry,
  occsProfileFromSketch,
  resolveOccsProfileSectionPolygons,
  resolveOccsProfileFacePolygons,
  resolveOccsProfileSketchLayerData,
  upgradeLegacyOccsProfileSketch
} from './profiles.js';

const openChainSketch = () => normalizeOccsProfileSketch({
  parameters: {},
  shapes: [{
    id: 's0',
    type: 'chain',
    op: 'construction',
    closed: false,
    points: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
      { id: 'c', x: 10, y: 10 }
    ],
    edges: [
      { id: 'e0', from: 'a', to: 'b' },
      { id: 'e1', from: 'b', to: 'c' }
    ]
  }]
});

const legacyClosedChain = () => ({
  parameters: {},
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
  closed: true
});

describe('OCCS profile helpers', () => {
  it('creates an empty sketch for blank profile drawing sessions', () => {
    const sketch = createEmptyOccsProfileSketch();
    expect(sketch).toMatchObject({ material: 'positive', shapes: [] });
    expect(normalizeOccsProfileSketch(sketch)).toMatchObject({ shapes: [] });
    expect(normalizeOccsProfileSketch(sketch).parameters).toEqual({});
  });

  it('saves closed operand sets — an open chain alone never saves (owner law: profiles are closed)', () => {
    expect(isOccsProfileSketchSavable(createEmptyOccsProfileSketch())).toBe(false);
    expect(isOccsProfileSketchSavable(openChainSketch())).toBe(false);
    // Reference-only geometry participates in nothing.
    expect(isOccsProfileSketchSavable(normalizeOccsProfileSketch({
      shapes: [{ id: 's0', type: 'circle', op: 'construction', center: [5, 5], diameter: 4 }]
    }))).toBe(false);
    expect(isOccsProfileSketchSavable(createDefaultOccsProfileSketch())).toBe(true);
    expect(isOccsProfileSketchSavable(legacyClosedChain())).toBe(true);
  });

  it('exports a shapes section with per-shape ops and the axis', () => {
    const profile = occsProfileFromSketch(createDefaultOccsProfileSketch());
    expect(profile.section).toMatchObject({
      type: 'shapes',
      open: false,
      axis: { material: 'positive' }
    });
    expect(profile.section.shapes).toHaveLength(2);
    expect(profile.section.shapes[0]).toMatchObject({ kind: 'rect' });
    // The template's corner fillets resolve to arc points in the walk.
    expect(profile.section.shapes[0].vertices.length).toBeGreaterThan(4);
    expect(profile.section.shapes[1]).toMatchObject({ kind: 'circle' });
    expect(profile.sweep).toEqual({ type: 'linear', length: '120' });
  });

  it('normalizes legacy multi-vertex fillets into per-corner fillets', () => {
    const sketch = normalizeOccsProfileSketch({
      ...legacyClosedChain(),
      modifiers: [{ type: 'fillet', vertices: ['a', 'c'], radius: 2 }]
    });
    const chain = sketch.shapes[0];
    expect(chain.modifiers).toEqual([
      { type: 'fillet', vertexId: 'a', radius: 2 },
      { type: 'fillet', vertexId: 'c', radius: 2 }
    ]);
    // The section shape resolves the fillet corners into its vertex walk.
    const sectionShape = occsProfileFromSketch(sketch).section.shapes[0];
    expect(sectionShape.vertices.length).toBeGreaterThan(3);
  });

  it('evaluates expression-bound geometry against the parameter table', () => {
    const sketch = {
      ...createDefaultOccsProfileSketch(),
      parameters: { W: 60, H: 'W/2', R: 0, D: 6, L: 'W*1.5' }
    };
    const evaluated = evaluateOccsProfileSketch(sketch);
    const rect = evaluated.shapes.find(shape => shape.type === 'rect');
    const circle = evaluated.shapes.find(shape => shape.type === 'circle');
    expect(rect).toMatchObject({ center: [30, 15], width: 60, height: 30 });
    expect(circle).toMatchObject({ center: [30, 15], diameter: 6 });

    const profile = occsProfileFromSketch(sketch);
    const rectShape = profile.section.shapes.find(shape => shape.kind === 'rect');
    expect(rectShape.vertices.map(vertex => vertex.map(Math.round))).toEqual([
      [0, 0], [60, 0], [60, 30], [0, 30]
    ]);
    expect(profile.sweep).toMatchObject({ length: '90' });
  });

  it('rejects unresolvable and cyclic expressions at the savable gate', () => {
    const template = createDefaultOccsProfileSketch();
    expect(isOccsProfileSketchSavable({
      ...template,
      shapes: template.shapes.map(shape => (
        shape.type === 'rect' ? { ...shape, width: 'NOPE' } : shape
      ))
    })).toBe(false);
    expect(() => evaluateOccsProfileSketch({
      ...template,
      parameters: { ...template.parameters, W: 'H', H: 'W' }
    })).toThrow(/[Cc]yclic/);
    expect(isOccsProfileSketchSavable(template)).toBe(true);
  });

  it('round-trips an open chain through seeding and extraction without closing it', () => {
    const open = normalizeOccsProfileSketch({
      parameters: { R: 3 },
      shapes: [{
        id: 's0',
        type: 'chain',
        op: 'construction',
        closed: false,
        points: [
          { id: 'p0', x: 0, y: 0 },
          { id: 'p1', x: 20, y: 0 },
          { id: 'p2', x: 20, y: 20 }
        ],
        modifiers: [{ type: 'fillet', vertexId: 'p1', radius: 'R' }]
      }]
    });
    const entities = occProfileEntitiesFromSketch(open);
    expect(entities.some(entity => entity.type === 'ARC')).toBe(true);
    const extracted = occProfileSketchFromEntities(entities, open.parameters);
    const chain = extracted.shapes[0];
    expect(chain).toMatchObject({ type: 'chain', closed: false });
    expect(chain.edges).toHaveLength(open.shapes[0].points.length - 1);
  });

  it('keeps every drawn piece as its own shape — extraction drops nothing', () => {
    const entities = [
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { type: 'LINE', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { type: 'LINE', start: { x: 50, y: 50 }, end: { x: 60, y: 50 } }
    ];
    const sketch = occProfileSketchFromEntities(entities, {});
    const chains = sketch.shapes.filter(shape => shape.type === 'chain');
    expect(chains).toHaveLength(2);
    expect(chains.every(chain => chain.op === 'construction')).toBe(true);
    expect(isOccsProfileSketchSavable(sketch)).toBe(false);

    // A lone arc is its own chain piece.
    const arcOnly = occProfileSketchFromEntities([
      { type: 'ARC', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI }
    ], {});
    expect(arcOnly.shapes).toHaveLength(1);

    // Circles are subtract shapes on a draw, reference shapes on an import.
    const drawn = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 5, y: 5 }, radius: 2 }
    ], {});
    expect(drawn.shapes[0]).toMatchObject({ type: 'circle' });
    const imported = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 5, y: 5 }, radius: 2 }
    ], { reference: true });
    expect(imported.shapes[0]).toMatchObject({ type: 'circle', op: 'construction' });
  });

  it('starts sketches with an empty parameter table — nothing is pre-seeded', () => {
    expect(createEmptyOccsProfileSketch().parameters).toEqual({});
    expect(normalizeOccsProfileSketch({ shapes: [] }).parameters).toEqual({});
    const authored = normalizeOccsProfileSketch({
      shapes: [{ id: 's0', type: 'chain', op: 'construction', points: [{ x: 0, y: 0 }, { x: 'W', y: 0 }] }],
      parameters: { W: 10 }
    });
    expect(authored.parameters).toEqual({ W: 10 });
  });

  it('opens a new profile on the parametric hanger template', () => {
    // What the renderer falls back to for sketch-less workpieces: the
    // template's table carries W/H/R/D/L and its shapes bind to it, so
    // the workpiece row's chips are live from the first render.
    const draft = createDefaultOccsProfileTemplateData();
    const sketch = normalizeOccsProfileSketch(draft.sketch, draft.parameters);
    expect(sketch.parameters).toEqual({ W: 42, H: 28, R: 3, D: 6, L: 120 });
    const rect = sketch.shapes.find(shape => shape.type === 'rect');
    const circle = sketch.shapes.find(shape => shape.type === 'circle');
    expect(rect).toMatchObject({ center: ['W/2', 'H/2'], width: 'W', height: 'H' });
    expect(rect.fillets.map(fillet => fillet.radius)).toEqual(['R', 'R', 'R', 'R']);
    expect(circle).toMatchObject({ center: ['W/2', 'H/2'], diameter: 'D' });
    expect(isOccsProfileSketchSavable(sketch, draft.parameters)).toBe(true);
    expect(occsProfileFromSketch(sketch).sweep).toEqual({ type: 'linear', length: '120' });
  });

  it('detects drawn rectangles and keeps fillet round-trips through corners', () => {
    const sketch = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
      { type: 'LINE', start: { x: 40, y: 0 }, end: { x: 40, y: 20 } },
      { type: 'LINE', start: { x: 40, y: 20 }, end: { x: 0, y: 20 } },
      { type: 'LINE', start: { x: 0, y: 20 }, end: { x: 0, y: 0 } }
    ], {});
    const rect = sketch.shapes[0];
    expect(rect).toMatchObject({
      type: 'rect',
      center: [20, 10],
      width: 40,
      height: 20,
      rotation: 0
    });
    // The same rectangle from any corner and direction extracts to the
    // same settings — canonical order, stable corner labels.
    const corners = [[0, 0], [40, 0], [40, 20], [0, 20]];
    for (let start = 0; start < 4; start += 1) {
      for (const direction of [1, -1]) {
        const walk = Array.from({ length: 4 }, (_, step) => corners[(start + direction * step + 8) % 4]);
        const entities = walk.map((point, index) => ({
          type: 'LINE',
          start: { x: point[0], y: point[1] },
          end: { x: walk[(index + 1) % 4][0], y: walk[(index + 1) % 4][1] }
        }));
        const extracted = occProfileSketchFromEntities(entities, {}).shapes[0];
        expect(extracted).toMatchObject({ type: 'rect', center: [20, 10], width: 40, height: 20, rotation: 0 });
      }
    }
    // The seed emits four corners; a fillet radius authored on a corner
    // comes back as the same corner's fillet after extraction.
    const authored = normalizeOccsProfileSketch({
      ...sketch,
      shapes: sketch.shapes.map(shape => (
        shape.type === 'rect' ? { ...shape, fillets: [{ corner: 1, radius: 5 }] } : shape
      ))
    });
    const entities = occProfileEntitiesFromSketch(authored);
    expect(entities.filter(entity => entity.type === 'ARC')).toHaveLength(1);
    const extracted = occProfileSketchFromEntities(entities, {});
    expect(extracted.shapes[0].fillets).toEqual([{ corner: 1, radius: 5 }]);
  });

  it('tags flattened arc interiors as chord points and keeps corners authored', () => {
    // line — half-circle — line, endpoint to endpoint: the arc's interior
    // flattens to chord points, its endpoints stay authored junctions.
    const sketch = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { type: 'ARC', center: { x: 30, y: 0 }, radius: 10, startAngle: Math.PI, endAngle: Math.PI * 2 },
      { type: 'LINE', start: { x: 40, y: 0 }, end: { x: 60, y: 0 } }
    ], {});
    const points = sketch.shapes[0].points;
    const chords = points.filter(point => point.chord);
    const corners = points.filter(point => !point.chord);
    expect(chords.length).toBeGreaterThan(3);
    expect(corners.map(point => point.id)).toEqual([
      'p0', 'p1', `p${points.length - 2}`, `p${points.length - 1}`
    ]);
  });

  it('upgrades legacy chain sketches: chains become shapes, anchors become the axis', () => {
    const legacy = {
      parameters: { W: 40, H: 20 },
      points: [
        { id: 'p0', x: 0, y: 0 }, { id: 'p1', x: 'W', y: 0 },
        { id: 'p2', x: 'W', y: 'H' }, { id: 'p3', x: 0, y: 'H' }
      ],
      edges: [
        { from: 'p0', to: 'p1' }, { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p3' }, { from: 'p3', to: 'p0' }
      ],
      closed: true,
      holes: [{ id: 'h0', type: 'circle', center: [20, 10], diameter: 5 }]
    };
    const upgraded = normalizeOccsProfileSketch(legacy);
    expect(upgraded.shapes).toHaveLength(2);
    const chain = upgraded.shapes[0];
    expect(chain).toMatchObject({ type: 'chain', closed: true });
    expect(upgraded.shapes[1]).toMatchObject({ type: 'circle', diameter: 5 });

    // An anchored sketch translates so the anchor vertex sits on X=0 —
    // the axis replaces the anchor as the placement basis.
    const anchored = upgradeLegacyOccsProfileSketch({ ...legacy, anchors: { vertexId: 'p2' } });
    const anchoredChain = normalizeOccsProfileSketch(anchored).shapes[0];
    const anchorVertex = anchoredChain.points.find(point => point.id === 'p2');
    expect([anchorVertex.x, anchorVertex.y]).toEqual([0, 0]);
  });

  it('keeps global-bound authoring through the extraction merge', () => {
    const authored = normalizeOccsProfileSketch({
      parameters: { G: 'LEN' },
      shapes: [{
        id: 's0',
        type: 'chain',
        op: 'construction',
        closed: false,
        points: [
          { id: 'a0', x: 0, y: 0 },
          { id: 'a1', x: 'G', y: 0 },
          { id: 'a2', x: 'G', y: 20 }
        ]
      }]
    });
    const extracted = occProfileSketchFromEntities([
      { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 60, y: 0 } },
      { type: 'LINE', start: { x: 60, y: 0 }, end: { x: 60, y: 20 } }
    ], {});
    const merged = mergeOccsProfileSketchGeometry(extracted, authored, { LEN: 60 });
    const chain = merged.shapes[0];
    expect(chain.points.find(point => point.id === 'a1')).toMatchObject({ x: 'G' });
  });

  it('merges by position: unchanged shapes keep authoring, moved ones go numeric', () => {
    const authored = normalizeOccsProfileSketch({
      shapes: [
        { id: 'c1', type: 'circle', center: ['D', 10], diameter: 8 },
        { id: 'r1', type: 'rect', center: [20, 10], width: 'W', height: 10 }
      ],
      parameters: { D: 5, W: 30 }
    });
    const extracted = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 5, y: 10 }, radius: 4 },
      { type: 'LINE', start: { x: 5, y: 5 }, end: { x: 35, y: 5 } },
      { type: 'LINE', start: { x: 35, y: 5 }, end: { x: 35, y: 15 } },
      { type: 'LINE', start: { x: 35, y: 15 }, end: { x: 5, y: 15 } },
      { type: 'LINE', start: { x: 5, y: 15 }, end: { x: 5, y: 5 } }
    ], {});
    const merged = normalizeOccsProfileSketch(mergeOccsProfileSketchGeometry(extracted, authored));
    const circle = merged.shapes.find(shape => shape.id === 'c1');
    const rect = merged.shapes.find(shape => shape.id === 'r1');
    // Unchanged circle keeps its expressions; the unchanged rect keeps
    // its id and bound width.
    expect(circle).toMatchObject({ center: ['D', 10], diameter: 8 });
    expect(rect).toMatchObject({ id: 'r1', width: 'W' });

    // A moved circle matches nothing authored: numeric, fresh op.
    const moved = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 50, y: 50 }, radius: 3 }
    ], {});
    const mergedMoved = mergeOccsProfileSketchGeometry(moved, authored);
    expect(mergedMoved.shapes[0]).toMatchObject({ center: [50, 50], diameter: 6 });

    // Erased authored shapes drop.
    const empty = occProfileSketchFromEntities([], {});
    const mergedEmpty = mergeOccsProfileSketchGeometry(empty, authored);
    expect(mergedEmpty.shapes).toHaveLength(0);
  });

  it('adopts a single unknown identifier at the field\'s evaluated value', () => {
    const sketch = normalizeOccsProfileSketch({
      shapes: [{ id: 's0', type: 'circle', center: [12, 8], diameter: 6 }],
      parameters: {}
    });
    expect(adoptOccsProfileBindingParameter(sketch, 'K', 12, {})).toEqual({ K: 12 });
    expect(adoptOccsProfileBindingParameter(sketch, '12', 12, {})).toEqual({});
    expect(adoptOccsProfileBindingParameter(sketch, 'K', 12, { K: 4 })).toEqual({});
  });

  it('renames a parameter in place, rewriting shape fields as whole identifiers', () => {
    const sketch = normalizeOccsProfileSketch({
      parameters: { W: 30, Other: 1 },
      shapes: [
        { id: 's0', type: 'rect', center: ['W/2', 5], width: 'W', height: 'W-10' }
      ]
    });
    const renamed = renameOccsProfileSketchParameter(sketch, 'W', 'Width');
    expect(Object.keys(renamed.parameters)).toEqual(['Width', 'Other']);
    const rect = renamed.shapes[0];
    expect(rect).toMatchObject({ center: ['Width/2', 5], width: 'Width', height: 'Width-10' });
    // Invalid or colliding names refuse.
    expect(renameOccsProfileSketchParameter(sketch, 'W', 'Other')).toBe(sketch);
    expect(renameOccsProfileSketchParameter(sketch, 'W', '1x')).toBe(sketch);
  });

  it('resolves fillet corners to arc points by their vertex slot', () => {
    const resolved = occProfileSectionChainedVertices({
      open: false,
      type: 'polygon',
      vertices: [[0, 0], [20, 0], [20, 10]],
      modifiers: [{ type: 'fillet', vertexIndex: 1, radius: 100 }]
    });
    // A radius larger than the corner allows clamps to the fillet that
    // fits; the corner resolves to interior arc points.
    expect(resolved.length).toBeGreaterThan(3);
    expect(resolved.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))).toBe(true);
  });

  it('evaluates the ordered steps: the list order is the application order — the standalone section spans the axis freely', async () => {
    const section = occsProfileFromSketch(normalizeOccsProfileSketch({
      shapes: [
        { id: 's0', type: 'rect', center: [20, 0], width: 40, height: 20, rotation: 0 },
        { id: 's1', type: 'circle', center: [20, 0], diameter: 10 }
      ]
    })).section;
    const resolved = await resolveOccsProfileSectionPolygons(section);
    expect(resolved.polygons).toHaveLength(1);
    expect(resolved.holes).toHaveLength(1);

    // A shape crossing the zero axis keeps its full footprint: adds
    // extend the face, the axis never clips them.
    const crossing = await resolveOccsProfileSectionPolygons(
      occsProfileFromSketch(normalizeOccsProfileSketch({
        shapes: [{ id: 's0', type: 'rect', center: [-10, 0], width: 40, height: 20 }]
      })).section
    );
    const xs = crossing.polygons[0].map(vertex => vertex[0]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-30);

    // The face fold: each step applies to the accumulated region — an
    // add beyond the axis grows the base, a subtract cuts it away.
    const face = await resolveOccsProfileFacePolygons(
      occsProfileFromSketch(normalizeOccsProfileSketch({
        shapes: [
          { id: 's0', type: 'rect', op: 'add', center: [30, 0], width: 20, height: 20 },
          { id: 's1', type: 'circle', op: 'subtract', center: [30, 0], diameter: 6 }
        ]
      })).section,
      [[0, -100], [100, -100], [100, 100], [0, 100]]
    );
    expect(face.polygons.length).toBeGreaterThanOrEqual(1);
    expect(face.holes).toHaveLength(1);

    // Reference shapes never participate.
    const referenceOnly = await resolveOccsProfileSectionPolygons(
      occsProfileFromSketch(normalizeOccsProfileSketch({
        shapes: [{ id: 's0', type: 'circle', op: 'construction', center: [10, 0], diameter: 8 }]
      })).section
    );
    expect(referenceOnly.polygons).toHaveLength(0);

    // Polyline sections carry no boolean meaning.
    expect(await resolveOccsProfileSectionPolygons(
      occsProfileFromSketch(openChainSketch()).section
    )).toBeNull();
  });

  it('folds steps in authored order — a subtract followed by an add restores material', async () => {
    const holeThenIsland = occsProfileFromSketch(normalizeOccsProfileSketch({
      shapes: [
        { id: 's0', type: 'rect', op: 'add', center: [20, 0], width: 40, height: 20 },
        { id: 's1', type: 'circle', op: 'subtract', center: [20, 0], diameter: 10 },
        { id: 's2', type: 'circle', op: 'add', center: [20, 0], diameter: 4 }
      ]
    })).section;
    const restored = await resolveOccsProfileSectionPolygons(holeThenIsland);
    // The late add survives inside the cut: an island ring and the hole
    // remainder both live in the result.
    expect(restored.polygons).toHaveLength(2);
    expect(restored.holes).toHaveLength(1);

    const islandThenHole = occsProfileFromSketch(normalizeOccsProfileSketch({
      shapes: [
        { id: 's0', type: 'rect', op: 'add', center: [20, 0], width: 40, height: 20 },
        { id: 's2', type: 'circle', op: 'add', center: [20, 0], diameter: 4 },
        { id: 's1', type: 'circle', op: 'subtract', center: [20, 0], diameter: 10 }
      ]
    })).section;
    const erased = await resolveOccsProfileSectionPolygons(islandThenHole);
    // The same shapes with the subtract last erase the island — the
    // order is the semantics.
    expect(erased.polygons).toHaveLength(1);
    expect(erased.holes).toHaveLength(1);
  });

  it('merges extraction back in authored order — the op sequence survives canvas edits', () => {
    const authored = normalizeOccsProfileSketch({
      shapes: [
        { id: 'r1', type: 'rect', center: [20, 10], width: 30, height: 10 },
        { id: 'c1', type: 'circle', center: [5, 10], diameter: 8 }
      ]
    });
    // Extraction emits circles before chains; the merge must not let
    // that reorder the authored sequence.
    const extracted = occProfileSketchFromEntities([
      { type: 'CIRCLE', center: { x: 5, y: 10 }, radius: 4 },
      { type: 'LINE', start: { x: 5, y: 5 }, end: { x: 35, y: 5 } },
      { type: 'LINE', start: { x: 35, y: 5 }, end: { x: 35, y: 15 } },
      { type: 'LINE', start: { x: 35, y: 15 }, end: { x: 5, y: 15 } },
      { type: 'LINE', start: { x: 5, y: 15 }, end: { x: 5, y: 5 } }
    ], {});
    const merged = normalizeOccsProfileSketch(mergeOccsProfileSketchGeometry(extracted, authored));
    expect(merged.shapes.map(shape => shape.id)).toEqual(['r1', 'c1']);
  });

  it('projects a sketch to preview layerData through the boolean fold', async () => {
    const layers = await resolveOccsProfileSketchLayerData(normalizeOccsProfileSketch({
      shapes: [
        { id: 's0', type: 'rect', center: [20, 0], width: 40, height: 20 },
        { id: 's1', type: 'circle', center: [20, 0], diameter: 10 }
      ]
    }));
    expect(layers).toHaveLength(2);
    expect(layers[0].layer).toBe('cut.outer');
    expect(layers[1].layer).toBe('cut.inner');

    const open = await resolveOccsProfileSketchLayerData(openChainSketch());
    expect(open).toEqual([{ layer: 'cut.inner', coordinates: [[0, 0], [10, 0], [10, 10]] }]);
  });
});
