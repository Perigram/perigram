import { resolveOccsExpression } from './expressions.js';

export const OCCS_PROFILE_KINDS = Object.freeze([
  'hanger',
  'extruded_profile',
  'generic_profile'
]);

export const OCCS_PROFILE_PROCESSES = Object.freeze([
  'extruded',
  'roll_formed',
  'brake_formed',
  'machined'
]);

export const DEFAULT_OCCS_PROFILE_PARAMETERS = Object.freeze({
  W: 42,
  H: 28,
  R: 3,
  D: 6,
  L: 120
});

// The numeric geometry seed normalize fills MISSING sketch fields with.
// It must stay literal: seeded fields belong to sketches that never
// authored them, and expression-bound seeds would reference identifiers
// those sketches do not carry (evaluation throws). The parametric
// default below is the TEMPLATE path — the profile dialog and the
// sketch-less fallback, whose tables always carry W/H/R/D/L.
const PROFILE_GEOMETRY_SEED = Object.freeze({
  points: [
    { id: 'p0', x: 0, y: 0 },
    { id: 'p1', x: 42, y: 0 },
    { id: 'p2', x: 42, y: 28 },
    { id: 'p3', x: 0, y: 28 }
  ],
  edges: [
    { id: 'e0', type: 'line', from: 'p0', to: 'p1' },
    { id: 'e1', type: 'line', from: 'p1', to: 'p2' },
    { id: 'e2', type: 'line', from: 'p2', to: 'p3' },
    { id: 'e3', type: 'line', from: 'p3', to: 'p0' }
  ],
  holes: [
    { id: 'h0', type: 'circle', center: [21, 14], diameter: 6 }
  ]
});

export const createDefaultOccsProfileSketch = (parameters = {}) => ({
  version: '0.1',
  units: 'mm',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...parameters
  },
  // Parametric by law: the geometry binds to the table (W/H the
  // rectangle, R the corner fillets, D the hole; L resolves the sweep at
  // evaluation), so cassette instance parameters drive it and the
  // workpiece row's chips are live.
  points: [
    { id: 'p0', x: 0, y: 0 },
    { id: 'p1', x: 'W', y: 0 },
    { id: 'p2', x: 'W', y: 'H' },
    { id: 'p3', x: 0, y: 'H' }
  ],
  edges: PROFILE_GEOMETRY_SEED.edges,
  holes: [
    { id: 'h0', type: 'circle', center: ['W/2', 'H/2'], diameter: 'D' }
  ],
  closed: true,
  modifiers: [
    { type: 'fillet', vertexId: 'p0', radius: 'R' },
    { type: 'fillet', vertexId: 'p1', radius: 'R' },
    { type: 'fillet', vertexId: 'p2', radius: 'R' },
    { type: 'fillet', vertexId: 'p3', radius: 'R' }
  ],
  constraints: []
});

export const createEmptyOccsProfileSketch = (parameters = {}) => ({
  version: '0.1',
  units: 'mm',
  parameters: { ...parameters },
  points: [],
  edges: [],
  holes: [],
  closed: false,
  modifiers: [],
  constraints: []
});

// The parameter table starts empty — parameters are added when a sketch
// needs them; nothing is pre-seeded.
export const createDefaultOccsProfileTemplateData = (overrides = {}) => ({
  kind: overrides.kind || 'hanger',
  process: overrides.process || 'extruded',
  parameters: { ...(overrides.parameters || {}) },
  sketch: overrides.sketch || createDefaultOccsProfileSketch(overrides.parameters),
  occsProfile: null
});

const numericValue = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

// Authoring fields carry numbers or expression strings ("W/2", "H-2*R").
// Numeric strings collapse to numbers; anything else stays a string for
// the evaluator. Resolution failures surface at evaluation, never here —
// normalize must accept half-authored sketches.
const sketchValue = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : value.trim();
  }
  return fallback;
};

const normalizePoint = (point = {}, index = 0) => ({
  id: point.id || `p${index}`,
  x: sketchValue(point.x),
  y: sketchValue(point.y),
  // Chord points are the flattened interior of an extracted arc — real
  // geometry, but not authored corners; the editor collapses their runs.
  ...(point.chord ? { chord: true } : {})
});

const normalizeLineEdge = (edge = {}, index = 0) => ({
  id: edge.id || `e${index}`,
  type: 'line',
  from: edge.from,
  to: edge.to
});

const normalizeFilletModifiers = (modifiers = [], pointIds = new Set()) => {
  const filletsByVertex = new Map();
  for (const modifier of modifiers) {
    if (modifier?.type !== 'fillet') continue;
    const radius = sketchValue(modifier.radius, 0);
    const vertices = modifier.vertexId
      ? [modifier.vertexId]
      : Array.isArray(modifier.vertices)
        ? modifier.vertices
        : [];
    for (const vertexId of vertices) {
      if (!pointIds.has(vertexId)) continue;
      filletsByVertex.set(vertexId, { type: 'fillet', vertexId, radius });
    }
  }
  return [...filletsByVertex.values()];
};

