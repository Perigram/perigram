import DxfParser from '../assets/vendor/dxf-parser/index.js';

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
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...parameters
  },
  points: [],
  edges: [],
  holes: [],
  closed: false,
  modifiers: [],
  constraints: []
});

export const createDefaultOccsProfileTemplateData = (overrides = {}) => ({
  kind: overrides.kind || 'hanger',
  process: overrides.process || 'extruded',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...(overrides.parameters || {})
  },
  sketch: overrides.sketch || createDefaultOccsProfileSketch(overrides.parameters),
  occsProfile: null
});

const numericValue = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizePoint = (point = {}, index = 0) => ({
  id: point.id || `p${index}`,
  x: numericValue(point.x),
  y: numericValue(point.y)
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
    const radius = Math.max(0, numericValue(modifier.radius));
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
  const parameters = {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...(fallbackParameters || {}),
    ...(sketch.parameters || {})
  };
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
      center: Array.isArray(hole.center) ? [
        numericValue(hole.center[0]),
        numericValue(hole.center[1])
      ] : [0, 0],
      diameter: numericValue(hole.diameter)
    }));
  const modifiers = normalizeFilletModifiers(
    Array.isArray(sketch.modifiers) ? sketch.modifiers : fallback.modifiers,
    pointIds
  );
  const closed = typeof sketch.closed === 'boolean'
    ? sketch.closed
    : points.length >= 3 && edges.some(edge => edge.to === points[0]?.id);

  return {
    version: sketch.version || '0.1',
    units: sketch.units || 'mm',
    parameters,
    points,
    edges,
    holes,
    closed,
    modifiers,
    constraints: Array.isArray(sketch.constraints) ? sketch.constraints : fallback.constraints
  };
};

export const isOccsProfileSketchSavable = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  return normalized.points.length >= 3;
};

export const closeOccsProfileSketchBoundary = (sketch = {}, fallbackParameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, fallbackParameters);
  if (normalized.points.length < 3) return normalized;
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
  const normalized = normalizeOccsProfileSketch(sketch, options.parameters);
  const vertices = [];
  const vertexIds = [];

  for (const point of normalized.points) {
    if (vertexIds.includes(point.id)) continue;
    vertexIds.push(point.id);
    vertices.push([String(point.x), String(point.y)]);
  }

  return {
    section: {
      type: 'polygon',
      vertices,
      edges: vertices.map(() => ({ type: 'line' })),
      holes: normalized.holes.map(hole => ({
        type: 'circle',
        center: hole.center.map(value => String(value)),
        diameter: String(hole.diameter)
      })),
      modifiers: normalized.modifiers.map(modifier => ({ ...modifier }))
    },
    sweep: {
      type: 'linear',
      length: String(options.length || normalized.parameters.L || 120)
    },
    sketch: normalized
  };
};

export const resolveProfileSketchOrthoPoint = (previous = {}, pointer = {}) => {
  const previousPoint = {
    x: numericValue(previous.x ?? previous.xValue),
    y: numericValue(previous.y ?? previous.yValue)
  };
  const pointerPoint = {
    x: numericValue(pointer.x ?? pointer.xValue),
    y: numericValue(pointer.y ?? pointer.yValue)
  };
  const dx = pointerPoint.x - previousPoint.x;
  const dy = pointerPoint.y - previousPoint.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? { x: pointerPoint.x, y: previousPoint.y }
    : { x: previousPoint.x, y: pointerPoint.y };
};

export const projectProfileSketchPointFromPrevious = (previous = {}, pointer = {}, distance = null, options = {}) => {
  const previousPoint = {
    x: numericValue(previous.x ?? previous.xValue),
    y: numericValue(previous.y ?? previous.yValue)
  };
  const pointerPoint = options.ortho
    ? resolveProfileSketchOrthoPoint(previousPoint, pointer)
    : {
        x: numericValue(pointer.x ?? pointer.xValue),
        y: numericValue(pointer.y ?? pointer.yValue)
      };
  const length = Math.hypot(pointerPoint.x - previousPoint.x, pointerPoint.y - previousPoint.y);
  const targetDistance = Number(distance);
  if (!Number.isFinite(targetDistance) || targetDistance <= 0 || !length) {
    return {
      x: Math.round(pointerPoint.x * 1000) / 1000,
      y: Math.round(pointerPoint.y * 1000) / 1000
    };
  }
  return {
    x: Math.round((previousPoint.x + ((pointerPoint.x - previousPoint.x) / length) * targetDistance) * 1000) / 1000,
    y: Math.round((previousPoint.y + ((pointerPoint.y - previousPoint.y) / length) * targetDistance) * 1000) / 1000
  };
};

