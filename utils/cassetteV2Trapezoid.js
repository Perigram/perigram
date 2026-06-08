const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const point3 = (point) => [
  numeric(point?.[0]),
  numeric(point?.[1]),
  numeric(point?.[2])
];

const samePoint = (left, right, tolerance = 0.001) => (
  Math.abs(numeric(left?.[0]) - numeric(right?.[0])) <= tolerance &&
  Math.abs(numeric(left?.[1]) - numeric(right?.[1])) <= tolerance
);

const withoutClosingVertex = (vertices = []) => {
  if (vertices.length < 2) return vertices.map(point3);
  const points = vertices.map(point3);
  return samePoint(points[0], points[points.length - 1])
    ? points.slice(0, -1)
    : points;
};

const polygonArea = (vertices = []) => {
  const points = withoutClosingVertex(vertices);
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
};

const vectorLength = (vector) => Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);

const normalize2 = (vector, fallback = [1, 0]) => {
  const length = vectorLength(vector);
  return length > 0 ? [vector[0] / length, vector[1] / length] : fallback;
};

const edgeFrame = (parentVertices, parentEdgeIndex, { reverse = false } = {}) => {
  const points = withoutClosingVertex(parentVertices);
  const index = Math.max(0, Math.round(numeric(parentEdgeIndex, 0)));
  const sourceStart = points[index];
  const sourceEnd = points[(index + 1) % points.length];
  if (!sourceStart || !sourceEnd) return null;

  const start = reverse ? sourceEnd : sourceStart;
  const end = reverse ? sourceStart : sourceEnd;

  const direction = normalize2([end[0] - start[0], end[1] - start[1]]);
  const ccw = polygonArea(points) >= 0;
  const normal = reverse
    ? (ccw ? [-direction[1], direction[0]] : [direction[1], -direction[0]])
    : (ccw ? [direction[1], -direction[0]] : [-direction[1], direction[0]]);

  return { start, direction, normal, referenceLength: vectorLength([end[0] - start[0], end[1] - start[1]]) };
};

const closeVertices = (vertices) => {
  if (!vertices.length || samePoint(vertices[0], vertices[vertices.length - 1])) return vertices;
  return [...vertices, [...vertices[0]]];
};

export const cassetteV2TrapezoidReferenceLength = (parentVertices, parentEdgeIndex) => (
  edgeFrame(parentVertices, parentEdgeIndex)?.referenceLength || null
);

export const resolveCassetteV2TrapezoidLocalPoints = (trapezoid = {}) => {
  const referenceLength = numeric(trapezoid.defaultLength, 0);
  const baseStartOffset = numeric(trapezoid.baseStartOffset, 0);
  const baseEndOffset = numeric(trapezoid.baseEndOffset, 0);
  const localLength = referenceLength - baseStartOffset - baseEndOffset;
  if (localLength <= 0) {
    throw new Error('Trapezoid base length must stay positive after offsets');
  }

  const height = numeric(trapezoid.height, 0);
  const p2Height = trapezoid.p2Height === undefined ? height : numeric(trapezoid.p2Height, height);
  const p3Height = trapezoid.p3Height === undefined ? height : numeric(trapezoid.p3Height, height);
  const topStartOffset = numeric(trapezoid.topStartOffset, 0);
  const topEndOffset = numeric(trapezoid.topEndOffset, 0);

  return [
    [0, 0, 0],
    [localLength, 0, 0],
    [localLength - topEndOffset, p2Height, 0],
    [topStartOffset, p3Height, 0]
  ];
};

export const buildCassetteV2TrapezoidVertices = (
  trapezoid = {},
  { parentVertices = null, parentEdgeIndex = 0 } = {}
) => {
  const frame = parentVertices?.length
    ? edgeFrame(parentVertices, parentEdgeIndex, { reverse: true })
    : {
        start: [0, 0, 0],
        direction: [1, 0],
        normal: [0, 1]
      };
  if (!frame) throw new Error('Cannot resolve trapezoid parent edge');

  const baseStartOffset = numeric(trapezoid.baseStartOffset, 0);
  const origin = [
    frame.start[0] + frame.direction[0] * baseStartOffset,
    frame.start[1] + frame.direction[1] * baseStartOffset,
    frame.start[2] || 0
  ];

  return closeVertices(resolveCassetteV2TrapezoidLocalPoints(trapezoid).map(point => [
    origin[0] + frame.direction[0] * point[0] + frame.normal[0] * point[1],
    origin[1] + frame.direction[1] * point[0] + frame.normal[1] * point[1],
    origin[2] + point[2]
  ]));
};