export const normalizeOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  // Missing geometry fields fill from the numeric seed — never the
  // parametric default, whose expressions need a table the sketch may
  // not carry.
  const fallback = {
    points: PROFILE_GEOMETRY_SEED.points,
    edges: PROFILE_GEOMETRY_SEED.edges,
    holes: PROFILE_GEOMETRY_SEED.holes,
    parameters: { ...DEFAULT_OCCS_PROFILE_PARAMETERS, ...fallbackParameters }
  };
  const rawParameters = {
    ...(fallbackParameters || {}),
    ...(sketch.parameters || {})
  };
  const parameters = Object.fromEntries(
    Object.entries(rawParameters).map(([key, value]) => [key, sketchValue(value, 0)])
  );
  const points = Array.isArray(sketch.points)
    ? sketch.points.map(normalizePoint)
    : fallback.points;
  const pointIds = new Set(points.map(point => point.id));
  const edgeSource = Array.isArray(sketch.edges)
    ? sketch.edges
    : points.length ? fallback.edges : [];
  const edges = edgeSource
    .filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to))
    .map(normalizeLineEdge);
  const holes = (Array.isArray(sketch.holes) ? sketch.holes : fallback.holes)
    .filter(hole => hole?.type === 'circle')
    .map((hole, index) => ({
      id: hole.id || `h${index}`,
      type: 'circle',
      center: [
        sketchValue(Array.isArray(hole.center) ? hole.center[0] : 0, 0),
        sketchValue(Array.isArray(hole.center) ? hole.center[1] : 0, 0)
      ],
      diameter: sketchValue(hole.diameter, 0)
    }));
  const modifiers = normalizeFilletModifiers(
    Array.isArray(sketch.modifiers) ? sketch.modifiers : fallback.modifiers,
    pointIds
  );
  const closed = typeof sketch.closed === 'boolean'
    ? sketch.closed
    : points.length >= 3 && edges.some(edge => edge.to === points[0]?.id);
  const anchors = normalizeOccsProfileSketchAnchors(sketch.anchors, pointIds, closed);
  // One connected chain is the law: extraction records how many drawn or
  // imported pieces no chain joined; the savable gate refuses while any
  // remain. Authored edits reset it (they rebuild the canvas from the
  // model, which drops the strays).
  const unchained = Number.isInteger(sketch.unchained) && sketch.unchained > 0
    ? sketch.unchained
    : 0;

  return {
    version: sketch.version || '0.1',
    units: sketch.units || 'mm',
    parameters,
    points,
    edges,
    holes,
    closed,
    anchors,
    unchained,
    modifiers,
    constraints: Array.isArray(sketch.constraints) ? sketch.constraints : fallback.constraints
  };
};

// Anchors are the profile's placement basis, a closed-shape construct:
// the chosen vertex lands on the attachment point (and is the origin the
// cut geometry is taken relative to). Open shapes carry no anchor — their
// references are the sketch origin (zero) and the chain's end point.
const normalizeOccsProfileSketchAnchors = (anchors = null, pointIds = new Set(), closed = false) => {
  if (!closed || !anchors || typeof anchors !== 'object') return null;
  return pointIds.has(anchors.vertexId) ? { vertexId: anchors.vertexId } : null;
};

export const isOccsProfileSketchSavable = (sketch = {}, fallbackParameters = {}) => {
  try {
    if (normalizeOccsProfileSketch(sketch, fallbackParameters).unchained > 0) return false;
    const evaluated = evaluateOccsProfileSketch(sketch, fallbackParameters);
    return evaluated.closed
      ? evaluated.points.length >= 3
      : evaluated.points.length >= 2;
  } catch {
    return false;
  }
};

// Resolves every authored expression against the parameter table
// (parameters may reference each other; the engine rejects cycles and
// unknown identifiers). Throws on any unresolvable value — the savable
// check and the editors' save gates turn that into authoring feedback,
// never silent zeros.
export const evaluateOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  // Identifier scope is the full raw table (parameters may reference each
  // other in any order); each value resolves through it, so the engine's
  // cycle detection sees complete chains.
  const parameters = {};
  for (const [key, value] of Object.entries(normalized.parameters)) {
    parameters[key] = resolveOccsExpression(value, normalized.parameters);
  }
  const resolveField = (value, what) => {
    const resolved = resolveOccsExpression(value, parameters);
    if (!Number.isFinite(resolved)) throw new Error(`Invalid OCCS profile ${what}`);
    return Math.round((resolved + Number.EPSILON) * 1000) / 1000;
  };
  return {
    ...normalized,
    parameters,
    points: normalized.points.map(point => ({
      ...point,
      x: resolveField(point.x, `point ${point.id} x`),
      y: resolveField(point.y, `point ${point.id} y`)
    })),
    holes: normalized.holes.map(hole => ({
      ...hole,
      center: [
        resolveField(hole.center[0], `hole ${hole.id} x`),
        resolveField(hole.center[1], `hole ${hole.id} y`)
      ],
      diameter: resolveField(hole.diameter, `hole ${hole.id} diameter`)
    })),
    modifiers: normalized.modifiers.map(modifier => ({
      ...modifier,
      radius: resolveField(modifier.radius, `fillet ${modifier.vertexId}`)
    })),
    anchors: normalized.anchors
  };
};

