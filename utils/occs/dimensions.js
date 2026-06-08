import { OCCS_LAYER_DIMENSION_CASSETTE } from './layers.js';

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
const length = (point) => Math.hypot(point[0], point[1]);
const midpoint = (left, right) => [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
const svgPoint = (point) => [numeric(point[0]), -numeric(point[1])];

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

const dimensionPath = ({ from, to, centroid, offset = 34, label, id }) => {
  const normal = outwardNormal(from, to, centroid);
  const dimFrom = add(from, mul(normal, offset));
  const dimTo = add(to, mul(normal, offset));
  const textPoint = add(midpoint(dimFrom, dimTo), mul(normal, 11));
  const [fromX, fromY] = svgPoint(from);
  const [toX, toY] = svgPoint(to);
  const [dimFromX, dimFromY] = svgPoint(dimFrom);
  const [dimToX, dimToY] = svgPoint(dimTo);
  const [textX, textY] = svgPoint(textPoint);

  return {
    paths: [
      {
        id: `${id}_line`,
        d: `M ${fromX} ${fromY} L ${dimFromX} ${dimFromY} M ${toX} ${toY} L ${dimToX} ${dimToY} M ${dimFromX} ${dimFromY} L ${dimToX} ${dimToY}`,
        fill: 'none',
        stroke: 'layer'
      },
      {
        id: `${id}_text`,
        kind: 'text',
        x: textX,
        y: textY,
        text: label,
        fill: 'layer',
        fontSize: 12,
        textAnchor: 'middle',
        dominantBaseline: 'middle'
      }
    ],
    extentPoints: [from, to, dimFrom, dimTo, textPoint]
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
  if (custom) return custom;
  const value = kind === 'height'
    ? curve.trapezoid?.height
    : curve.trapezoid?.defaultLength;
  return Number.isFinite(Number(value)) ? formatNumber(value) : fallback;
};

export const buildOccsDimensionLayerFromFaceCurves = (curves = [], options = {}) => {
  const paths = [];
  const extentPoints = [];

  for (const curve of curves) {
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
        label: options.labelForDimension?.(curve, 'base') || dimensionLabel(curve, 'base', measuredLabel(baseSegment)),
        value: curve.trapezoid?.defaultLength
      },
      {
        kind: 'height',
        segment: heightSegment,
        label: options.labelForDimension?.(curve, 'height') || dimensionLabel(curve, 'height', measuredLabel(heightSegment)),
        value: curve.trapezoid?.height
      }
    ];

    for (const dimension of dimensions) {
      if (!dimension.segment || !dimension.label) continue;
      const [from, to] = dimension.segment;
      if (length(sub(to, from)) <= 0.001) continue;
      const id = `dim_${curve.node?.id || curve.id || 'face'}_${dimension.kind}`;
      const rendered = dimensionPath({
        from,
        to,
        centroid,
        offset: dimension.kind === 'height' ? 44 : 34,
        label: dimension.label,
        id
      });
      paths.push(...rendered.paths);
      extentPoints.push(...rendered.extentPoints);
    }
  }

  if (!paths.length) return null;
  return {
    layer: {
      name: OCCS_LAYER_DIMENSION_CASSETTE,
      standardCode: OCCS_LAYER_DIMENSION_CASSETTE,
      role: 'dimension',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths
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
