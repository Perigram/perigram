export const OCCS_HARDWARE_FAMILIES = Object.freeze([
  'bolt',
  'nut',
  'washer',
  'rivet',
  'screw',
  'spacer',
  'standoff',
  'hanger_clip'
]);

export const OCCS_HANGER_PRODUCTION_MODES = Object.freeze([
  'sheetPart',
  'integralCut',
  'castSolid'
]);

export const OCCS_HOLE_HARDWARE_FAMILIES = Object.freeze([
  'bolt',
  'rivet',
  'screw',
  'spacer',
  'standoff'
]);

export const OCCS_EDGE_ARRAY_DEFAULTS = Object.freeze({
  type: 'edgeArray',
  edge: 'E0',
  mode: 'count',
  count: '1',
  spacing: '120'
});

const HARDWARE_DEFAULT_PARAMETERS = Object.freeze({
  bolt: { diameter: '6', length: '20' },
  nut: { diameter: '6', height: '5' },
  washer: { diameter: '12', holeDiameter: '6', thickness: '1.5' },
  rivet: { diameter: '4', length: '10' },
  screw: { diameter: '5', length: '16' },
  spacer: { diameter: '8', length: '20' },
  standoff: { diameter: '8', length: '20' },
  hanger_clip: { width: '42', height: '28', hookDepth: '12' }
});

const HARDWARE_LABELS = Object.freeze({
  bolt: 'Bolt',
  nut: 'Nut',
  washer: 'Washer',
  rivet: 'Rivet',
  screw: 'Screw',
  spacer: 'Spacer',
  standoff: 'Standoff',
  hanger_clip: 'Hanger clip'
});

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const normalizePoint = (point = [0, 0, 0]) => [
  numeric(point?.[0], 0),
  numeric(point?.[1], 0),
  numeric(point?.[2], 0)
];

const samePoint2d = (left, right, tolerance = 0.001) => (
  Math.abs(numeric(left?.[0]) - numeric(right?.[0])) <= tolerance &&
  Math.abs(numeric(left?.[1]) - numeric(right?.[1])) <= tolerance
);

const withoutClosingVertex = (vertices = []) => (
  vertices.length > 1 && samePoint2d(vertices[0], vertices[vertices.length - 1])
    ? vertices.slice(0, -1)
    : vertices
);

const normalize2 = (vector, fallback = [1, 0]) => {
  const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
  return length > 0 ? [vector[0] / length, vector[1] / length] : fallback;
};

export const normalizeHardwareFamily = (family = 'bolt') => (
  OCCS_HARDWARE_FAMILIES.includes(family) ? family : 'bolt'
);

export const normalizeHangerProductionMode = (mode = 'integralCut') => (
  OCCS_HANGER_PRODUCTION_MODES.includes(mode) ? mode : 'integralCut'
);

export const hardwareDefaultParameters = (family = 'bolt') => ({
  ...(HARDWARE_DEFAULT_PARAMETERS[normalizeHardwareFamily(family)] || HARDWARE_DEFAULT_PARAMETERS.bolt)
});

export const createOccsHardwareMetadata = ({ family = 'bolt', productionMode = '', parameters = {} } = {}) => {
  const normalizedFamily = normalizeHardwareFamily(family);
  const normalizedProductionMode = normalizedFamily === 'hanger_clip'
    ? normalizeHangerProductionMode(productionMode || 'integralCut')
    : '';
  return {
    family: normalizedFamily,
    ...(normalizedProductionMode ? { productionMode: normalizedProductionMode } : {}),
    parameters: {
      ...hardwareDefaultParameters(normalizedFamily),
      ...(parameters || {})
    }
  };
};

export const hardwareWorkpieceType = (family = 'bolt', productionMode = '') => {
  const normalizedFamily = normalizeHardwareFamily(family);
  if (normalizedFamily === 'hanger_clip') {
    const normalizedMode = normalizeHangerProductionMode(productionMode || 'integralCut');
    if (normalizedMode === 'sheetPart') return 'sheet';
    if (normalizedMode === 'castSolid') return 'solid';
  }
  return 'hardware';
};

export const hardwareLabel = (family = 'bolt', productionMode = '') => {
  const normalizedFamily = normalizeHardwareFamily(family);
  if (normalizedFamily === 'hanger_clip' && productionMode) {
    return `${HARDWARE_LABELS.hanger_clip} (${productionMode})`;
  }
  return HARDWARE_LABELS[normalizedFamily] || HARDWARE_LABELS.bolt;
};

export const isOccsHardwareWorkpiece = (workpiece = {}) => (
  Boolean(workpiece.hardware?.family) ||
  workpiece.type === 'hardware' ||
  workpiece.type === 'solid'
);

export const edgeArrayDefaults = (pattern = {}) => ({
  ...OCCS_EDGE_ARRAY_DEFAULTS,
  ...(pattern || {}),
  type: 'edgeArray',
  mode: pattern?.mode === 'spacing' ? 'spacing' : 'count'
});