// Closed sketches close their boundary on save; open sketches keep their
// chain open — their first and last vertices are the break points.
export const closeOccsProfileSketchBoundary = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  if (!normalized.closed || normalized.points.length < 3) return normalized;
  const existingEdges = normalized.edges.filter(edge => edge.type === 'line');
  const edges = normalized.points.map((point, index) => {
    const to = normalized.points[(index + 1) % normalized.points.length]?.id || point.id;
    const existing = existingEdges.find(edge => edge.from === point.id && edge.to === to);
    return existing || {
      id: `e${index}`,
      type: 'line',
      from: point.id,
      to
    };
  }).filter(edge => edge.from !== edge.to);
  return {
    ...normalized,
    closed: true,
    edges
  };
};

export const occsProfileFromSketch = (sketch = {}, options = {}) => {
  const normalized = evaluateOccsProfileSketch(sketch, options.parameters);
  const vertices = [];
  const vertexIds = [];

  for (const point of normalized.points) {
    if (vertexIds.includes(point.id)) continue;
    vertexIds.push(point.id);
    vertices.push([String(point.x), String(point.y)]);
  }

  const closed = normalized.closed && vertices.length >= 3;
  const edgeCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
  const section = {
    type: closed ? 'polygon' : 'polyline',
    open: !closed,
    vertices,
    edges: Array.from({ length: edgeCount }, () => ({ type: 'line' })),
    holes: normalized.holes.map(hole => ({
      type: 'circle',
      center: hole.center.map(value => String(value)),
      diameter: String(hole.diameter)
    })),
    // vertexIndex: the modifier's slot in the section's vertex walk. Point
    // ids are identity, not position — a merged sketch mints fresh ids —
    // so the chain resolver cannot recover the slot from the id string.
    modifiers: normalized.modifiers.map(modifier => {
      const vertexIndex = vertexIds.indexOf(modifier.vertexId);
      return vertexIndex >= 0 ? { ...modifier, vertexIndex } : { ...modifier };
    })
  };
  const anchorPoint = normalized.anchors?.vertexId
    ? normalized.points.find(point => point.id === normalized.anchors.vertexId) || null
    : null;
  if (closed && anchorPoint) {
    section.anchor = [String(anchorPoint.x), String(anchorPoint.y)];
  }
  if (!closed && vertices.length >= 2) {
    // Break points: where an inserted open profile splits the host face.
    section.breakPoints = [
      vertices[0],
      vertices[vertices.length - 1]
    ];
  }

  return {
    section,
    sweep: {
      type: 'linear',
      length: String(resolveOccsExpression(options.length ?? normalized.parameters.L ?? 120, normalized.parameters))
    },
    sketch: normalized
  };
};

// Rebuilds the edge chain for a chosen closure: consecutive pairs for an
// open sketch, closed ring for a closed one. Point coordinates and
// modifiers pass through untouched (expressions included); anchors reset —
// the closure change redefines which anchor shape applies.
export const setOccsProfileSketchClosed = (sketch = {}, closed, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  if (closed) {
    return {
      ...closeOccsProfileSketchBoundary({ ...normalized, closed: true }, fallbackParameters),
      anchors: null
    };
  }
  const edges = [];
  for (let index = 0; index + 1 < normalized.points.length; index += 1) {
    edges.push({
      id: `e${index}`,
      type: 'line',
      from: normalized.points[index].id,
      to: normalized.points[index + 1].id
    });
  }
  return { ...normalized, closed: false, edges, anchors: null };
};

// Adopt-on-bind (owner law 2026-10-15): authoring a single unknown
// identifier into a field creates that parameter WITH the field's
// current value — the geometry never jumps, the evaluation resolves
// immediately (no blank canvas), and the merge law keeps the binding
// because evaluation matches the drawn geometry by construction.
// Existing parameters and non-identifier expressions pass through
// untouched: their formula is the truth and may legitimately move the
// geometry.
export const adoptOccsProfileBindingParameter = (sketch = {}, value, currentValue) => {
  if (typeof value !== 'string') return sketch.parameters || {};
  const identifier = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) return sketch.parameters || {};
  const parameters = sketch.parameters || {};
  if (Object.prototype.hasOwnProperty.call(parameters, identifier)) return parameters;
  if (currentValue === null || currentValue === undefined || currentValue === '') return parameters;
  const numeric = Number(currentValue);
  if (!Number.isFinite(numeric)) return parameters;
  return { ...parameters, [identifier]: numeric };
};


const pointFromDxf = (point = {}) => ({
  x: numericValue(point.x ?? point[0]),
  y: numericValue(point.y ?? point[1])
});

// ── CAD entity records ↔ OCCS profile sketch ─────────────────────────────
//
// The shared normalization between the cassette designer's CAD sketch
// canvas (vendored MLightCAD engine) and the OCCS profile sketch model.
// Records are plain data so the same path serves the browser canvas
// (live database entities mapped to records) and DXF imports:
//   { type: 'LINE',  start: {x,y}, end: {x,y} }
//   { type: 'ARC',   center: {x,y}, radius, startAngle, endAngle }  (radians, CCW)
//   { type: 'CIRCLE', center: {x,y}, radius }
//   { type: 'POLYLINE', vertices: [{x,y}], closed }
// A tangent corner arc between two line segments maps to the sketch's
// fillet modifier (the polygon keeps the theoretical sharp corner);
// every other arc flattens to chords within `chordTolerance` mm.

