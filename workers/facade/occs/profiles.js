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

export const createDefaultOccsProfileSketch = (parameters = {}) => ({
  version: '0.1',
  units: 'mm',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...parameters
  },
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
  ],
  closed: true,
  modifiers: [
    { type: 'fillet', vertexId: 'p0', radius: 3 },
    { type: 'fillet', vertexId: 'p1', radius: 3 },
    { type: 'fillet', vertexId: 'p2', radius: 3 },
    { type: 'fillet', vertexId: 'p3', radius: 3 }
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
  const fallback = createDefaultOccsProfileSketch(fallbackParameters);
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

  return {
    version: sketch.version || '0.1',
    units: sketch.units || 'mm',
    parameters,
    points,
    edges,
    holes,
    closed,
    anchors,
    modifiers,
    constraints: Array.isArray(sketch.constraints) ? sketch.constraints : fallback.constraints
  };
};

// Anchors tie a profile to its host: a closed profile carries one anchor
// vertex (the vertex that lands on the attachment point); an open profile
// carries start/end distances — margins from the host edge's two ends
// where the profile begins and the contour breaks.
const normalizeOccsProfileSketchAnchors = (anchors = null, pointIds = new Set(), closed = false) => {
  if (!anchors || typeof anchors !== 'object') return null;
  if (closed) {
    return pointIds.has(anchors.vertexId) ? { vertexId: anchors.vertexId } : null;
  }
  return {
    startDistance: sketchValue(anchors.startDistance, 0),
    endDistance: sketchValue(anchors.endDistance, 0)
  };
};

export const isOccsProfileSketchSavable = (sketch = {}, fallbackParameters = {}) => {
  try {
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
    anchors: normalized.anchors && !normalized.anchors.vertexId
      ? {
          startDistance: resolveField(normalized.anchors.startDistance, 'anchor start distance'),
          endDistance: resolveField(normalized.anchors.endDistance, 'anchor end distance')
        }
      : normalized.anchors
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
    modifiers: normalized.modifiers.map(modifier => ({ ...modifier }))
  };
  const anchorPoint = normalized.anchors?.vertexId
    ? normalized.points.find(point => point.id === normalized.anchors.vertexId) || null
    : null;
  if (closed && anchorPoint) {
    section.anchor = [String(anchorPoint.x), String(anchorPoint.y)];
  }
  if (!closed) {
    if (vertices.length >= 2) {
      // Break points: where an inserted open profile splits the host face.
      section.breakPoints = [
        vertices[0],
        vertices[vertices.length - 1]
      ];
    }
    if (normalized.anchors && normalized.anchors.startDistance !== undefined) {
      section.anchorDistances = {
        start: String(normalized.anchors.startDistance),
        end: String(normalized.anchors.endDistance)
      };
    }
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
  const closedPolyline = polylines
    .filter(record => record.closed && record.vertices.length >= 3)
    .sort((left, right) => right.vertices.length - left.vertices.length)[0];
  if (closedPolyline) {
    source = { segments: polylineRecordSegments(closedPolyline), closed: true };
  } else if (freeSegments.length) {
    const chained = chainSegments(freeSegments);
    if (chained.chain.length >= 2 || (chained.chain.length === 1 && chained.chain[0].type === 'line')) {
      source = { segments: chained.chain, closed: chained.closed };
    }
  } else if (polylines.length) {
    const fallbackPolyline = polylines.sort((left, right) => right.vertices.length - left.vertices.length)[0];
    source = { segments: polylineRecordSegments(fallbackPolyline), closed: false };
  }

  if (!source) {
    return normalizeOccsProfileSketch(createEmptyOccsProfileSketch(parameters), parameters);
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
    modifiers,
    constraints: []
  }, parameters);
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
    const start = { x: vertex.x + unitPrevious.x * trim, y: vertex.y + unitPrevious.y * trim };
    const end = { x: vertex.x + unitNext.x * trim, y: vertex.y + unitNext.y * trim };
    const bisector = {
      x: unitPrevious.x + unitNext.x,
      y: unitPrevious.y + unitNext.y
    };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    const centerDistance = radius / Math.sin(interiorAngle / 2);
    const center = {
      x: vertex.x + (bisector.x / bisectorLength) * centerDistance,
      y: vertex.y + (bisector.y / bisectorLength) * centerDistance
    };
    corners.push({
      vertex,
      radius,
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
