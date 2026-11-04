// Placement arrays for cassette attachments. One versioned definition
// covers linear edge arrays, face grids, and radial arrays.

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

export const OCCS_ARRAY_VERSION = 1;
export const OCCS_ARRAY_SPACES = Object.freeze(['edge', 'face']);
export const OCCS_ARRAY_KINDS = Object.freeze(['linear', 'grid', 'radial']);
export const OCCS_ARRAY_MODES = Object.freeze(['count', 'step', 'gap', 'span']);
export const OCCS_ARRAY_BINDINGS = Object.freeze(['start', 'center', 'end']);
export const OCCS_ITEM_ORIENTATIONS = Object.freeze(['fixed', 'grid', 'radial', 'tangent']);
export const OCCS_FACE_ARRAY_LAYOUTS = Object.freeze(['rectangular', 'hex', 'polar']);

const AXIS_DEFAULTS = Object.freeze({
  mode: 'count',
  count: '2',
  step: '0',
  gap: '0',
  span: '0',
  start: '0',
  end: '0'
});

const FRAME_DEFAULTS = Object.freeze({
  rotation: '0',
  mirrorX: false,
  mirrorY: false
});

const STAGGER_DEFAULTS = Object.freeze({
  enabled: false,
  axis: 'x',
  amount: '0'
});

const POLAR_DEFAULTS = Object.freeze({
  centerX: '0',
  centerY: '0',
  rings: '1',
  count: '6',
  radius: '0',
  ringSpacing: '0',
  startAngle: '0',
  sweep: '360'
});

const ITEM_DEFAULTS = Object.freeze({
  rotation: '0',
  orientation: 'fixed',
  mirrorX: false,
  mirrorY: false
});

const pickEnum = (value, values, fallback) => (values.includes(value) ? value : fallback);

const normalizeAxis = (axis = {}, fallback = AXIS_DEFAULTS) => ({
  mode: pickEnum(axis.mode, OCCS_ARRAY_MODES, fallback.mode),
  count: axis.count ?? fallback.count,
  step: axis.step ?? fallback.step,
  gap: axis.gap ?? fallback.gap,
  span: axis.span ?? fallback.span,
  start: axis.start ?? fallback.start,
  end: axis.end ?? fallback.end
});

export const arrayDefaults = (source = {}) => {
  const space = pickEnum(source.space, OCCS_ARRAY_SPACES, 'edge');
  const kind = space === 'edge'
    ? 'linear'
    : pickEnum(source.kind, ['grid', 'radial'], 'grid');
  const axisFallback = space === 'edge'
    ? { ...AXIS_DEFAULTS, count: '1' }
    : AXIS_DEFAULTS;
  return {
    version: OCCS_ARRAY_VERSION,
    space,
    kind,
    edge: source.edge ?? 'E0',
    binding: pickEnum(source.binding, OCCS_ARRAY_BINDINGS, 'center'),
    singleAnchor: source.singleAnchor ?? true,
    normal: source.normal ?? '0',
    frame: { ...FRAME_DEFAULTS, ...(source.frame || {}) },
    x: normalizeAxis(source.x, axisFallback),
    y: normalizeAxis(source.y, axisFallback),
    stagger: {
      ...STAGGER_DEFAULTS,
      ...(source.stagger || {}),
      enabled: Boolean(source.stagger?.enabled),
      axis: source.stagger?.axis === 'y' ? 'y' : 'x'
    },
    polar: { ...POLAR_DEFAULTS, ...(source.polar || {}) },
    item: {
      ...ITEM_DEFAULTS,
      ...(source.item || {}),
      orientation: pickEnum(source.item?.orientation, OCCS_ITEM_ORIENTATIONS, 'fixed'),
      mirrorX: Boolean(source.item?.mirrorX),
      mirrorY: Boolean(source.item?.mirrorY)
    },
    suppress: Array.isArray(source.suppress)
      ? source.suppress.map(value => String(value)).filter(Boolean)
      : [],
    clip: source.clip === 'none' ? 'none' : 'face'
  };
};

