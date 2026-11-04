import { OCCS_LAYER_DIMENSION_CASSETTE } from './layers.js';
import { occsLayerExportName } from './layerStandards.js';

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const withoutClosingVertex = (vertices = []) => {
  if (vertices.length < 2) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return Math.abs(numeric(first?.[0]) - numeric(last?.[0])) <= 0.001 &&
    Math.abs(numeric(first?.[1]) - numeric(last?.[1])) <= 0.001
    ? vertices.slice(0, -1)
    : vertices;
};

const formatNumber = (value) => {
  const next = numeric(value, 0);
  return Number.isInteger(next) ? String(next) : next.toFixed(2).replace(/\.?0+$/, '');
};

const expressionText = (value, fallback = '') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const valueDescriptor = (expression, evaluated = null) => {
  const text = expressionText(expression);
  const fixed = text !== '' && Number.isFinite(Number(text));
  const descriptor = fixed
    ? { mode: 'fixed', value: Number(text) }
    : { mode: text === 'inherit' ? 'reference' : 'expression', expression: text };
  if (Number.isFinite(Number(evaluated))) descriptor.evaluated = Number(evaluated);
  return descriptor;
};

export const buildOccsFaceDimensionEntities = ({
  faceId,
  shape = {},
  target = faceId,
  baseValue = null,
  heightValue = null
} = {}) => {
  if (!faceId) return [];

  const baseExpression = expressionText(shape.baseLength, '');
  const heightExpression = expressionText(shape.height, '');
  const entities = [];

  if (baseExpression && baseExpression !== 'inherit') {
    entities.push({
      id: `dim_${faceId}_base`,
      layer: OCCS_LAYER_DIMENSION_CASSETTE,
      target,
      refs: [{ faceId, kind: 'edge', index: 0 }],
      value: valueDescriptor(baseExpression, baseValue),
      geometry: {
        type: 'dimension',
        dimensionType: 'linear',
        from: ['0', '0'],
        to: [baseExpression, '0'],
        offset: '-40',
        text: baseExpression
      }
    });
  }

  if (heightExpression) {
    entities.push({
      id: `dim_${faceId}_height`,
      layer: OCCS_LAYER_DIMENSION_CASSETTE,
      target,
      refs: [{ faceId, kind: 'height' }],
      value: valueDescriptor(heightExpression, heightValue),
      geometry: {
        type: 'dimension',
        dimensionType: 'linear',
        from: ['0', '0'],
        to: ['0', heightExpression],
        offset: '-32',
        text: heightExpression
      }
    });
  }

  return entities;
};

const point2d = (point = []) => [numeric(point[0]), numeric(point[1])];
const add = (left, right) => [left[0] + right[0], left[1] + right[1]];
const sub = (left, right) => [left[0] - right[0], left[1] - right[1]];
const mul = (point, scalar) => [point[0] * scalar, point[1] * scalar];
const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
const length = (point) => Math.hypot(point[0], point[1]);
const midpoint = (left, right) => [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];

const polygonCentroid = (points = []) => {
  if (!points.length) return [0, 0];
  return [
    points.reduce((sum, point) => sum + numeric(point[0]), 0) / points.length,
    points.reduce((sum, point) => sum + numeric(point[1]), 0) / points.length
  ];
};

const outwardNormal = (from, to, centroid) => {
  const vector = sub(to, from);
  const vectorLength = length(vector) || 1;
  const unit = [vector[0] / vectorLength, vector[1] / vectorLength];
  const candidates = [
    [unit[1], -unit[0]],
    [-unit[1], unit[0]]
  ];
  const mid = midpoint(from, to);
  const distanceToCentroid = length(sub(mid, centroid));
  const best = candidates
    .map(normal => ({ normal, distance: length(sub(add(mid, mul(normal, 1)), centroid)) }))
    .sort((left, right) => right.distance - left.distance)[0];
  return best?.distance > distanceToCentroid
    ? best.normal
    : candidates[0];
};

const dimensionOffset = ({ points = [], from, to, centroid, outsideOffset = 34 }) => {
  const outward = outwardNormal(from, to, centroid);
  const inward = mul(outward, -1);
  const insideSpan = Math.max(
    0,
    ...points.map(point => dot(sub(point, from), inward))
  );
  return insideSpan > 100
    ? { normal: inward, offset: 30 }
    : { normal: outward, offset: outsideOffset };
};

const dimensionAnnotation = ({ points = [], from, to, centroid, offset = 34, label, control = null }) => {
  const { normal, offset: resolvedOffset } = dimensionOffset({
    points,
    from,
    to,
    centroid,
    outsideOffset: offset
  });
  const dimFrom = add(from, mul(normal, resolvedOffset));
  const dimTo = add(to, mul(normal, resolvedOffset));
  const textPoint = add(midpoint(dimFrom, dimTo), mul(normal, 11));

  return {
    extentPoints: [from, to, dimFrom, dimTo, textPoint],
    annotation: control
      ? {
        nodeId: control.nodeId,
        key: control.key,
        dimensionKind: control.dimensionKind,
        from,
        to,
        loc: textPoint,
        rot: Math.atan2(to[1] - from[1], to[0] - from[0]),
        text: label
      }
      : null
  };
};