const normalizeEdgeBinding = (binding = 'start') => {
  const value = String(binding || 'start');
  if (value === 'end') return 'end';
  if (value === 'center') return 'center';
  return 'start';
};

export const edgeArrayDistances = ({ edgeLength = 0, pattern = {}, startOffset = 0, binding = 'start', copyLength = 0, resolve = numeric } = {}) => {
  const margin = Math.max(0, startOffset);
  const usableStart = margin;
  const usableEnd = edgeLength - margin;
  if (usableEnd < usableStart) return [];

  const mode = pattern.mode === 'spacing' ? 'spacing' : 'count';
  const normalizedBinding = normalizeEdgeBinding(binding);
  const requestedCount = Math.max(1, Math.round(resolve(pattern.count, 1)));
  // Spacing is the GAP between adjacent copies, so a zero spacing butts
  // them together; the pitch a copy actually consumes is its own length
  // plus that gap. Point-like copies (hardware) pass no length and keep
  // spacing as their pitch.
  const requestedSpacing = Math.max(0, resolve(pattern.spacing, 0));
  const pitch = Math.max(0, copyLength) + requestedSpacing;

  if (mode === 'spacing' && pitch > 0) {
    if (normalizedBinding === 'end') {
      const distances = [];
      for (let distance = usableEnd; distance >= usableStart - 0.001; distance -= pitch) {
        distances.push(Math.max(usableStart, distance));
      }
      return distances;
    }

    const span = Math.max(0, usableEnd - usableStart);
    const count = Math.max(1, Math.floor(span / pitch) + 1);
    const total = (count - 1) * pitch;
    const first = normalizedBinding === 'center'
      ? usableStart + (span - total) / 2
      : usableStart;
    return Array.from({ length: count }, (_, index) => Math.min(usableEnd, first + pitch * index));
  }

  if (requestedCount === 1) {
    if (normalizedBinding === 'end') return [usableEnd];
    if (normalizedBinding === 'center') return [(usableStart + usableEnd) / 2];
    return [usableStart];
  }

  const spacing = Math.max(0, (usableEnd - usableStart) / (requestedCount - 1));
  const distances = Array.from({ length: requestedCount }, (_, index) => usableStart + spacing * index);
  return normalizedBinding === 'end' ? distances.reverse() : distances;
};

export const expandOccsEdgeArray2d = ({ vertices = [], pattern = {}, origin = [0, 0], binding = 'start', copyLength = 0, resolve = numeric } = {}) => {
  const points = withoutClosingVertex(vertices).map(normalizePoint);
  if (points.length < 2) return [];
  const match = String(pattern.edge || 'E0').match(/\d+/);
  const edgeIndex = match ? Math.max(0, Math.round(numeric(match[0], 0))) % points.length : 0;
  const start = points[edgeIndex];
  const end = points[(edgeIndex + 1) % points.length];
  const edge = [end[0] - start[0], end[1] - start[1]];
  const edgeLength = Math.sqrt(edge[0] * edge[0] + edge[1] * edge[1]);
  if (edgeLength <= 0.001) return [];

  const axis = normalize2(edge);
  const normal = normalize2([-axis[1], axis[0]], [0, 1]);
  const startOffset = Math.max(0, resolve(origin?.[0], 0));
  const normalOffset = resolve(origin?.[1], 0);
  const distances = edgeArrayDistances({ edgeLength, pattern, startOffset, binding, copyLength, resolve });

  return distances.map((along, index) => {
    return {
      x: start[0] + axis[0] * along + normal[0] * normalOffset,
      y: start[1] + axis[1] * along + normal[1] * normalOffset,
      along,
      edgeIndex,
      index
    };
  });
};

export const hardwareHoleDiameter = (hardware = {}) => {
  const parameters = hardware.parameters || {};
  return numeric(parameters.holeDiameter, numeric(parameters.diameter, 5));
};

export const hangerClipCutPolygon = (parameters = {}, point = [0, 0, 0]) => {
  const center = normalizePoint(point);
  const width = Math.max(1, numeric(parameters.width, 42));
  const height = Math.max(1, numeric(parameters.height, 28));
  const hookDepth = Math.max(0, Math.min(height / 2, numeric(parameters.hookDepth, 12)));
  const halfWidth = width / 2;
  const halfSlot = Math.max(1, halfWidth * 0.35);
  const top = center[1] + height / 2;
  const bottom = center[1] - height / 2;
  const notchY = top - hookDepth;

  return [
    [center[0] - halfWidth, bottom, center[2]],
    [center[0] + halfWidth, bottom, center[2]],
    [center[0] + halfWidth, notchY, center[2]],
    [center[0] + halfSlot, notchY, center[2]],
    [center[0] + halfSlot, top, center[2]],
    [center[0] - halfSlot, top, center[2]],
    [center[0] - halfSlot, notchY, center[2]],
    [center[0] - halfWidth, notchY, center[2]],
    [center[0] - halfWidth, bottom, center[2]]
  ];
};