const legacyEdgeArray = (pattern = {}, legacy = {}) => {
  const margin = legacy.edgeMargin ?? pattern.offsetX ?? '0';
  const spacing = pattern.spacing ?? '0';
  return arrayDefaults({
    space: 'edge',
    kind: 'linear',
    edge: pattern.edge || 'E0',
    binding: legacy.binding || pattern.binding || 'start',
    singleAnchor: true,
    normal: legacy.normalOffset ?? pattern.offsetY ?? '0',
    x: {
      mode: pattern.mode === 'spacing' ? 'gap' : 'count',
      count: pattern.count ?? '1',
      gap: spacing,
      step: '0',
      start: margin,
      end: margin
    },
    item: {
      rotation: legacy.rotation ?? pattern.rotation ?? '0',
      mirrorX: Boolean(legacy.mirrorX ?? pattern.mirrorX),
      mirrorY: Boolean(legacy.mirrorY ?? pattern.mirrorY)
    }
  });
};

const legacyFaceArray = (pattern = {}, legacy = {}) => {
  const layout = OCCS_FACE_ARRAY_LAYOUTS.includes(pattern.layout) ? pattern.layout : 'rectangular';
  const paddingX = pattern.paddingX ?? '0';
  const paddingY = pattern.paddingY ?? '0';
  return arrayDefaults({
    space: 'face',
    kind: layout === 'polar' ? 'radial' : 'grid',
    binding: legacy.binding || pattern.binding || 'center',
    x: {
      mode: numeric(pattern.stepX, 0) > 0 ? 'step' : 'count',
      count: pattern.countX ?? '2',
      step: pattern.stepX ?? '0',
      start: paddingX,
      end: paddingX
    },
    y: {
      mode: numeric(pattern.stepY, 0) > 0 ? 'step' : 'count',
      count: pattern.countY ?? '2',
      step: pattern.stepY ?? '0',
      start: paddingY,
      end: paddingY
    },
    stagger: {
      enabled: layout === 'hex',
      axis: 'x',
      amount: '0'
    },
    polar: {
      count: pattern.count ?? '6',
      radius: pattern.radius ?? '0',
      startAngle: pattern.startAngle ?? '0',
      sweep: pattern.sweep ?? '360'
    },
    item: {
      rotation: legacy.rotation ?? pattern.rotation ?? '0',
      orientation: layout === 'polar' && pattern.rotate !== false ? 'radial' : 'fixed',
      mirrorX: Boolean(legacy.mirrorX ?? pattern.mirrorX),
      mirrorY: Boolean(legacy.mirrorY ?? pattern.mirrorY)
    }
  });
};

export const mergeArrayDefinition = (base = {}, patch = {}) => arrayDefaults({
  ...(base || {}),
  ...(patch || {}),
  frame: { ...(base?.frame || {}), ...(patch?.frame || {}) },
  x: { ...(base?.x || {}), ...(patch?.x || {}) },
  y: { ...(base?.y || {}), ...(patch?.y || {}) },
  stagger: { ...(base?.stagger || {}), ...(patch?.stagger || {}) },
  polar: { ...(base?.polar || {}), ...(patch?.polar || {}) },
  item: { ...(base?.item || {}), ...(patch?.item || {}) },
  suppress: patch?.suppress ?? base?.suppress,
  clip: patch?.clip ?? base?.clip
});

export const rewriteArrayExpressions = (pattern = {}, rewrite = value => value) => {
  const array = normalizeArrayDefinition(pattern) || arrayDefaults();
  return {
    ...array,
    normal: rewrite(array.normal),
    frame: { ...array.frame, rotation: rewrite(array.frame.rotation) },
    x: {
      ...array.x,
      count: rewrite(array.x.count),
      step: rewrite(array.x.step),
      gap: rewrite(array.x.gap),
      span: rewrite(array.x.span),
      start: rewrite(array.x.start),
      end: rewrite(array.x.end)
    },
    y: {
      ...array.y,
      count: rewrite(array.y.count),
      step: rewrite(array.y.step),
      gap: rewrite(array.y.gap),
      span: rewrite(array.y.span),
      start: rewrite(array.y.start),
      end: rewrite(array.y.end)
    },
    stagger: { ...array.stagger, amount: rewrite(array.stagger.amount) },
    polar: {
      ...array.polar,
      centerX: rewrite(array.polar.centerX),
      centerY: rewrite(array.polar.centerY),
      rings: rewrite(array.polar.rings),
      count: rewrite(array.polar.count),
      radius: rewrite(array.polar.radius),
      ringSpacing: rewrite(array.polar.ringSpacing),
      startAngle: rewrite(array.polar.startAngle),
      sweep: rewrite(array.polar.sweep)
    },
    item: { ...array.item, rotation: rewrite(array.item.rotation) }
  };
};