const baseDimensionSegment = (points = []) => {
  if (points.length < 2) return null;
  return [point2d(points[0]), point2d(points[1])];
};

const heightDimensionSegment = (points = [], curve = {}) => {
  if (points.length < 2) return null;
  const base = sub(point2d(points[1]), point2d(points[0]));
  const baseLength = length(base) || 1;
  const unit = [base[0] / baseLength, base[1] / baseLength];
  const inward = [-unit[1], unit[0]];
  const height = numeric(curve.trapezoid?.height, NaN);
  if (Number.isFinite(height) && height > 0) {
    return [point2d(points[0]), add(point2d(points[0]), mul(inward, height))];
  }

  const ys = points.map(point => numeric(point[1]));
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xs = points.map(point => numeric(point[0]));
  const minX = Math.min(...xs);
  return [[minX, minY], [minX, maxY]];
};

const dimensionLabel = (curve, kind, fallback) => {
  const custom = curve.dimensionLabels?.[kind];
  if (custom !== undefined && custom !== null) return custom;
  const value = kind === 'height'
    ? curve.trapezoid?.height
    : curve.trapezoid?.defaultLength;
  return Number.isFinite(Number(value)) ? formatNumber(value) : fallback;
};

const resolvedDimensionLabel = (curve, kind, fallback, options = {}) => {
  const custom = options.labelForDimension?.(curve, kind);
  return custom !== undefined && custom !== null
    ? custom
    : dimensionLabel(curve, kind, fallback);
};

export const buildOccsDimensionLayerFromFaceCurves = (curves = [], options = {}) => {
  const extentPoints = [];
  const annotations = [];
  let dimensionCount = 0;

  for (const curve of curves) {
    // Sketch faces carry their dimensions on the sketch layer.
    if (Array.isArray(curve.node?.sketch?.shapes)) continue;
    const points = withoutClosingVertex(curve.boundaryVertices || curve.vertices || []).map(point2d);
    if (points.length < 3) continue;

    const centroid = polygonCentroid(points);
    const baseSegment = baseDimensionSegment(points);
    const heightSegment = heightDimensionSegment(points, curve);
    const measuredLabel = (segment) => segment
      ? formatNumber(length(sub(segment[1], segment[0])))
      : '';
    const dimensions = [
      {
        kind: 'base',
        segment: baseSegment,
        label: resolvedDimensionLabel(curve, 'base', measuredLabel(baseSegment), options),
        value: curve.trapezoid?.defaultLength
      },
      {
        kind: 'height',
        segment: heightSegment,
        label: resolvedDimensionLabel(curve, 'height', measuredLabel(heightSegment), options),
        value: curve.trapezoid?.height
      }
    ];

    for (const dimension of dimensions) {
      if (!dimension.segment || !dimension.label) continue;
      const [from, to] = dimension.segment;
      if (length(sub(to, from)) <= 0.001) continue;
      const rendered = dimensionAnnotation({
        points,
        from,
        to,
        centroid,
        offset: dimension.kind === 'height' ? 44 : 34,
        label: dimension.label,
        control: curve.node?.id
          ? {
              nodeId: curve.node.id,
              key: dimension.kind === 'height' ? 'height' : 'defaultLength',
              value: dimension.label,
              dimensionKind: dimension.kind
            }
          : null
      });
      dimensionCount += 1;
      extentPoints.push(...rendered.extentPoints);
      if (rendered.annotation) annotations.push(rendered.annotation);
    }
  }

  if (!dimensionCount) return null;
  return {
    annotations,
    layer: {
      name: occsLayerExportName(OCCS_LAYER_DIMENSION_CASSETTE),
      standardCode: OCCS_LAYER_DIMENSION_CASSETTE,
      role: 'dimension',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: []
    },
    extentPoints
  };
};

export const buildOccsEvaluatedDimensionEntities = (curves = [], options = {}) => curves.flatMap((curve) => {
  const faceId = curve.node?.id || curve.id;
  if (!faceId) return [];
  const baseValue = numeric(curve.trapezoid?.defaultLength, NaN);
  const heightValue = numeric(curve.trapezoid?.height, NaN);
  return buildOccsFaceDimensionEntities({
    faceId,
    target: faceId,
    shape: {
      baseLength: Number.isFinite(baseValue) ? formatNumber(baseValue) : '',
      height: Number.isFinite(heightValue) ? formatNumber(heightValue) : ''
    },
    baseValue,
    heightValue
  }).map(entity => ({
    ...entity,
    value: {
      mode: 'measured',
      value: entity.id.endsWith('_height') ? heightValue : baseValue,
      unit: options.units || 'mm'
    }
  }));
});
