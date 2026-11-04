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

export const hardwareHoleDiameter = (hardware = {}) => {
  const parameters = hardware.parameters || {};
  return numeric(parameters.holeDiameter, numeric(parameters.diameter, 5));
};

export const hardwareCopyBounds = (hardware = {}) => {
  const family = normalizeHardwareFamily(hardware.family);
  if (family === 'hanger_clip') {
    const parameters = hardware.parameters || {};
    const width = Math.max(1, numeric(parameters.width, 42));
    const height = Math.max(1, numeric(parameters.height, 28));
    return {
      minX: -width / 2,
      maxX: width / 2,
      minY: -height / 2,
      maxY: height / 2
    };
  }
  const radius = Math.max(0, hardwareHoleDiameter(hardware) / 2);
  return { minX: -radius, maxX: radius, minY: -radius, maxY: radius };
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