const CHORD_TOLERANCE_MM = 0.05;
const POINT_EPSILON = 0.001;
const TANGENT_EPSILON = 1e-3;

const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < POINT_EPSILON;

const roundPoint = (point) => ({
  x: Math.round((point.x + Number.EPSILON) * 1000) / 1000,
  y: Math.round((point.y + Number.EPSILON) * 1000) / 1000
});

const arcAnglesTraversed = (arc) => {
  let sweep = (arc.endAngle - arc.startAngle) % (Math.PI * 2);
  if (arc.ccw === false) {
    while (sweep >= 0) sweep -= Math.PI * 2;
    if (sweep <= -Math.PI * 2) sweep += Math.PI * 2;
    return Math.abs(sweep);
  }
  if (sweep < 0) sweep += Math.PI * 2;
  return sweep;
};

const arcPointAt = (arc, angle) => ({
  x: arc.center.x + arc.radius * Math.cos(angle),
  y: arc.center.y + arc.radius * Math.sin(angle)
});

const flattenArcToPoints = (arc, chordTolerance) => {
  const sweep = arcAnglesTraversed(arc);
  const tolerance = Math.min(chordTolerance, arc.radius * 0.5);
  const step = tolerance > 0 && arc.radius > tolerance
    ? 2 * Math.acos(1 - tolerance / arc.radius)
    : Math.PI / 2;
  const count = Math.max(2, Math.ceil(sweep / Math.max(step, 1e-6)));
  const direction = arc.ccw === false ? -1 : 1;
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    points.push(arcPointAt(arc, arc.startAngle + direction * sweep * (index / count)));
  }
  return points;
};

// The section walk every cassette consumer draws: the stored section
// keeps the theoretical sharp corners and its fillet modifiers; this
// pass resolves each authored corner to its tangent arc points (the
// same trim/bisector math and chord tolerance the editor's entity
// seeding uses, radius clamped to the largest arc that fits). Open
// chain ends keep their vertices — fillets need both neighbours.
export const occProfileSectionChainedVertices = (section = {}, chordTolerance = 0.05) => {
  const raw = Array.isArray(section.vertices) ? section.vertices : [];
  const vertices = raw.map(vertex => [Number(vertex?.[0]), Number(vertex?.[1])]);
  if (vertices.length < 2) return vertices;
  const closed = !section.open && section.type !== 'polyline' && vertices.length >= 3;
  const radiusByIndex = new Map();
  for (const modifier of Array.isArray(section.modifiers) ? section.modifiers : []) {
    if (modifier?.type !== 'fillet') continue;
    const index = Number.isInteger(modifier.vertexIndex)
      ? modifier.vertexIndex
      : Number(String(modifier.vertexId ?? '').slice(1));
    const radius = Number(modifier.radius);
    if (Number.isInteger(index) && index >= 0 && index < vertices.length && Number.isFinite(radius) && radius > 0) {
      radiusByIndex.set(index, radius);
    }
  }
  if (!radiusByIndex.size) return vertices;

  const chain = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const radius = radiusByIndex.get(index) || 0;
    const previous = closed ? vertices[(index - 1 + vertices.length) % vertices.length] : vertices[index - 1];
    const next = closed ? vertices[(index + 1) % vertices.length] : vertices[index + 1];
    if (!previous || !next || radius <= 0) {
      chain.push(vertex);
      continue;
    }
    const toPrevious = [previous[0] - vertex[0], previous[1] - vertex[1]];
    const toNext = [next[0] - vertex[0], next[1] - vertex[1]];
    const lengthPrevious = Math.hypot(toPrevious[0], toPrevious[1]);
    const lengthNext = Math.hypot(toNext[0], toNext[1]);
    if (!lengthPrevious || !lengthNext) {
      chain.push(vertex);
      continue;
    }
    const unitPrevious = [toPrevious[0] / lengthPrevious, toPrevious[1] / lengthPrevious];
    const unitNext = [toNext[0] / lengthNext, toNext[1] / lengthNext];
    const cosine = unitPrevious[0] * unitNext[0] + unitPrevious[1] * unitNext[1];
    const interiorAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    if (interiorAngle >= Math.PI - 1e-9 || interiorAngle <= 1e-9) {
      chain.push(vertex);
      continue;
    }
    const trim = Math.min(
      radius / Math.tan(interiorAngle / 2),
      lengthPrevious * 0.49,
      lengthNext * 0.49
    );
    const fittedRadius = trim * Math.tan(interiorAngle / 2);
    const start = [vertex[0] + unitPrevious[0] * trim, vertex[1] + unitPrevious[1] * trim];
    const end = [vertex[0] + unitNext[0] * trim, vertex[1] + unitNext[1] * trim];
    const bisector = [unitPrevious[0] + unitNext[0], unitPrevious[1] + unitNext[1]];
    const bisectorLength = Math.hypot(bisector[0], bisector[1]);
    const centerDistance = fittedRadius / Math.sin(interiorAngle / 2);
    const center = [
      vertex[0] + (bisector[0] / bisectorLength) * centerDistance,
      vertex[1] + (bisector[1] / bisectorLength) * centerDistance
    ];
    const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    const tolerance = Math.min(chordTolerance, fittedRadius * 0.5);
    const step = tolerance > 0 && fittedRadius > tolerance
      ? 2 * Math.acos(1 - tolerance / fittedRadius)
      : Math.PI / 2;
    const count = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-6)));
    chain.push(start);
    for (let step2 = 1; step2 < count; step2 += 1) {
      const angle = startAngle + sweep * (step2 / count);
      chain.push([center[0] + fittedRadius * Math.cos(angle), center[1] + fittedRadius * Math.sin(angle)]);
    }
    chain.push(end);
  }
  return chain;
};

