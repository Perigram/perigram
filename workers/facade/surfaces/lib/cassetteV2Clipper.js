import { OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from '../../occs/layers.js';

export const CASSETTE_V2_CUT_OUTER_LAYER = OCCS_LAYER_CUT_OUTER;
export const CASSETTE_V2_FOLD_ROUTE_LAYER = OCCS_LAYER_FOLD_ROUTE;
export const CASSETTE_V2_CLIPPER_PRECISION = 3;

let clipperPromise = null;

// The clipper2 runtime ships beside the plugin. Keep this a literal
// relative import so managed-runtime asset collection can include both
// the JavaScript glue and its import.meta.url-resolved WASM binary.
const runtimeImport = () => import('../../assets/vendor/clipper2/clipper2z.js');

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const samePoint = (left, right, tolerance = 0.001) => (
  Math.abs(numeric(left?.[0]) - numeric(right?.[0])) <= tolerance &&
  Math.abs(numeric(left?.[1]) - numeric(right?.[1])) <= tolerance
);

const withoutClosingVertex = (vertices = [], tolerance = 0.001) => {
  if (vertices.length < 2) return vertices;
  return samePoint(vertices[0], vertices[vertices.length - 1], tolerance)
    ? vertices.slice(0, -1)
    : vertices;
};

const point3 = (point) => [
  numeric(point?.[0]),
  numeric(point?.[1]),
  numeric(point?.[2])
];

const closePath = (vertices = [], tolerance = 0.001) => {
  if (vertices.length < 2 || samePoint(vertices[0], vertices[vertices.length - 1], tolerance)) {
    return vertices;
  }
  return [...vertices, [...vertices[0]]];
};

const roundKey = (value, precision) => {
  const scale = 10 ** precision;
  const rounded = Math.round(numeric(value) * scale) / scale;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(precision);
};

const coordinateKey = (point, precision) => `${roundKey(point[0], precision)},${roundKey(point[1], precision)}`;

const segmentKey = (segment, precision) => {
  const from = coordinateKey(segment.from, precision);
  const to = coordinateKey(segment.to, precision);
  return from < to ? `${from}|${to}` : `${to}|${from}`;
};

const polygonArea = (vertices = []) => {
  const points = withoutClosingVertex(vertices);
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += numeric(current[0]) * numeric(next[1]) - numeric(next[0]) * numeric(current[1]);
  }
  return area / 2;
};

const normalizeOuterPathOrientation = (vertices = []) => {
  const points = withoutClosingVertex(vertices).map(point3);
  return polygonArea(points) < 0 ? points.reverse() : points;
};

const edgeSegmentsForPolygon = (vertices = [], face = null) => {
  const points = withoutClosingVertex(vertices).map(point3);
  if (points.length < 2) return [];

  return points.map((point, edgeIndex) => ({
    from: point,
    to: points[(edgeIndex + 1) % points.length],
    face,
    edgeIndex
  }));
};

const pointAt = (segment, t) => ([
  segment.from[0] + (segment.to[0] - segment.from[0]) * t,
  segment.from[1] + (segment.to[1] - segment.from[1]) * t,
  segment.from[2] + (segment.to[2] - segment.from[2]) * t
]);

const segmentLength = (segment) => {
  const dx = segment.to[0] - segment.from[0];
  const dy = segment.to[1] - segment.from[1];
  return Math.sqrt(dx * dx + dy * dy);
};

const cross2d = (left, right) => left[0] * right[1] - left[1] * right[0];