export const resolveArrayDefinition = (pattern = {}, resolve = numeric, resolveAngle = resolve) => {
  const array = normalizeArrayDefinition(pattern) || arrayDefaults();
  return {
    ...array,
    normal: resolve(array.normal, 0),
    frame: { ...array.frame, rotation: resolveAngle(array.frame.rotation, 0) },
    x: {
      ...array.x,
      count: resolve(array.x.count, 1),
      step: resolve(array.x.step, 0),
      gap: resolve(array.x.gap, 0),
      span: resolve(array.x.span, 0),
      start: resolve(array.x.start, 0),
      end: resolve(array.x.end, 0)
    },
    y: {
      ...array.y,
      count: resolve(array.y.count, 2),
      step: resolve(array.y.step, 0),
      gap: resolve(array.y.gap, 0),
      span: resolve(array.y.span, 0),
      start: resolve(array.y.start, 0),
      end: resolve(array.y.end, 0)
    },
    stagger: { ...array.stagger, amount: resolve(array.stagger.amount, 0) },
    polar: {
      ...array.polar,
      centerX: resolve(array.polar.centerX, 0),
      centerY: resolve(array.polar.centerY, 0),
      rings: resolve(array.polar.rings, 1),
      count: resolve(array.polar.count, 6),
      radius: resolve(array.polar.radius, 0),
      ringSpacing: resolve(array.polar.ringSpacing, 0),
      startAngle: resolveAngle(array.polar.startAngle, 0),
      sweep: resolveAngle(array.polar.sweep, 360)
    },
    item: { ...array.item, rotation: resolveAngle(array.item.rotation, 0) }
  };
};

export const normalizeArrayDefinition = (pattern = null, legacy = {}) => {
  if (!pattern) return null;
  if (pattern.version || pattern.space) return arrayDefaults(pattern);
  if (pattern.type === 'edgeArray') return legacyEdgeArray(pattern, legacy);
  if (pattern.type === 'faceArray') return legacyFaceArray(pattern, legacy);
  return arrayDefaults(pattern);
};

export const OCCS_EDGE_ARRAY_DEFAULTS = Object.freeze(arrayDefaults({ space: 'edge', kind: 'linear' }));

const normalizeBinding = (binding = 'start') => (
  OCCS_ARRAY_BINDINGS.includes(binding) ? binding : 'start'
);

const singleAxisPosition = ({ min, max, binding }) => {
  if (binding === 'end') return max;
  if (binding === 'center') return (min + max) / 2;
  return min;
};