const tangentToFillet = (segment, incoming, outgoing) => {
  // The arc is a fillet modifier only when it runs tangent to the line
  // segment on both ends; the vertex is where the untrimmed lines meet.
  const center = segment.arc.center;
  const startRadial = { x: segment.a.x - center.x, y: segment.a.y - center.y };
  const endRadial = { x: segment.b.x - center.x, y: segment.b.y - center.y };
  // Tangency at an arc endpoint is radial ⟂ travel direction (dot = 0);
  // a radial parallel to the line would mean the line aims at the center.
  const dotWith = (radial, direction) => (
    radial.x * direction.x + radial.y * direction.y
  );
  const incomingDir = {
    x: incoming.b.x - incoming.a.x,
    y: incoming.b.y - incoming.a.y
  };
  const outgoingDir = {
    x: outgoing.b.x - outgoing.a.x,
    y: outgoing.b.y - outgoing.a.y
  };
  if (Math.abs(dotWith(startRadial, incomingDir)) > TANGENT_EPSILON * Math.hypot(incomingDir.x, incomingDir.y) * segment.arc.radius) return null;
  if (Math.abs(dotWith(endRadial, outgoingDir)) > TANGENT_EPSILON * Math.hypot(outgoingDir.x, outgoingDir.y) * segment.arc.radius) return null;
  const denominator = incomingDir.x * outgoingDir.y - incomingDir.y * outgoingDir.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((outgoing.a.x - incoming.a.x) * outgoingDir.y - (outgoing.a.y - incoming.a.y) * outgoingDir.x) / denominator;
  const vertex = {
    x: incoming.a.x + incomingDir.x * t,
    y: incoming.a.y + incomingDir.y * t
  };
  return { vertex: roundPoint(vertex), radius: segment.arc.radius };
};

// Chains free segments (line/arc records) by endpoint connectivity into
// the longest closed loop, or the longest open trail when nothing closes.
const reverseSegment = (segment) => {
  if (segment.type === 'line') return { type: 'line', a: segment.b, b: segment.a };
  return {
    type: 'arc',
    arc: {
      ...segment.arc,
      startAngle: segment.arc.endAngle,
      endAngle: segment.arc.startAngle,
      ccw: segment.arc.ccw === false
    },
    a: segment.b,
    b: segment.a
  };
};

const chainSegments = (segments) => {
  if (!segments.length) return { chain: [], closed: false };
  const best = { chain: [], closed: false };
  for (let seedIndex = 0; seedIndex < segments.length; seedIndex += 1) {
    const used = new Set([seedIndex]);
    const seed = segments[seedIndex];
    let chain = [seed];
    let head = seed.b;
    let tail = seed.a;
    let closed = false;
    const extendOnce = (point, wanted) => {
      for (let index = 0; index < segments.length; index += 1) {
        if (used.has(index)) continue;
        const candidate = segments[index];
        if (samePoint(point, candidate.a)) {
          used.add(index);
          chain.push(wanted === 'head' ? candidate : reverseSegment(candidate));
          return wanted === 'head' ? candidate.b : candidate.a;
        }
        if (samePoint(point, candidate.b)) {
          used.add(index);
          chain.push(wanted === 'head' ? reverseSegment(candidate) : candidate);
          return wanted === 'head' ? candidate.a : candidate.b;
        }
      }
      return null;
    };
    for (;;) {
      if (samePoint(head, tail) && chain.length >= 2) {
        closed = true;
        break;
      }
      const nextHead = extendOnce(head, 'head');
      if (nextHead) {
        head = nextHead;
        continue;
      }
      const nextTail = extendOnce(tail, 'tail');
      if (nextTail) {
        tail = nextTail;
        continue;
      }
      break;
    }
    if (chain.length > best.chain.length || (closed && !best.closed)) {
      best.chain = chain;
      best.closed = closed;
    }
    if (best.closed && best.chain.length === segments.length) break;
  }
  return best;
};

const polylineRecordSegments = (record) => {
  const vertices = record.vertices.map(roundPoint);
  const count = record.closed ? vertices.length : vertices.length - 1;
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    if (!samePoint(a, b)) segments.push({ type: 'line', a, b });
  }
  return segments;
};

const arcRecordToSegment = (record) => {
  const arc = {
    center: roundPoint(record.center),
    radius: numericValue(record.radius),
    startAngle: numericValue(record.startAngle),
    endAngle: numericValue(record.endAngle),
    ccw: true
  };
  return {
    type: 'arc',
    arc,
    a: roundPoint(arcPointAt(arc, arc.startAngle)),
    b: roundPoint(arcPointAt(arc, arc.endAngle))
  };
};

