// Placement patterns for cassette attachments: one edge rule and the
// two-dimensional face rule. Pure geometry module.

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const withoutClosingVertex = (vertices = []) => {
  const points = vertices.map(vertex => [numeric(vertex?.[0]), numeric(vertex?.[1])]);
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) points.pop();
  }
  return points;
};

export const OCCS_EDGE_ARRAY_DEFAULTS = Object.freeze({
  type: 'edgeArray',
  edge: 'E0',
  mode: 'count',
  count: '1',
  spacing: '120'
});

export const OCCS_FACE_ARRAY_LAYOUTS = Object.freeze([
  'rectangular',
  'hex',
  'polar'
]);

export const OCCS_FACE_ARRAY_DEFAULTS = Object.freeze({
  type: 'faceArray',
  layout: 'rectangular',
  countX: '2',
  stepX: '0',
  countY: '2',
  stepY: '0',
  paddingX: '0',
  paddingY: '0',
  count: '6',
  radius: '0',
  startAngle: '0',
  sweep: '360',
  rotate: true
});

export const edgeArrayDefaults = (pattern = {}) => ({
  ...OCCS_EDGE_ARRAY_DEFAULTS,
  ...(pattern || {}),
  type: 'edgeArray',
  mode: pattern?.mode === 'spacing' ? 'spacing' : 'count'
});

export const faceArrayDefaults = (pattern = {}) => ({
  ...OCCS_FACE_ARRAY_DEFAULTS,
  ...(pattern || {}),
  type: 'faceArray',
  layout: OCCS_FACE_ARRAY_LAYOUTS.includes(pattern?.layout) ? pattern.layout : OCCS_FACE_ARRAY_DEFAULTS.layout,
  rotate: pattern?.rotate === undefined ? OCCS_FACE_ARRAY_DEFAULTS.rotate : Boolean(pattern.rotate)
});

export const arrayDefaults = (pattern = {}) => (
  pattern?.type === 'faceArray' ? faceArrayDefaults(pattern) : edgeArrayDefaults(pattern)
);

const normalizeEdgeBinding = (binding = 'start') => {
  const value = String(binding || 'start');
  if (value === 'end') return 'end';
  if (value === 'center') return 'center';
  return 'start';
};

const normalizeFaceBinding = (binding = 'center') => {
  const value = String(binding || 'center');
  if (value === 'start') return 'start';
  if (value === 'end') return 'end';
  return 'center';
};

// Distance from the edge start to each copy's start anchor. The copy
// extent is part of the span, so a count distributes whole copies
// between the two margins and a count the span cannot hold refuses.
export const edgeArrayStarts = ({
  edgeLength = 0,
  pattern = {},
  startOffset = 0,
  binding = 'start',
  copyLength = 0,
  copyMin = 0,
  singleAnchor = true,
  resolve = numeric
} = {}) => {
  const margin = Math.max(0, resolve(startOffset, 0));
  const extent = Math.max(0, resolve(copyLength, 0));
  const minOffset = resolve(copyMin, 0);
  const usableStart = margin - minOffset;
  const usableEnd = edgeLength - margin - (minOffset + extent);
  if (usableEnd < usableStart - 1e-6) {
    return { ok: false, starts: [], reason: 'edge too short for the profile at this margin' };
  }

  const mode = pattern.mode === 'spacing' ? 'spacing' : 'count';
  const normalizedBinding = normalizeEdgeBinding(binding);
  const requestedCount = Math.max(1, Math.round(resolve(pattern.count, 1)));
  const requestedSpacing = Math.max(0, resolve(pattern.spacing, 0));
  const pitch = extent + requestedSpacing;

  if (mode === 'spacing' && pitch > 0) {
    const span = Math.max(0, usableEnd - usableStart);
    if (normalizedBinding === 'end') {
      const starts = [];
      for (let distance = usableEnd; distance >= usableStart - 0.001; distance -= pitch) {
        starts.push(Math.max(usableStart, distance));
      }
      return { ok: true, starts, reason: '' };
    }
    const count = Math.max(1, Math.floor(span / pitch + 1e-6) + 1);
    const total = (count - 1) * pitch;
    const first = normalizedBinding === 'center'
      ? usableStart + (span - total) / 2
      : usableStart;
    return {
      ok: true,
      starts: Array.from({ length: count }, (_, index) => Math.min(usableEnd, first + pitch * index)),
      reason: ''
    };
  }

  if (requestedCount === 1) {
    const start = normalizedBinding === 'end'
      ? (singleAnchor ? edgeLength - margin : usableEnd)
      : normalizedBinding === 'center'
        ? (usableStart + usableEnd) / 2
        : (singleAnchor ? margin : usableStart);
    return { ok: true, starts: [start], reason: '' };
  }

  const step = (usableEnd - usableStart) / (requestedCount - 1);
  const starts = Array.from({ length: requestedCount }, (_, index) => usableStart + step * index);
  for (let index = 0; index < starts.length - 1; index += 1) {
    if (starts[index] + extent > starts[index + 1] + 1e-6) {
      return { ok: false, starts: [], reason: `copy ${index + 1} overlaps copy ${index + 2}` };
    }
  }
  return {
    ok: true,
    starts: normalizedBinding === 'end' ? starts.reverse() : starts,
    reason: ''
  };
};