export const axisPositions = ({
  min,
  max,
  axis = {},
  binding = 'start',
  countDefault = 2,
  extent = 0,
  resolve = numeric
} = {}) => {
  const available = max - min;
  if (available < -1e-6) return { ok: false, positions: [], step: 0, reason: 'placement leaves no span' };
  const normalizedBinding = normalizeBinding(binding);
  const mode = pickEnum(axis.mode, OCCS_ARRAY_MODES, 'count');
  const count = Math.max(1, Math.round(resolve(axis.count, countDefault)));
  const step = Math.max(0, resolve(axis.step, 0));
  const gap = Math.max(0, resolve(axis.gap, 0));
  const span = Math.max(0, resolve(axis.span, 0));
  const pitch = mode === 'gap' ? Math.max(0, extent) + gap : step;

  if (mode === 'step' || mode === 'gap') {
    if (pitch <= 0) return { ok: false, positions: [], step: 0, reason: 'step is zero' };
    const fitted = Math.max(1, Math.floor(available / pitch + 1e-6) + 1);
    const total = (fitted - 1) * pitch;
    const first = normalizedBinding === 'end'
      ? max - total
      : normalizedBinding === 'center' ? min + (available - total) / 2 : min;
    const positions = Array.from({ length: fitted }, (_, index) => first + pitch * index);
    return {
      ok: true,
      positions: normalizedBinding === 'end' ? positions.reverse() : positions,
      step: pitch,
      reason: ''
    };
  }

  if (mode === 'span') {
    if (count === 1) {
      return { ok: true, positions: [singleAxisPosition({ min, max, binding: normalizedBinding })], step: 0, reason: '' };
    }
    if (span > available + 1e-6) {
      return { ok: false, positions: [], step: 0, reason: 'span does not fit the face' };
    }
    const total = span > 0 ? span : available;
    const first = normalizedBinding === 'end'
      ? max - total
      : normalizedBinding === 'center' ? min + (available - total) / 2 : min;
    const fittedStep = total / (count - 1);
    const positions = Array.from({ length: count }, (_, index) => first + fittedStep * index);
    return {
      ok: true,
      positions: normalizedBinding === 'end' ? positions.reverse() : positions,
      step: fittedStep,
      reason: ''
    };
  }

  if (count === 1) {
    return { ok: true, positions: [singleAxisPosition({ min, max, binding: normalizedBinding })], step: 0, reason: '' };
  }
  const fittedStep = available / (count - 1);
  if (extent > 0 && fittedStep < extent - 1e-6) {
    return { ok: false, positions: [], step: 0, reason: 'copy 1 overlaps copy 2' };
  }
  const positions = Array.from({ length: count }, (_, index) => min + fittedStep * index);
  return {
    ok: true,
    positions: normalizedBinding === 'end' ? positions.reverse() : positions,
    step: fittedStep,
    reason: ''
  };
};

export const linearArrayStarts = ({
  edgeLength = 0,
  pattern = {},
  copyLength = 0,
  copyMin = 0,
  resolve = numeric
} = {}) => {
  const array = normalizeArrayDefinition(pattern) || arrayDefaults({ space: 'edge', kind: 'linear' });
  const marginStart = Math.max(0, resolve(array.x.start, 0));
  const marginEnd = Math.max(0, resolve(array.x.end, 0));
  const extent = Math.max(0, resolve(copyLength, 0));
  const minOffset = resolve(copyMin, 0);
  const requestedCount = Math.max(1, Math.round(resolve(array.x.count, 1)));
  if (array.x.mode === 'count' && requestedCount === 1 && array.singleAnchor) {
    const position = array.binding === 'end'
      ? edgeLength - marginEnd
      : array.binding === 'center'
        ? (marginStart - minOffset + edgeLength - marginEnd - (minOffset + extent)) / 2
        : marginStart;
    return { ok: true, starts: [position], reason: '' };
  }
  const availableStart = marginStart - minOffset;
  const availableEnd = edgeLength - marginEnd - (minOffset + extent);
  if (availableEnd < availableStart - 1e-6) {
    return { ok: false, starts: [], reason: 'edge too short for the profile at this margin' };
  }
  const positions = axisPositions({
    min: availableStart,
    max: availableEnd,
    axis: array.x,
    binding: array.binding,
    countDefault: 1,
    extent,
    resolve
  });
  if (!positions.ok) return { ok: false, starts: [], reason: positions.reason };
  if (array.x.mode === 'count' && extent > 0 && positions.positions.length > 1) {
    const ordered = [...positions.positions].sort((left, right) => left - right);
    for (let index = 0; index < ordered.length - 1; index += 1) {
      if (ordered[index] + extent > ordered[index + 1] + 1e-6) {
        return { ok: false, starts: [], reason: `copy ${index + 1} overlaps copy ${index + 2}` };
      }
    }
  }
  return { ok: true, starts: positions.positions, reason: '' };
};