const recordToSegment = (record) => {
  if (record.type === 'LINE') {
    const a = roundPoint(record.start);
    const b = roundPoint(record.end);
    return samePoint(a, b) ? null : { type: 'line', a, b };
  }
  if (record.type === 'ARC') {
    const segment = arcRecordToSegment(record);
    return samePoint(segment.a, segment.b) ? null : segment;
  }
  return null;
};

const chainToSketchGeometry = (chain, closed, chordTolerance) => {
  const total = chain.length;
  const points = [];
  const modifiers = [];

  const emitPoint = (point, chord = false) => {
    if (!points.length || !samePoint(points[points.length - 1], point)) {
      points.push(chord ? { ...point, chord: true } : point);
    }
  };

  // A fillet-eligible arc sits between two line segments and runs tangent
  // to both; it contributes the virtual corner where the untrimmed lines
  // meet, and its smooth tangent points never become polygon vertices.
  const filletAt = new Array(total).fill(null);
  for (let index = 0; index < total; index += 1) {
    const segment = chain[index];
    if (segment.type !== 'arc') continue;
    const hasBothNeighbors = closed || (index > 0 && index < total - 1);
    if (!hasBothNeighbors) continue;
    const previous = chain[(index - 1 + total) % total];
    const next = chain[(index + 1) % total];
    if (previous.type !== 'line' || next.type !== 'line') continue;
    const fillet = tangentToFillet(segment, previous, next);
    if (fillet) filletAt[index] = fillet;
  }

  // chain[0].a is the wraparound junction between the last and first
  // segment; it is a tangent point (not a vertex) when the first segment
  // is itself a fillet arc.
  if (!filletAt[0]) emitPoint(chain[0].a);
  for (let index = 0; index < total; index += 1) {
    const segment = chain[index];
    if (filletAt[index]) {
      emitPoint(filletAt[index].vertex);
      modifiers.push(filletAt[index]);
      continue;
    }
    if (segment.type === 'arc') {
      // Interior chord points only: both endpoints are junction points
      // emitted (or skipped) by the junction rules below.
      const flattened = flattenArcToPoints(segment.arc, chordTolerance).map(roundPoint);
      flattened.slice(0, -1).forEach(point => emitPoint(point, true));
    }
    const isLastSegment = !closed && index === total - 1;
    if (isLastSegment || !filletAt[(index + 1) % total]) {
      emitPoint(segment.b);
    }
  }
  if (closed && points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  return { points, modifiers };
};

export const occProfileSketchFromEntities = (entities = [], options = {}) => {
  const parameters = options.parameters || {};
  const chordTolerance = Number.isFinite(options.chordTolerance)
    ? options.chordTolerance
    : CHORD_TOLERANCE_MM;
  const circles = [];
  const polylines = [];
  const freeSegments = [];

  for (const entity of entities) {
    if (!entity) continue;
    if (entity.type === 'CIRCLE') {
      const radius = numericValue(entity.radius);
      if (radius > 0) circles.push({ center: roundPoint(entity.center), diameter: radius * 2 });
      continue;
    }
    if (entity.type === 'POLYLINE') {
      const vertices = (entity.vertices || []).map(pointFromDxf);
      if (vertices.length >= 2) polylines.push({ vertices, closed: Boolean(entity.closed) });
      continue;
    }
    const segment = recordToSegment(entity);
    if (segment) freeSegments.push(segment);
  }

  let source = null;
  // Entities the chosen source consumed; every other chainable piece
  // (line/arc segment or polyline) is unchained and blocks the save gate.
  let consumed = 0;
  const chainableCount = freeSegments.length + polylines.length;
  const closedPolyline = polylines
    .filter(record => record.closed && record.vertices.length >= 3)
    .sort((left, right) => right.vertices.length - left.vertices.length)[0];
  if (closedPolyline) {
    source = { segments: polylineRecordSegments(closedPolyline), closed: true };
    consumed = 1;
  } else if (freeSegments.length) {
    const chained = chainSegments(freeSegments);
    if (chained.chain.length >= 2 || (chained.chain.length === 1 && chained.chain[0].type === 'line')) {
      source = { segments: chained.chain, closed: chained.closed };
      consumed = chained.chain.length;
    }
  } else if (polylines.length) {
    const fallbackPolyline = polylines.sort((left, right) => right.vertices.length - left.vertices.length)[0];
    source = { segments: polylineRecordSegments(fallbackPolyline), closed: false };
    consumed = 1;
  }
  const unchained = Math.max(0, chainableCount - consumed);

  if (!source) {
    // No chainable geometry: circles still become holes; line pieces
    // that could not start a chain count as unchained.
    return normalizeOccsProfileSketch({
      ...createEmptyOccsProfileSketch(parameters),
      holes: circles.map((circle, index) => ({
        id: `h${index}`,
        type: 'circle',
        center: [circle.center.x, circle.center.y],
        diameter: circle.diameter
      })),
      unchained
    }, parameters);
  }

  const geometry = chainToSketchGeometry(source.segments, source.closed, chordTolerance);
  const points = geometry.points;
  const fillets = geometry.modifiers;
  const pointIds = points.map((_, index) => `p${index}`);
  // A fillet modifier references the polygon vertex nearest the recorded
  // theoretical corner (the corner itself is not a segment endpoint).
  const modifiers = fillets.map((fillet) => {
    let nearest = 0;
    let nearestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - fillet.vertex.x, point.y - fillet.vertex.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    return { type: 'fillet', vertexId: pointIds[nearest], radius: fillet.radius };
  });
  const sketchClosed = source.closed && points.length >= 3;
  const edgeCount = sketchClosed ? points.length : Math.max(0, points.length - 1);
  const edges = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const from = pointIds[index];
    const to = pointIds[(index + 1) % points.length];
    if (from !== to) edges.push({ id: `e${index}`, type: 'line', from, to });
  }

  return normalizeOccsProfileSketch({
    version: '0.1',
    units: 'mm',
    parameters,
    points: points.map((point, index) => ({
      id: pointIds[index],
      x: point.x,
      y: point.y,
      ...(point.chord ? { chord: true } : {})
    })),
    edges,
    holes: circles.map((circle, index) => ({
      id: `h${index}`,
      type: 'circle',
      center: [circle.center.x, circle.center.y],
      diameter: circle.diameter
    })),
    closed: sketchClosed,
    unchained,
    modifiers,
    constraints: []
  }, parameters);
};