export const expandOccsEdgeArray2d = ({
  vertices = [],
  pattern = {},
  origin = [0, 0],
  binding = 'start',
  copyLength = 0,
  copyMin = 0,
  singleAnchor = true,
  resolve = numeric
} = {}) => {
  const points = withoutClosingVertex(vertices);
  if (points.length < 2) return { ok: false, points: [], reason: 'host face has no contour' };
  const match = String(pattern.edge || 'E0').match(/\d+/);
  const edgeIndex = match ? Math.max(0, Math.round(numeric(match[0], 0))) % points.length : 0;
  const start = points[edgeIndex];
  const end = points[(edgeIndex + 1) % points.length];
  const edge = [end[0] - start[0], end[1] - start[1]];
  const edgeLength = Math.hypot(edge[0], edge[1]);
  if (edgeLength <= 1e-6) return { ok: false, points: [], reason: 'host edge is degenerate' };

  const axis = [edge[0] / edgeLength, edge[1] / edgeLength];
  const normal = [-axis[1], axis[0]];
  const startOffset = Math.max(0, resolve(origin?.[0], 0));
  const normalOffset = resolve(origin?.[1], 0);
  const layout = edgeArrayStarts({
    edgeLength,
    pattern,
    startOffset,
    binding,
    copyLength,
    copyMin,
    singleAnchor,
    resolve
  });
  if (!layout.ok) return { ok: false, points: [], reason: layout.reason };

  return {
    ok: true,
    reason: '',
    points: layout.starts.map((along, index) => ({
      x: start[0] + axis[0] * along + normal[0] * normalOffset,
      y: start[1] + axis[1] * along + normal[1] * normalOffset,
      along,
      edgeIndex,
      index,
      rotation: 0
    }))
  };
};

export const pointInPolygon = (point = [0, 0], polygon = []) => {
  const vertices = withoutClosingVertex(polygon);
  if (vertices.length < 3) return false;
  const x = numeric(point?.[0], 0);
  const y = numeric(point?.[1], 0);
  let inside = false;
  for (let index = 0, previousIndex = vertices.length - 1; index < vertices.length; previousIndex = index, index += 1) {
    const current = vertices[index];
    const previous = vertices[previousIndex];
    const xi = numeric(current?.[0], 0);
    const yi = numeric(current?.[1], 0);
    const xj = numeric(previous?.[0], 0);
    const yj = numeric(previous?.[1], 0);
    const crosses = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
};

const normalizedCopyBounds = (bounds = null) => {
  if (!bounds) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const minX = numeric(bounds.minX, 0);
  const maxX = numeric(bounds.maxX, 0);
  const minY = numeric(bounds.minY, 0);
  const maxY = numeric(bounds.maxY, 0);
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY)
  };
};

const axisPositions = ({ min, max, count, step, binding }) => {
  const span = max - min;
  if (span < -1e-6) return { ok: false, positions: [], reason: 'padding leaves no face span' };
  const normalizedCount = Math.max(1, Math.round(count));
  if (normalizedCount === 1) {
    const position = binding === 'end' ? max : binding === 'center' ? (min + max) / 2 : min;
    return { ok: true, positions: [position], reason: '', step: 0 };
  }
  if (step > 0) {
    const total = (normalizedCount - 1) * step;
    if (total > span + 1e-6) {
      return { ok: false, positions: [], reason: 'count at the requested step does not fit the face' };
    }
    const first = binding === 'center' ? min + (span - total) / 2 : binding === 'end' ? max - total : min;
    return {
      ok: true,
      positions: Array.from({ length: normalizedCount }, (_, index) => first + step * index),
      reason: '',
      step
    };
  }
  const fittedStep = span / (normalizedCount - 1);
  return {
    ok: true,
    positions: Array.from({ length: normalizedCount }, (_, index) => min + fittedStep * index),
    reason: '',
    step: fittedStep
  };
};