const segmentParameter = (segment, point) => {
  const dx = segment.to[0] - segment.from[0];
  const dy = segment.to[1] - segment.from[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return null;
  return ((point[0] - segment.from[0]) * dx + (point[1] - segment.from[1]) * dy) / lengthSquared;
};

const addSplitParameter = (splits, index, value, tolerance) => {
  if (value === null || value < -tolerance || value > 1 + tolerance) return;
  const clamped = Math.min(1, Math.max(0, value));
  if (!splits[index].some(item => Math.abs(item - clamped) <= tolerance)) {
    splits[index].push(clamped);
  }
};

const segmentPointDistance = (segment, point) => {
  const dx = segment.to[0] - segment.from[0];
  const dy = segment.to[1] - segment.from[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return Infinity;
  const px = point[0] - segment.from[0];
  const py = point[1] - segment.from[1];
  return Math.abs(dx * py - dy * px) / length;
};

const splitSegmentsAtIntersections = (segments, precision) => {
  if (segments.length < 2) return segments;

  const tolerance = clipperTolerance(precision);
  const splits = segments.map(() => [0, 1]);

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    const left = segments[leftIndex];
    const p = left.from;
    const r = [left.to[0] - left.from[0], left.to[1] - left.from[1]];

    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const right = segments[rightIndex];
      const q = right.from;
      const s = [right.to[0] - right.from[0], right.to[1] - right.from[1]];
      const denominator = cross2d(r, s);
      const qMinusP = [q[0] - p[0], q[1] - p[1]];

      if (Math.abs(denominator) <= tolerance) {
        if (segmentPointDistance(left, right.from) > tolerance) continue;
        addSplitParameter(splits, leftIndex, segmentParameter(left, right.from), tolerance);
        addSplitParameter(splits, leftIndex, segmentParameter(left, right.to), tolerance);
        addSplitParameter(splits, rightIndex, segmentParameter(right, left.from), tolerance);
        addSplitParameter(splits, rightIndex, segmentParameter(right, left.to), tolerance);
        continue;
      }

      const t = cross2d(qMinusP, s) / denominator;
      const u = cross2d(qMinusP, r) / denominator;
      if (
        t >= -tolerance &&
        t <= 1 + tolerance &&
        u >= -tolerance &&
        u <= 1 + tolerance
      ) {
        addSplitParameter(splits, leftIndex, t, tolerance);
        addSplitParameter(splits, rightIndex, u, tolerance);
      }
    }
  }

  return segments.flatMap((segment, index) => {
    const values = splits[index]
      .sort((left, right) => left - right)
      .filter((value, valueIndex, list) => valueIndex === 0 || Math.abs(value - list[valueIndex - 1]) > tolerance);
    const nextSegments = [];

    for (let splitIndex = 0; splitIndex < values.length - 1; splitIndex += 1) {
      const start = values[splitIndex];
      const end = values[splitIndex + 1];
      if (end - start <= tolerance) continue;
      const nextSegment = {
        ...segment,
        from: pointAt(segment, start),
        to: pointAt(segment, end)
      };
      if (segmentLength(nextSegment) > tolerance) nextSegments.push(nextSegment);
    }

    return nextSegments;
  });
};

const boundaryCoverageOnSegment = (source, boundary, tolerance) => {
  const dx = source.to[0] - source.from[0];
  const dy = source.to[1] - source.from[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= tolerance * tolerance) return null;

  const distanceFromSourceLine = (point) => {
    const px = point[0] - source.from[0];
    const py = point[1] - source.from[1];
    return Math.abs(dx * py - dy * px) / Math.sqrt(lengthSquared);
  };

  if (
    distanceFromSourceLine(boundary.from) > tolerance ||
    distanceFromSourceLine(boundary.to) > tolerance
  ) {
    return null;
  }

  const project = (point) => (
    ((point[0] - source.from[0]) * dx + (point[1] - source.from[1]) * dy) / lengthSquared
  );
  const t0 = project(boundary.from);
  const t1 = project(boundary.to);
  const start = Math.max(0, Math.min(t0, t1));
  const end = Math.min(1, Math.max(t0, t1));
  const tTolerance = tolerance / Math.sqrt(lengthSquared);

  return end - start > tTolerance ? [start, end] : null;
};