const rotatePointAround = (point, center, degrees) => {
  if (!degrees) return [point[0], point[1]];
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
};

const mirroredPoint = (point, center, frame = {}) => [
  frame.mirrorX ? center[0] - (point[0] - center[0]) : point[0],
  frame.mirrorY ? center[1] - (point[1] - center[1]) : point[1]
];

const copyCorners = (bounds, point, rotation) => {
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY]
  ];
  return corners.map(([x, y]) => {
    const rotated = rotatePointAround([point[0] + x, point[1] + y], point, rotation);
    return [rotated[0], rotated[1]];
  });
};

const copyInsideFace = (bounds, point, rotation, contour) => {
  if (!bounds) return pointInPolygon(point, contour);
  return copyCorners(bounds, point, rotation).every(corner => pointInPolygon(corner, contour));
};

const suppressed = (pattern, key) => (
  (pattern.suppress || []).some(value => String(value) === String(key))
);

const itemRotation = (pattern, angle = 0, frameRotation = 0) => {
  const base = numeric(pattern.item?.rotation, 0);
  const orientation = pattern.item?.orientation || 'fixed';
  if (orientation === 'radial') return angle + base;
  if (orientation === 'tangent') return angle + 90 + base;
  if (orientation === 'grid') return frameRotation + base;
  return base;
};