const polarPoints = ({ center, pattern, bounds, resolve }) => {
  const count = Math.max(1, Math.round(resolve(pattern.count, 6)));
  const startAngle = resolve(pattern.startAngle, 0);
  const sweep = resolve(pattern.sweep, 360);
  const radius = Math.max(0, resolve(pattern.radius, 0));
  const fitRadius = Math.max(0, Math.min(
    (bounds.maxX - bounds.minX) / 2,
    (bounds.maxY - bounds.minY) / 2
  ));
  const usedRadius = radius > 0 ? radius : fitRadius;
  if (usedRadius <= 0) return { ok: false, points: [], reason: 'polar array has no radius' };
  const fullCircle = Math.abs(sweep) >= 359.999;
  const angleStep = count === 1 ? 0 : (fullCircle ? sweep / count : sweep / (count - 1));
  const rotateItems = pattern.rotate !== false;
  return {
    ok: true,
    reason: '',
    points: Array.from({ length: count }, (_, index) => {
      const angle = startAngle + angleStep * index;
      const radians = angle * Math.PI / 180;
      return {
        x: center[0] + Math.cos(radians) * usedRadius,
        y: center[1] + Math.sin(radians) * usedRadius,
        rotation: rotateItems ? angle : 0,
        index
      };
    })
  };
};

// Two-dimensional placement on the host face. Padding is the clearance
// from the face outline to each copy's footprint. Count distributes
// copies across the padded span when the step is zero; a positive step
// starts at the shaped anchor and refuses when the grid does not fit.
// Hex staggers every other row by half the column step; polar places
// copies around the padded face center. Anchors outside the authored
// contour are dropped.
export const expandOccsFaceArray2d = ({
  vertices = [],
  pattern = {},
  binding = 'center',
  copyBounds = null,
  resolve = numeric
} = {}) => {
  const contour = withoutClosingVertex(vertices);
  if (contour.length < 3) return { ok: false, points: [], reason: 'host face has no contour' };
  const xs = contour.map(point => point[0]);
  const ys = contour.map(point => point[1]);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
  const copy = normalizedCopyBounds(copyBounds);
  const paddingX = Math.max(0, resolve(pattern.paddingX, 0));
  const paddingY = Math.max(0, resolve(pattern.paddingY, 0));
  const anchorMinX = bounds.minX + paddingX - copy.minX;
  const anchorMaxX = bounds.maxX - paddingX - copy.maxX;
  const anchorMinY = bounds.minY + paddingY - copy.minY;
  const anchorMaxY = bounds.maxY - paddingY - copy.maxY;
  if (anchorMaxX < anchorMinX - 1e-6) return { ok: false, points: [], reason: 'padding leaves no face width' };
  if (anchorMaxY < anchorMinY - 1e-6) return { ok: false, points: [], reason: 'padding leaves no face height' };

  const normalizedBinding = normalizeFaceBinding(binding);
  const layout = OCCS_FACE_ARRAY_LAYOUTS.includes(pattern.layout) ? pattern.layout : 'rectangular';

  if (layout === 'polar') {
    const boundsForRadius = {
      minX: anchorMinX,
      maxX: anchorMaxX,
      minY: anchorMinY,
      maxY: anchorMaxY
    };
    const result = polarPoints({
      center: [(anchorMinX + anchorMaxX) / 2, (anchorMinY + anchorMaxY) / 2],
      pattern,
      bounds: boundsForRadius,
      resolve
    });
    if (!result.ok) return result;
    const points = result.points.filter(point => pointInPolygon([point.x, point.y], contour));
    if (!points.length) return { ok: false, points: [], reason: 'face array places no copy inside the face' };
    return { ok: true, points, reason: '' };
  }

  const columns = axisPositions({
    min: anchorMinX,
    max: anchorMaxX,
    count: resolve(pattern.countX, 2),
    step: Math.max(0, resolve(pattern.stepX, 0)),
    binding: normalizedBinding
  });
  if (!columns.ok) return { ok: false, points: [], reason: columns.reason };
  const rows = axisPositions({
    min: anchorMinY,
    max: anchorMaxY,
    count: resolve(pattern.countY, 2),
    step: Math.max(0, resolve(pattern.stepY, 0)),
    binding: normalizedBinding
  });
  if (!rows.ok) return { ok: false, points: [], reason: rows.reason };

  const points = [];
  rows.positions.forEach((y, rowIndex) => {
    const stagger = layout === 'hex' && rowIndex % 2 === 1 ? columns.step / 2 : 0;
    columns.positions.forEach((x, columnIndex) => {
      const point = [x + stagger, y];
      if (point[0] > anchorMaxX + 1e-6) return;
      if (!pointInPolygon(point, contour)) return;
      points.push({ x: point[0], y: point[1], rotation: 0, row: rowIndex, column: columnIndex });
    });
  });
  if (!points.length) return { ok: false, points: [], reason: 'face array places no copy inside the face' };
  return { ok: true, points, reason: '' };
};