// Extraction merges into the authored sketch instead of replacing it: an
// extracted point sitting on an authored point's evaluated position
// (within a rounding epsilon) keeps the authored id, expression
// coordinates, and fillet radius — drawing, importing, or undoing never
// destroys parametric authoring. Moved or new points carry the
// extracted numerics. An authored sketch whose expressions do not
// resolve falls back to the plain extraction (the save gate reports it).
const MERGE_EPSILON_MM = 1e-3;

export const mergeOccsProfileSketchGeometry = (extracted = {}, authored = {}) => {
  let source = null;
  try {
    source = evaluateOccsProfileSketch(authored);
  } catch {
    return extracted;
  }
  const authoredPoints = new Map(
    (Array.isArray(authored.points) ? authored.points : []).map(point => [point.id, point])
  );
  const authoredFillet = new Map(
    (Array.isArray(authored.modifiers) ? authored.modifiers : [])
      .filter(modifier => modifier?.type === 'fillet')
      .map(modifier => [modifier.vertexId, modifier.radius])
  );
  const usedAuthored = new Set();
  const kept = [];
  const points = extracted.points.map((point) => {
    let best = null;
    for (const candidate of source.points) {
      if (usedAuthored.has(candidate.id) || Boolean(candidate.chord) !== Boolean(point.chord)) continue;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= MERGE_EPSILON_MM && (!best || distance < best.distance)) {
        best = { candidate, distance };
      }
    }
    if (!best) return { ...point };
    usedAuthored.add(best.candidate.id);
    kept.push(best.candidate.id);
    const original = authoredPoints.get(best.candidate.id);
    return {
      id: best.candidate.id,
      x: original ? original.x : best.candidate.x,
      y: original ? original.y : best.candidate.y
    };
  });
  // Fresh ids must not collide with the kept authored ids.
  const taken = new Set(points.map(point => point.id));
  let nextId = 0;
  for (const point of points) {
    if (usedAuthored.has(point.id)) continue;
    while (taken.has(`p${nextId}`)) nextId += 1;
    const id = `p${nextId}`;
    taken.add(id);
    point.id = id;
  }
  const idAtIndex = new Map(points.map((point, index) => [index, point.id]));
  const extractedVertexId = (vertexId) => {
    const index = Number(String(vertexId ?? '').slice(1));
    return Number.isInteger(index) ? idAtIndex.get(index) ?? vertexId : vertexId;
  };
  const modifiers = [];
  for (const vertexId of kept) {
    if (authoredFillet.has(vertexId)) {
      modifiers.push({ type: 'fillet', vertexId, radius: authoredFillet.get(vertexId) });
    }
  }
  for (const modifier of extracted.modifiers) {
    if (!modifier || modifier.type !== 'fillet') continue;
    const vertexId = extractedVertexId(modifier.vertexId);
    if (kept.includes(vertexId)) continue;
    modifiers.push({ ...modifier, vertexId });
  }
  const authoredHoles = (Array.isArray(authored.holes) ? authored.holes : []);
  const usedHoles = new Set();
  const holes = extracted.holes.map((hole, index) => {
    let best = null;
    source.holes.forEach((candidate, at) => {
      if (usedHoles.has(at)) return;
      const distance = Math.hypot(candidate.center[0] - hole.center[0], candidate.center[1] - hole.center[1]);
      if (distance <= MERGE_EPSILON_MM
        && Math.abs(candidate.diameter - hole.diameter) <= MERGE_EPSILON_MM
        && (!best || distance < best.distance)) best = { at, distance };
    });
    if (!best) return { ...hole, id: `h${index}` };
    usedHoles.add(best.at);
    const original = authoredHoles[best.at];
    return {
      id: original?.id ?? `h${index}`,
      type: 'circle',
      center: original ? original.center : hole.center,
      diameter: original ? original.diameter : hole.diameter
    };
  });
  return { ...extracted, points, holes, modifiers };
};

