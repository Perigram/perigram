// Geometry base math: the pure functions behind the geometry-base node
// catalog. Conventions and value contracts live in the package README
// (workers/geometry-base/README.md).
export const ZERO_NORM_EPS = 1e-12;
export const ORTHONORMAL_EPS = 1e-6;
const WORLD_AXES = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];

function refusal(message) {
  throw new Error(message);
}

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refusal(`${name} must be a finite number, got ${typeof value === 'number' ? String(value) : JSON.stringify(value)}`);
  }
  return value;
}

export function isVector3(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && ['x', 'y', 'z'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key])));
}

function vector3(value, name) {
  if (!isVector3(value)) refusal(`${name} must be a { x, y, z } record of finite numbers`);
  return value;
}

function point3(value, name) {
  return vector3(value, name);
}

export function makePoint3({ x = 0, y = 0, z = 0 } = {}) {
  finiteNumber(x, 'x');
  finiteNumber(y, 'y');
  finiteNumber(z, 'z');
  return { x, y, z };
}

export function makeVector3({ x = 0, y = 0, z = 0 } = {}) {
  finiteNumber(x, 'x');
  finiteNumber(y, 'y');
  finiteNumber(z, 'z');
  return { x, y, z };
}

export function vectorBetween(from, to) {
  point3(from, 'from');
  point3(to, 'to');
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

export function vectorAdd(a, b) {
  vector3(a, 'a');
  vector3(b, 'b');
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vectorSubtract(a, b) {
  vector3(a, 'a');
  vector3(b, 'b');
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vectorScale(v, factor = 1) {
  vector3(v, 'v');
  finiteNumber(factor, 'factor');
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

export function vectorDot(a, b) {
  vector3(a, 'a');
  vector3(b, 'b');
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vectorCross(a, b) {
  vector3(a, 'a');
  vector3(b, 'b');
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function vectorNorm(v) {
  vector3(v, 'v');
  return Math.hypot(v.x, v.y, v.z);
}

export function vectorNormalize(v) {
  vector3(v, 'v');
  const norm = Math.hypot(v.x, v.y, v.z);
  if (norm < ZERO_NORM_EPS) refusal('cannot normalize a zero-length vector');
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm };
}

export function vectorAngle(a, b) {
  vector3(a, 'a');
  vector3(b, 'b');
  const cross = vectorCross(a, b);
  if (vectorNorm(a) < ZERO_NORM_EPS || vectorNorm(b) < ZERO_NORM_EPS) {
    refusal('the angle is undefined for a zero-length vector');
  }
  return Math.atan2(Math.hypot(cross.x, cross.y, cross.z), vectorDot(a, b));
}

export function pointTranslate(point, offset) {
  point3(point, 'point');
  vector3(offset, 'offset');
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}

export function pointDistance(a, b) {
  point3(a, 'a');
  point3(b, 'b');
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function makePlane(origin, normal) {
  point3(origin, 'origin');
  vector3(normal, 'normal');
  if (vectorNorm(normal) < ZERO_NORM_EPS) refusal('make-plane requires a non-zero normal vector');
  return { origin: { ...origin }, normal: vectorNormalize(normal) };
}

export function assertPlane(value, name = 'plane') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    refusal(`${name} must be a { origin, normal } record`);
  }
  point3(value.origin, `${name}.origin`);
  vector3(value.normal, `${name}.normal`);
  if (Math.abs(vectorNorm(value.normal) - 1) > ORTHONORMAL_EPS) {
    refusal(`${name}.normal must be unit length — construct planes through make-plane`);
  }
  return value;
}

export function planeNormal(plane) {
  assertPlane(plane, 'plane');
  return { ...plane.normal };
}

export function planeDistance(plane, point) {
  assertPlane(plane, 'plane');
  point3(point, 'point');
  return vectorDot(vectorSubtract(point, plane.origin), plane.normal);
}

// A frame's x axis aligns with the x axis hint as closely as
// orthogonality to z allows (Gram-Schmidt). A hint that is absent or
// parallel to z falls back to the world axis least aligned with z (ties
// break to the lowest axis), so the basis is deterministic.
function basisForZ(zUnit, xAxisHint) {
  let reference = xAxisHint && vectorNorm(xAxisHint) >= ZERO_NORM_EPS ? xAxisHint : null;
  if (reference && Math.abs(vectorDot(vectorNormalize(reference), zUnit)) >= 1 - ORTHONORMAL_EPS) {
    reference = null;
  }
  if (!reference) {
    reference = WORLD_AXES.reduce((best, axis) => (
      Math.abs(vectorDot(axis, zUnit)) < Math.abs(vectorDot(best, zUnit)) ? axis : best
    ), WORLD_AXES[0]);
  }
  const xAxis = vectorNormalize(vectorSubtract(
    reference,
    vectorScale(zUnit, vectorDot(reference, zUnit))
  ));
  const yAxis = vectorCross(zUnit, xAxis);
  return { xAxis, yAxis };
}

export function makeFrame(origin, zAxis, xAxisHint = null) {
  point3(origin, 'origin');
  vector3(zAxis, 'zAxis');
  if (vectorNorm(zAxis) < ZERO_NORM_EPS) refusal('make-frame requires a non-zero z axis');
  if (xAxisHint != null) vector3(xAxisHint, 'xAxisHint');
  const zUnit = vectorNormalize(zAxis);
  const { xAxis, yAxis } = basisForZ(zUnit, xAxisHint);
  return {
    origin: { ...origin },
    xAxis,
    yAxis,
    zAxis: zUnit
  };
}

export function frameFromPlane(plane) {
  assertPlane(plane, 'plane');
  const frame = makeFrame(plane.origin, plane.normal);
  return frame;
}

export function assertFrame(value, name = 'frame') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    refusal(`${name} must be a { origin, xAxis, yAxis, zAxis } record`);
  }
  point3(value.origin, `${name}.origin`);
  const axes = ['xAxis', 'yAxis', 'zAxis'].map(key => {
    vector3(value[key], `${name}.${key}`);
    return value[key];
  });
  const [xAxis, yAxis, zAxis] = axes;
  for (const [index, axis] of axes.entries()) {
    if (Math.abs(vectorNorm(axis) - 1) > ORTHONORMAL_EPS) {
      refusal(`${name}.${['xAxis', 'yAxis', 'zAxis'][index]} must be unit length — construct frames through make-frame`);
    }
  }
  const pairs = [[xAxis, yAxis], [xAxis, zAxis], [yAxis, zAxis]];
  if (pairs.some(([a, b]) => Math.abs(vectorDot(a, b)) > ORTHONORMAL_EPS)) {
    refusal(`${name} axes must be orthogonal — construct frames through make-frame`);
  }
  const handedness = vectorCross(xAxis, yAxis);
  if (Math.abs(handedness.x - zAxis.x) > ORTHONORMAL_EPS
    || Math.abs(handedness.y - zAxis.y) > ORTHONORMAL_EPS
    || Math.abs(handedness.z - zAxis.z) > ORTHONORMAL_EPS) {
    refusal(`${name} must be right-handed (xAxis × yAxis = zAxis)`);
  }
  return value;
}

export function frameOrigin(frame) {
  assertFrame(frame, 'frame');
  return { ...frame.origin };
}

export function frameAxis(frame, axis = 'z') {
  assertFrame(frame, 'frame');
  const key = `${String(axis).toLowerCase()}Axis`;
  if (!['xAxis', 'yAxis', 'zAxis'].includes(key)) {
    refusal('axis must be one of x, y, or z');
  }
  return { ...frame[key] };
}

export function pointToLocal(frame, point) {
  assertFrame(frame, 'frame');
  point3(point, 'point');
  const delta = vectorSubtract(point, frame.origin);
  return {
    x: vectorDot(delta, frame.xAxis),
    y: vectorDot(delta, frame.yAxis),
    z: vectorDot(delta, frame.zAxis)
  };
}

export function pointToWorld(frame, point) {
  assertFrame(frame, 'frame');
  point3(point, 'point');
  const alongAxes = vectorAdd(
    vectorAdd(vectorScale(frame.xAxis, point.x), vectorScale(frame.yAxis, point.y)),
    vectorScale(frame.zAxis, point.z)
  );
  return pointTranslate(frame.origin, alongAxes);
}

export function pointToVector(point) {
  point3(point, 'point');
  return { x: point.x, y: point.y, z: point.z };
}

export function vectorToPoint(vector) {
  vector3(vector, 'vector');
  return { x: vector.x, y: vector.y, z: vector.z };
}