const uncoveredIntervals = (segment, boundarySegments, tolerance) => {
  const length = segmentLength(segment);
  if (length <= tolerance) return [];

  const tTolerance = tolerance / length;
  const covered = boundarySegments
    .map(boundary => boundaryCoverageOnSegment(segment, boundary, tolerance))
    .filter(Boolean)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];

  for (const interval of covered) {
    if (!merged.length || interval[0] > merged[merged.length - 1][1] + tTolerance) {
      merged.push([...interval]);
      continue;
    }
    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], interval[1]);
  }

  const gaps = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start - cursor > tTolerance) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (1 - cursor > tTolerance) gaps.push([cursor, 1]);
  return gaps;
};

const dedupeSegments = (segments, precision) => {
  const seen = new Map();
  for (const segment of segments) {
    const key = segmentKey(segment, precision);
    if (!seen.has(key)) seen.set(key, segment);
  }
  return Array.from(seen.values());
};

const removeConsecutiveDuplicates = (vertices, precision) => (
  vertices.filter((vertex, index) => (
    index === 0 || coordinateKey(vertex, precision) !== coordinateKey(vertices[index - 1], precision)
  ))
);

const connectSegments = (segments, precision) => {
  if (!segments.length) return [];

  const adjacency = new Map();
  const addEndpoint = (key, index) => {
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push(index);
  };

  segments.forEach((segment, index) => {
    addEndpoint(coordinateKey(segment.from, precision), index);
    addEndpoint(coordinateKey(segment.to, precision), index);
  });

  const used = new Set();
  const extend = (points, append) => {
    while (true) {
      const current = append ? points[points.length - 1] : points[0];
      const key = coordinateKey(current, precision);
      const nextIndex = (adjacency.get(key) || []).find(index => !used.has(index));
      if (nextIndex === undefined) return;

      used.add(nextIndex);
      const segment = segments[nextIndex];
      const fromKey = coordinateKey(segment.from, precision);
      const nextPoint = fromKey === key ? segment.to : segment.from;
      if (append) points.push(nextPoint);
      else points.unshift(nextPoint);
    }
  };

  const endpointDegree = (segment) => (
    Math.min(
      adjacency.get(coordinateKey(segment.from, precision))?.length || 0,
      adjacency.get(coordinateKey(segment.to, precision))?.length || 0
    )
  );
  const indices = segments
    .map((_, index) => index)
    .sort((left, right) => endpointDegree(segments[left]) - endpointDegree(segments[right]));

  const paths = [];
  for (const index of indices) {
    if (used.has(index)) continue;
    used.add(index);

    const segment = segments[index];
    const points = [segment.from, segment.to];
    extend(points, true);
    extend(points, false);
    const path = removeConsecutiveDuplicates(points, precision);
    if (path.length >= 2) paths.push(path);
  }

  return paths;
};

const clipperTolerance = (precision) => 10 ** -precision;

const normalizeFacePolygons = (faces = [], precision = CASSETTE_V2_CLIPPER_PRECISION) => {
  const tolerance = clipperTolerance(precision);
  return faces
    .map(face => ({
      id: face?.id || face?.node?.id || null,
      vertices: normalizeOuterPathOrientation(face?.boundaryVertices || face?.vertices || [], tolerance)
    }))
    .filter(face => face.vertices.length >= 3 && Math.abs(polygonArea(face.vertices)) > tolerance);
};

const pathsDFromPolygons = (clipper, polygons) => {
  const paths = new clipper.PathsD();
  for (const vertices of polygons) {
    const coordinates = withoutClosingVertex(vertices)
      .flatMap(point => [numeric(point[0]), numeric(point[1])]);
    if (coordinates.length < 6) continue;

    const path = clipper.MakePathD(coordinates);
    paths.push_back(path);
    path.delete();
  }
  return paths;
};

const verticesFromPathD = (path) => {
  const values = Array.from(path.view());
  const vertices = [];
  for (let index = 0; index < values.length; index += 3) {
    vertices.push([numeric(values[index]), numeric(values[index + 1]), numeric(values[index + 2])]);
  }
  return vertices;
};