// Rebuilds CAD entity records from a sketch so the canvas can seed with
// the exact geometry: the boundary becomes discrete line segments with a
// tangent arc at every fillet corner, holes become circles. This is the
// deterministic inverse of `occProfileSketchFromEntities`' fillet path.
// Expression-bound fields evaluate against the parameter table first —
// an unresolvable expression throws (callers gate on savable).
export const occProfileEntitiesFromSketch = (sketch = {}, options = {}) => {
  const normalized = evaluateOccsProfileSketch(sketch, options.parameters);
  const entities = [];
  const filletByVertexId = new Map(
    normalized.modifiers.map(modifier => [modifier.vertexId, Math.max(0, modifier.radius)])
  );
  const vertices = normalized.points.map(point => ({ x: point.x, y: point.y }));
  const corners = [];
  const closed = normalized.closed && vertices.length >= 3;

  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index];
    const previous = closed ? vertices[(index - 1 + vertices.length) % vertices.length] : vertices[index - 1];
    const next = closed ? vertices[(index + 1) % vertices.length] : vertices[index + 1];
    const isFirstOpenEnd = !closed && index === 0;
    const isLastOpenEnd = !closed && index === vertices.length - 1;
    const radius = filletByVertexId.get(normalized.points[index].id) || 0;
    if (!previous || !next || isFirstOpenEnd || isLastOpenEnd || radius <= 0) {
      corners.push({ vertex, radius: 0 });
      continue;
    }
    const toPrevious = { x: previous.x - vertex.x, y: previous.y - vertex.y };
    const toNext = { x: next.x - vertex.x, y: next.y - vertex.y };
    const lengthPrevious = Math.hypot(toPrevious.x, toPrevious.y);
    const lengthNext = Math.hypot(toNext.x, toNext.y);
    if (!lengthPrevious || !lengthNext) {
      corners.push({ vertex, radius: 0 });
      continue;
    }
    const unitPrevious = { x: toPrevious.x / lengthPrevious, y: toPrevious.y / lengthPrevious };
    const unitNext = { x: toNext.x / lengthNext, y: toNext.y / lengthNext };
    const cosine = unitPrevious.x * unitNext.x + unitPrevious.y * unitNext.y;
    const interiorAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    if (interiorAngle >= Math.PI - TANGENT_EPSILON || interiorAngle <= TANGENT_EPSILON) {
      corners.push({ vertex, radius: 0 });
      continue;
    }
    const tangentDistance = radius / Math.tan(interiorAngle / 2);
    const trim = Math.min(
      tangentDistance,
      lengthPrevious * 0.49,
      lengthNext * 0.49
    );
    // A radius larger than the adjacent segments allow clamps to the
    // largest fillet that fits: the arc is derived from the trimmed
    // tangent points, so it stays tangent to both segments and
    // extraction maps it back to the fillet instead of flattening it
    // into chords.
    const fittedRadius = trim * Math.tan(interiorAngle / 2);
    const start = { x: vertex.x + unitPrevious.x * trim, y: vertex.y + unitPrevious.y * trim };
    const end = { x: vertex.x + unitNext.x * trim, y: vertex.y + unitNext.y * trim };
    const bisector = {
      x: unitPrevious.x + unitNext.x,
      y: unitPrevious.y + unitNext.y
    };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    const centerDistance = fittedRadius / Math.sin(interiorAngle / 2);
    const center = {
      x: vertex.x + (bisector.x / bisectorLength) * centerDistance,
      y: vertex.y + (bisector.y / bisectorLength) * centerDistance
    };
    corners.push({
      vertex,
      radius: fittedRadius,
      trim,
      start,
      end,
      center
    });
  }

  const emitEdge = (from, to) => {
    if (!from || !to || samePoint(from, to)) return;
    entities.push({ type: 'LINE', start: roundPoint(from), end: roundPoint(to) });
  };
  const emitCorner = (corner) => {
    if (corner.radius > 0 && corner.center) {
      const startAngle = Math.atan2(corner.start.y - corner.center.y, corner.start.x - corner.center.x);
      const endAngle = Math.atan2(corner.end.y - corner.center.y, corner.end.x - corner.center.x);
      let sweep = endAngle - startAngle;
      while (sweep < 0) sweep += Math.PI * 2;
      while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
      // Fillets are minor arcs; a major sweep means the start/end pair is
      // wound the other way around the center.
      entities.push(sweep <= Math.PI
        ? { type: 'ARC', center: roundPoint(corner.center), radius: corner.radius, startAngle, endAngle, ccw: true }
        : { type: 'ARC', center: roundPoint(corner.center), radius: corner.radius, startAngle: endAngle, endAngle: startAngle, ccw: true });
    }
  };

  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    const nextCorner = closed ? corners[(index + 1) % corners.length] : corners[index + 1];
    emitCorner(corner);
    if (!nextCorner) break;
    const edgeStart = corner.radius > 0 && corner.end ? corner.end : corner.vertex;
    const edgeEnd = nextCorner.radius > 0 && nextCorner.start ? nextCorner.start : nextCorner.vertex;
    emitEdge(edgeStart, edgeEnd);
  }

  for (const hole of normalized.holes) {
    const diameter = numericValue(hole.diameter);
    if (diameter > 0) {
      entities.push({
        type: 'CIRCLE',
        center: roundPoint({ x: numericValue(hole.center[0]), y: numericValue(hole.center[1]) }),
        radius: diameter / 2
      });
    }
  }

  return entities;
};