const faceBounds = (vertices = []) => {
  const contour = withoutClosingVertex(vertices);
  if (contour.length < 3) return null;
  const xs = contour.map(point => point[0]);
  const ys = contour.map(point => point[1]);
  return {
    contour,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
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

const expandGrid = ({ pattern, contour, bounds, copyBounds, resolve }) => {
  const copy = normalizedCopyBounds(copyBounds);
  const paddingXStart = Math.max(0, resolve(pattern.x.start, 0));
  const paddingXEnd = Math.max(0, resolve(pattern.x.end, 0));
  const paddingYStart = Math.max(0, resolve(pattern.y.start, 0));
  const paddingYEnd = Math.max(0, resolve(pattern.y.end, 0));
  const anchorMinX = bounds.minX + paddingXStart - copy.minX;
  const anchorMaxX = bounds.maxX - paddingXEnd - copy.maxX;
  const anchorMinY = bounds.minY + paddingYStart - copy.minY;
  const anchorMaxY = bounds.maxY - paddingYEnd - copy.maxY;
  if (anchorMaxX < anchorMinX - 1e-6) return { ok: false, copies: [], skipped: [], reason: 'padding leaves no face width' };
  if (anchorMaxY < anchorMinY - 1e-6) return { ok: false, copies: [], skipped: [], reason: 'padding leaves no face height' };

  const columns = axisPositions({
    min: anchorMinX,
    max: anchorMaxX,
    axis: pattern.x,
    binding: pattern.binding,
    countDefault: 2,
    extent: copy.maxX - copy.minX,
    resolve
  });
  if (!columns.ok) return { ok: false, copies: [], skipped: [], reason: columns.reason };
  const rows = axisPositions({
    min: anchorMinY,
    max: anchorMaxY,
    axis: pattern.y,
    binding: pattern.binding,
    countDefault: 2,
    extent: copy.maxY - copy.minY,
    resolve
  });
  if (!rows.ok) return { ok: false, copies: [], skipped: [], reason: rows.reason };

  const center = [(anchorMinX + anchorMaxX) / 2, (anchorMinY + anchorMaxY) / 2];
  const frameRotation = numeric(pattern.frame?.rotation, 0);
  const staggerEnabled = Boolean(pattern.stagger?.enabled);
  const staggerAxis = pattern.stagger?.axis === 'y' ? 'y' : 'x';
  const staggerAmount = numeric(pattern.stagger?.amount, 0);
  const copies = [];
  const skipped = [];
  const rotation = itemRotation(pattern, 0, frameRotation);

  rows.positions.forEach((y, row) => {
    columns.positions.forEach((x, column) => {
      const key = `${row}:${column}`;
      let point = [x, y];
      if (staggerEnabled) {
        const amount = staggerAmount > 0 ? staggerAmount : (staggerAxis === 'x' ? columns.step / 2 : rows.step / 2);
        if (staggerAxis === 'x' && row % 2 === 1) point[0] += amount;
        if (staggerAxis === 'y' && column % 2 === 1) point[1] += amount;
      }
      point = rotatePointAround(point, center, frameRotation);
      point = mirroredPoint(point, center, pattern.frame || {});
      if (suppressed(pattern, key)) {
        skipped.push({ key, reason: 'suppressed' });
        return;
      }
      if (pattern.clip !== 'none' && !copyInsideFace(copyBounds ? copy : null, point, rotation, contour)) {
        skipped.push({ key, reason: 'outside the face' });
        return;
      }
      copies.push({
        key,
        index: copies.length,
        row,
        column,
        x: point[0],
        y: point[1],
        rotation
      });
    });
  });
  if (!copies.length) return { ok: false, copies: [], skipped, reason: 'face array places no copy inside the face' };
  return { ok: true, copies, skipped, reason: '' };
};

const expandRadial = ({ pattern, contour, bounds, copyBounds, resolve }) => {
  const copy = normalizedCopyBounds(copyBounds);
  const center = [
    (bounds.minX + bounds.maxX) / 2 + resolve(pattern.polar.centerX, 0),
    (bounds.minY + bounds.maxY) / 2 + resolve(pattern.polar.centerY, 0)
  ];
  const rings = Math.max(1, Math.round(resolve(pattern.polar.rings, 1)));
  const count = Math.max(1, Math.round(resolve(pattern.polar.count, 6)));
  const ringSpacing = Math.max(0, resolve(pattern.polar.ringSpacing, 0));
  const authoredRadius = Math.max(0, resolve(pattern.polar.radius, 0));
  const fittedRadius = Math.max(0, Math.min(
    (bounds.maxX - bounds.minX) / 2 - Math.max(Math.abs(copy.minX), Math.abs(copy.maxX)),
    (bounds.maxY - bounds.minY) / 2 - Math.max(Math.abs(copy.minY), Math.abs(copy.maxY))
  ));
  const baseRadius = authoredRadius > 0 ? authoredRadius : fittedRadius;
  if (baseRadius <= 0) return { ok: false, copies: [], skipped: [], reason: 'radial array has no radius' };
  const startAngle = resolve(pattern.polar.startAngle, 0);
  const sweep = resolve(pattern.polar.sweep, 360);
  const fullCircle = Math.abs(sweep) >= 359.999;
  const angleStep = count === 1 ? 0 : (fullCircle ? sweep / count : sweep / (count - 1));
  const copies = [];
  const skipped = [];

  for (let ring = 0; ring < rings; ring += 1) {
    const radius = baseRadius + ring * ringSpacing;
    for (let index = 0; index < count; index += 1) {
      const key = `${ring}:${index}`;
      const angle = startAngle + angleStep * index;
      const radians = angle * Math.PI / 180;
      const point = [
        center[0] + Math.cos(radians) * radius,
        center[1] + Math.sin(radians) * radius
      ];
      const rotation = itemRotation(pattern, angle, angle);
      if (suppressed(pattern, key)) {
        skipped.push({ key, reason: 'suppressed' });
        continue;
      }
      if (pattern.clip !== 'none' && !copyInsideFace(copyBounds ? copy : null, point, rotation, contour)) {
        skipped.push({ key, reason: 'outside the face' });
        continue;
      }
      copies.push({
        key,
        index: copies.length,
        ring,
        column: index,
        x: point[0],
        y: point[1],
        rotation
      });
    }
  }
  if (!copies.length) return { ok: false, copies: [], skipped, reason: 'radial array places no copy inside the face' };
  return { ok: true, copies, skipped, reason: '' };
};

export const expandFeatureArray = ({
  vertices = [],
  pattern = {},
  copyLength = 0,
  copyMin = 0,
  copyBounds = null,
  resolve = numeric
} = {}) => {
  const array = normalizeArrayDefinition(pattern);
  if (!array) return { ok: false, copies: [], skipped: [], reason: 'array definition is missing' };
  if (array.space === 'edge') {
    const contour = withoutClosingVertex(vertices);
    if (contour.length < 2) return { ok: false, copies: [], skipped: [], reason: 'host face has no contour' };
    const edgeIndex = (() => {
      const match = String(array.edge || 'E0').match(/\d+/);
      return match ? Math.max(0, Math.round(numeric(match[0], 0))) % contour.length : 0;
    })();
    const start = contour[edgeIndex];
    const end = contour[(edgeIndex + 1) % contour.length];
    const edge = [end[0] - start[0], end[1] - start[1]];
    const edgeLength = Math.hypot(edge[0], edge[1]);
    if (edgeLength <= 1e-6) return { ok: false, copies: [], skipped: [], reason: 'host edge is degenerate' };
    const axis = [edge[0] / edgeLength, edge[1] / edgeLength];
    const normal = [-axis[1], axis[0]];
    const layout = linearArrayStarts({ edgeLength, pattern: array, copyLength, copyMin, resolve });
    if (!layout.ok) return { ok: false, copies: [], skipped: [], reason: layout.reason };
    const normalOffset = resolve(array.normal, 0);
    const rotation = itemRotation(array, 0, 0);
    const copies = layout.starts.map((along, index) => {
      const key = String(index);
      if (suppressed(array, key)) return null;
      return {
        key,
        index,
        along,
        edgeIndex,
        x: start[0] + axis[0] * along + normal[0] * normalOffset,
        y: start[1] + axis[1] * along + normal[1] * normalOffset,
        rotation
      };
    }).filter(Boolean);
    const skipped = layout.starts
      .map((along, index) => (suppressed(array, String(index)) ? { key: String(index), reason: 'suppressed' } : null))
      .filter(Boolean);
    if (!copies.length) return { ok: false, copies: [], skipped, reason: 'array places no copy on the edge' };
    return { ok: true, copies, skipped, reason: '' };
  }

  const bounds = faceBounds(vertices);
  if (!bounds) return { ok: false, copies: [], skipped: [], reason: 'host face has no contour' };
  return array.kind === 'radial'
    ? expandRadial({ pattern: array, contour: bounds.contour, bounds, copyBounds, resolve })
    : expandGrid({ pattern: array, contour: bounds.contour, bounds, copyBounds, resolve });
};

export const expandOccsEdgeArray2d = ({
  vertices = [],
  pattern = {},
  origin = [0, 0],
  binding = null,
  copyLength = 0,
  copyMin = 0,
  singleAnchor = true,
  resolve = numeric
} = {}) => {
  const legacy = pattern?.type === 'edgeArray'
    ? { edgeMargin: origin?.[0], normalOffset: origin?.[1], binding: binding || undefined }
    : {};
  const source = normalizeArrayDefinition(pattern, legacy) || arrayDefaults({ space: 'edge', kind: 'linear' });
  const array = arrayDefaults({
    ...source,
    ...(binding ? { binding } : {}),
    singleAnchor
  });
  const result = expandFeatureArray({ vertices, pattern: array, copyLength, copyMin, resolve });
  if (!result.ok) return { ok: false, points: [], reason: result.reason };
  return {
    ok: true,
    reason: '',
    points: result.copies.map(copy => ({
      x: copy.x,
      y: copy.y,
      along: copy.along,
      edgeIndex: copy.edgeIndex,
      index: copy.index,
      rotation: copy.rotation
    }))
  };
};

export const expandOccsFaceArray2d = ({
  vertices = [],
  pattern = {},
  binding = null,
  copyBounds = null,
  resolve = numeric
} = {}) => {
  const array = normalizeArrayDefinition(pattern) || arrayDefaults({ space: 'face', kind: 'grid' });
  const result = expandFeatureArray({
    vertices,
    pattern: { ...array, ...(binding ? { binding } : {}) },
    copyBounds,
    resolve
  });
  if (!result.ok) return { ok: false, points: [], reason: result.reason, skipped: result.skipped };
  return { ok: true, reason: '', points: result.copies, skipped: result.skipped };
};