const verticesFromPathsD = (paths, precision) => {
  const tolerance = clipperTolerance(precision);
  const polygons = [];

  for (let index = 0; index < paths.size(); index += 1) {
    const path = paths.get(index);
    try {
      const vertices = verticesFromPathD(path);
      if (vertices.length >= 3 && Math.abs(polygonArea(vertices)) > tolerance) {
        polygons.push(closePath(vertices, tolerance));
      }
    } finally {
      path.delete();
    }
  }

  return polygons.sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)));
};

export const getCassetteV2Clipper = async () => {
  if (!clipperPromise) {
    clipperPromise = runtimeImport()
      .then(async module => {
        const wasmBinary = globalThis.Deno?.readFile
          ? await globalThis.Deno.readFile(new URL('../../assets/vendor/clipper2/clipper2z.wasm', import.meta.url))
          : undefined;
        return await module.default(wasmBinary ? { wasmBinary } : {});
      })
      .catch((error) => {
        clipperPromise = null;
        throw error;
      });
  }
  return clipperPromise;
};

export const unionCassetteV2FacePolygons = async (
  polygons = [],
  { precision = CASSETTE_V2_CLIPPER_PRECISION } = {}
) => {
  const clipper = await getCassetteV2Clipper();
  const subjects = pathsDFromPolygons(clipper, polygons);

  try {
    if (!subjects.size()) return [];
    const solution = clipper.UnionSelfD(subjects, clipper.FillRule.NonZero, precision);
    try {
      return verticesFromPathsD(solution, precision);
    } finally {
      solution.delete();
    }
  } finally {
    subjects.delete();
  }
};

export const differenceCassetteV2FacePolygon = async (
  subject = [],
  clips = [],
  { precision = CASSETTE_V2_CLIPPER_PRECISION } = {}
) => {
  const clipper = await getCassetteV2Clipper();
  const subjects = pathsDFromPolygons(clipper, [subject]);
  const clipPaths = pathsDFromPolygons(clipper, clips);

  try {
    if (!subjects.size()) return { outer: closePath(subject), holes: [] };
    if (!clipPaths.size()) return { outer: closePath(subject), holes: [] };
    const solution = clipper.DifferenceD(subjects, clipPaths, clipper.FillRule.NonZero, precision);
    try {
      const paths = verticesFromPathsD(solution, precision);
      if (!paths.length) return { outer: [], holes: [] };
      const rings = paths.map(path => ({
        vertices: closePath(withoutClosingVertex(path).map(point3)),
        area: polygonArea(path)
      }));
      const outer = rings
        .filter(ring => ring.area > 0)
        .sort((left, right) => Math.abs(right.area) - Math.abs(left.area))[0]?.vertices ||
        rings.sort((left, right) => Math.abs(right.area) - Math.abs(left.area))[0]?.vertices ||
        [];
      const holes = rings
        .filter(ring => ring.vertices !== outer && ring.area < 0)
        .map(ring => ring.vertices);
      return { outer, holes };
    } finally {
      solution.delete();
    }
  } finally {
    subjects.delete();
    clipPaths.delete();
  }
};