export const evaluateOccsProfileSketchPreview = (sketch = {}, parameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, parameters);
  const points = normalized.points.map(point => ({
    ...point,
    xValue: numericValue(point.x),
    yValue: numericValue(point.y)
  }));
  const pointById = new Map(points.map(point => [point.id, point]));
  const holes = normalized.holes.map(hole => ({
    ...hole,
    centerValue: [
      numericValue(hole.center[0]),
      numericValue(hole.center[1])
    ],
    diameterValue: Math.max(0, numericValue(hole.diameter))
  }));

  return {
    ...normalized,
    points,
    pointById,
    holes
  };
};

const entityLayer = (entity = {}) => entity.layer || entity.layerName || '';

const pointFromDxf = (point = {}) => ({
  x: numericValue(point.x ?? point[0]),
  y: numericValue(point.y ?? point[1])
});

const polylinePointsFromEntity = (entity = {}) => {
  if (Array.isArray(entity.vertices)) return entity.vertices.map(pointFromDxf);
  if (Array.isArray(entity.points)) return entity.points.map(pointFromDxf);
  return [];
};

const isClosedDxfPolyline = (entity = {}, points = []) => {
  if (entity.closed || entity.shape) return true;
  if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
    const flags = Number(entity.flags || 0);
    if ((flags & 1) === 1) return true;
  }
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 0.001;
};

const sketchFromPointsAndCircles = ({ points = [], circles = [] } = {}) => {
  const uniquePoints = points.slice();
  if (uniquePoints.length > 1) {
    const first = uniquePoints[0];
    const last = uniquePoints[uniquePoints.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001) uniquePoints.pop();
  }
  const normalizedPoints = uniquePoints.map((point, index) => ({
    id: `p${index}`,
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000
  }));
  const edges = normalizedPoints.map((point, index) => ({
    id: `e${index}`,
    type: 'line',
    from: point.id,
    to: normalizedPoints[(index + 1) % normalizedPoints.length]?.id || point.id
  })).filter(edge => edge.from !== edge.to);

  return normalizeOccsProfileSketch({
    version: '0.1',
    units: 'mm',
    parameters: { ...DEFAULT_OCCS_PROFILE_PARAMETERS },
    points: normalizedPoints,
    edges,
    holes: circles.map((circle, index) => ({
      id: `h${index}`,
      type: 'circle',
      center: [
        Math.round(circle.center[0] * 1000) / 1000,
        Math.round(circle.center[1] * 1000) / 1000
      ],
      diameter: Math.round(circle.diameter * 1000) / 1000
    })),
    closed: normalizedPoints.length >= 3,
    modifiers: [],
    constraints: []
  });
};

export const profileSketchFromDxfText = (dxfText = '') => {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  const entities = Array.isArray(dxf?.entities) ? dxf.entities : [];
  const polylines = [];
  const lines = [];
  const circles = [];

  for (const entity of entities) {
    if (entity.type === 'CIRCLE') {
      const center = pointFromDxf(entity.center || entity);
      const radius = numericValue(entity.radius);
      if (radius > 0) circles.push({ center: [center.x, center.y], diameter: radius * 2, layer: entityLayer(entity) });
      continue;
    }
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const points = polylinePointsFromEntity(entity);
      if (points.length >= 3 && isClosedDxfPolyline(entity, points)) {
        polylines.push({ points, layer: entityLayer(entity) });
      }
      continue;
    }
    if (entity.type === 'LINE') {
      const start = pointFromDxf(entity.startPoint || entity.start || entity.vertices?.[0]);
      const end = pointFromDxf(entity.endPoint || entity.end || entity.vertices?.[1]);
      lines.push({ start, end, layer: entityLayer(entity) });
    }
  }

  const sourcePoints = polylines
    .sort((left, right) => right.points.length - left.points.length)[0]?.points ||
    lines.flatMap(line => [line.start, line.end]);

  if (!sourcePoints.length) {
    throw new Error('DXF does not contain a closed polyline or line geometry for a profile.');
  }

  return sketchFromPointsAndCircles({ points: sourcePoints, circles });
};
