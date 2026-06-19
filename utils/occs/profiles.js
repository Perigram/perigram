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
  W: '42',
  H: '28',
  R: '3',
  D: '6',
  L: '120'
});

export const createDefaultOccsProfileSketch = (parameters = {}) => ({
  version: '0.1',
  units: 'mm',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...parameters
  },
  points: [
    { id: 'p0', x: '0', y: '0' },
    { id: 'p1', x: 'W', y: '0' },
    { id: 'p2', x: 'W', y: 'H' },
    { id: 'p3', x: '0', y: 'H' }
  ],
  edges: [
    { id: 'e0', type: 'line', from: 'p0', to: 'p1' },
    { id: 'e1', type: 'line', from: 'p1', to: 'p2' },
    { id: 'e2', type: 'line', from: 'p2', to: 'p3' },
    { id: 'e3', type: 'line', from: 'p3', to: 'p0' }
  ],
  holes: [
    { id: 'h0', type: 'circle', center: ['W / 2', 'H / 2'], diameter: 'D' }
  ],
  modifiers: [
    { type: 'fillet', vertices: ['p0', 'p1', 'p2', 'p3'], radius: 'R' }
  ],
  constraints: [
    { type: 'coincident', entities: ['e0.to', 'e1.from'] },
    { type: 'coincident', entities: ['e1.to', 'e2.from'] },
    { type: 'coincident', entities: ['e2.to', 'e3.from'] },
    { type: 'coincident', entities: ['e3.to', 'e0.from'] },
    { type: 'horizontal', entity: 'e0' },
    { type: 'horizontal', entity: 'e2' },
    { type: 'vertical', entity: 'e1' },
    { type: 'vertical', entity: 'e3' }
  ]
});

export const createDefaultOccsProfileTemplateData = (overrides = {}) => ({
  kind: overrides.kind || 'hanger',
  process: overrides.process || 'extruded',
  parameters: {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...(overrides.parameters || {})
  },
  sketch: createDefaultOccsProfileSketch(overrides.parameters),
  occsProfile: null
});

const stringifyExpression = (value, fallback = '0') => {
  if (value === null || value === undefined || value === '') return String(fallback);
  return String(value);
};

const normalizePoint = (point = {}, index = 0) => ({
  id: point.id || `p${index}`,
  x: stringifyExpression(point.x),
  y: stringifyExpression(point.y)
});

const normalizeLineEdge = (edge = {}, index = 0) => ({
  id: edge.id || `e${index}`,
  type: 'line',
  from: edge.from,
  to: edge.to
});

export const normalizeOccsProfileSketch = (sketch = {}, fallbackParameters = {}) => {
  const fallback = createDefaultOccsProfileSketch(fallbackParameters);
  const parameters = {
    ...DEFAULT_OCCS_PROFILE_PARAMETERS,
    ...(fallbackParameters || {}),
    ...(sketch.parameters || {})
  };
  const points = Array.isArray(sketch.points) && sketch.points.length
    ? sketch.points.map(normalizePoint)
    : fallback.points;
  const pointIds = new Set(points.map(point => point.id));
  const edges = (Array.isArray(sketch.edges) && sketch.edges.length ? sketch.edges : fallback.edges)
    .filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to))
    .map(normalizeLineEdge);
  const holes = (Array.isArray(sketch.holes) ? sketch.holes : fallback.holes)
    .filter(hole => hole?.type === 'circle')
    .map((hole, index) => ({
      id: hole.id || `h${index}`,
      type: 'circle',
      center: Array.isArray(hole.center) ? [
        stringifyExpression(hole.center[0], '0'),
        stringifyExpression(hole.center[1], '0')
      ] : ['0', '0'],
      diameter: stringifyExpression(hole.diameter, '0')
    }));
  const modifiers = (Array.isArray(sketch.modifiers) ? sketch.modifiers : fallback.modifiers)
    .filter(modifier => modifier?.type === 'fillet')
    .map(modifier => ({
      type: 'fillet',
      vertices: Array.isArray(modifier.vertices) ? modifier.vertices.filter(id => pointIds.has(id)) : [],
      radius: stringifyExpression(modifier.radius, '0')
    }))
    .filter(modifier => modifier.vertices.length);

  return {
    version: sketch.version || '0.1',
    units: sketch.units || 'mm',
    parameters,
    points,
    edges,
    holes,
    modifiers,
    constraints: Array.isArray(sketch.constraints) ? sketch.constraints : fallback.constraints
  };
};

export const occsProfileFromSketch = (sketch = {}, options = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, options.parameters);
  const pointById = new Map(normalized.points.map(point => [point.id, point]));
  const vertices = [];
  const vertexIds = [];

  for (const edge of normalized.edges) {
    if (!vertexIds.includes(edge.from) && pointById.has(edge.from)) {
      vertexIds.push(edge.from);
      const point = pointById.get(edge.from);
      vertices.push([point.x, point.y]);
    }
  }

  if (!vertices.length) {
    for (const point of normalized.points) {
      vertexIds.push(point.id);
      vertices.push([point.x, point.y]);
    }
  }

  return {
    section: {
      type: 'polygon',
      vertices,
      edges: vertices.map(() => ({ type: 'line' })),
      holes: normalized.holes.map(hole => ({
        type: 'circle',
        center: hole.center,
        diameter: hole.diameter
      })),
      modifiers: normalized.modifiers.map(modifier => ({ ...modifier }))
    },
    sweep: {
      type: 'linear',
      length: stringifyExpression(options.length || 'L', 'L')
    },
    sketch: normalized
  };
};

export const evaluateOccsProfileSketchPreview = (sketch = {}, parameters = {}) => {
  const normalized = normalizeOccsProfileSketch(sketch, parameters);
  const scope = { ...normalized.parameters, ...(parameters || {}) };
  const points = normalized.points.map(point => ({
    ...point,
    xValue: resolveOccsExpression(point.x, scope, 0),
    yValue: resolveOccsExpression(point.y, scope, 0)
  }));
  const pointById = new Map(points.map(point => [point.id, point]));
  const holes = normalized.holes.map(hole => ({
    ...hole,
    centerValue: [
      resolveOccsExpression(hole.center[0], scope, 0),
      resolveOccsExpression(hole.center[1], scope, 0)
    ],
    diameterValue: Math.max(0, resolveOccsExpression(hole.diameter, scope, 0))
  }));

  return {
    ...normalized,
    points,
    pointById,
    holes
  };
};