// Multi-subject difference for profile boolean folds: every positive
// result ring is a polygon, every negative ring a hole.
export const differenceCassetteV2Polygons = async (
  subjects = [],
  clips = [],
  { precision = CASSETTE_V2_CLIPPER_PRECISION } = {}
) => {
  const clipper = await getCassetteV2Clipper();
  const subjectPaths = pathsDFromPolygons(clipper, subjects);
  const clipPaths = pathsDFromPolygons(clipper, clips);

  try {
    if (!subjectPaths.size()) return { polygons: [], holes: [] };
    if (!clipPaths.size()) {
      const rings = verticesFromPathsD(subjectPaths, precision).map(path => ({
        vertices: path,
        area: polygonArea(path)
      }));
      return {
        polygons: rings.filter(ring => ring.area > 0).map(ring => ring.vertices),
        holes: rings.filter(ring => ring.area < 0).map(ring => ring.vertices)
      };
    }
    const solution = clipper.DifferenceD(subjectPaths, clipPaths, clipper.FillRule.NonZero, precision);
    try {
      const rings = verticesFromPathsD(solution, precision).map(path => ({
        vertices: path,
        area: polygonArea(path)
      }));
      return {
        polygons: rings.filter(ring => ring.area > 0).map(ring => ring.vertices),
        holes: rings.filter(ring => ring.area < 0).map(ring => ring.vertices)
      };
    } finally {
      solution.delete();
    }
  } finally {
    subjectPaths.delete();
    clipPaths.delete();
  }
};

// Ordered region fold (owner law 2026-10-19, profile op sequence): a
// region is outer polygons plus hole rings; every operation applies to
// the whole region in sequence — add unions, subtract cuts. Hole rings
// ride the subject with negative winding (NonZero fill), so a later add
// fills a hole and a later subtract opens one.
export const foldCassetteV2Region = async (
  region = { polygons: [], holes: [] },
  operations = [],
  { precision = CASSETTE_V2_CLIPPER_PRECISION } = {}
) => {
  const clipper = await getCassetteV2Clipper();
  const orientedRing = (ring, positive) => {
    const vertices = withoutClosingVertex(ring).map(point3);
    if (vertices.length < 3) return null;
    return polygonArea(vertices) * (positive ? 1 : -1) < 0 ? [...vertices].reverse() : vertices;
  };
  const outerRings = (region.polygons || []).map(ring => orientedRing(ring, true)).filter(Boolean);
  const holeRings = (region.holes || []).map(ring => orientedRing(ring, false)).filter(Boolean);
  let subject = pathsDFromPolygons(clipper, [...outerRings, ...holeRings]);
  try {
    for (const operation of operations) {
      const clip = pathsDFromPolygons(clipper, operation.polygons || []);
      try {
        if (!clip.size()) continue;
        const solution = operation.op === 'add'
          ? clipper.UnionD(subject, clip, clipper.FillRule.NonZero, precision)
          : clipper.DifferenceD(subject, clip, clipper.FillRule.NonZero, precision);
        subject.delete();
        subject = solution;
      } finally {
        clip.delete();
      }
    }
    const rings = verticesFromPathsD(subject, precision);
    return {
      polygons: rings.filter(ring => polygonArea(ring) > 0),
      holes: rings.filter(ring => polygonArea(ring) < 0)
    };
  } finally {
    subject.delete();
  }
};

export const buildCassetteV2ClipperLayout = async (
  faces = [],
  { precision = CASSETTE_V2_CLIPPER_PRECISION } = {}
) => {
  const tolerance = clipperTolerance(precision);
  const facePolygons = normalizeFacePolygons(faces, precision);
  const cutOuterPaths = await unionCassetteV2FacePolygons(
    facePolygons.map(face => face.vertices),
    { precision }
  );
  const cutSegments = cutOuterPaths.flatMap(path => edgeSegmentsForPolygon(path));
  const sourceSegments = facePolygons.flatMap(face => edgeSegmentsForPolygon(face.vertices, face.id));
  const foldSegments = dedupeSegments(
    splitSegmentsAtIntersections(
      dedupeSegments(
        sourceSegments.flatMap(segment => (
          uncoveredIntervals(segment, cutSegments, tolerance)
            .map(([start, end]) => ({
              from: pointAt(segment, start),
              to: pointAt(segment, end),
              face: segment.face,
              edgeIndex: segment.edgeIndex
            }))
        )),
        precision
      ),
      precision
    ),
    precision
  );

  return {
    cutOuterPaths,
    foldPaths: connectSegments(foldSegments, precision),
    facePolygons
  };
};
