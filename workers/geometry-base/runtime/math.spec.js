// Geometry base math laws: arithmetic identities, orthonormal frame
// invariants, plane queries, and the degenerate-input policy.
import { describe, expect, it } from 'vitest';
import {
  makeFrame,
  makePlane,
  makePoint3,
  makeVector3,
  planeDistance,
  planeNormal,
  pointDistance,
  pointToLocal,
  pointToVector,
  pointToWorld,
  pointTranslate,
  vectorAdd,
  vectorAngle,
  vectorBetween,
  vectorCross,
  vectorDot,
  vectorNorm,
  vectorNormalize,
  vectorScale,
  vectorSubtract,
  vectorToPoint
} from './math.mjs';

const A = { x: 3, y: -4, z: 5 };
const B = { x: -1, y: 2, z: 2 };

describe('vector arithmetic laws', () => {
  it('add and subtract are inverse', () => {
    const sum = vectorAdd(A, B);
    expect(vectorSubtract(sum, B)).toEqual(A);
  });

  it('scales linearly and preserves direction under positive factors', () => {
    const doubled = vectorScale(A, 2);
    expect(doubled).toEqual({ x: 6, y: -8, z: 10 });
    expect(vectorNormalize(vectorScale(A, 3))).toEqual(vectorNormalize(A));
  });

  it('carries dot and cross bilinearity and anti-commutativity', () => {
    expect(vectorDot(A, B)).toBe(vectorDot(B, A));
    expect(vectorDot(A, vectorAdd(B, B))).toBeCloseTo(2 * vectorDot(A, B), 12);
    const cross = vectorCross(A, B);
    expect(vectorCross(B, A)).toEqual(vectorScale(cross, -1));
    expect(vectorCross(A, A)).toEqual({ x: 0, y: 0, z: 0 });
    expect(vectorDot(cross, A)).toBeCloseTo(0, 12);
    expect(vectorDot(cross, B)).toBeCloseTo(0, 12);
  });

  it('normalizes to unit length and preserves the direction', () => {
    const unit = vectorNormalize(A);
    expect(vectorNorm(unit)).toBeCloseTo(1, 12);
    expect(vectorAngle(A, unit)).toBeCloseTo(0, 12);
  });

  it('measures angles in radians over [0, π]', () => {
    const x = makeVector3({ x: 1 });
    const y = makeVector3({ y: 1 });
    expect(vectorAngle(x, x)).toBeCloseTo(0, 12);
    expect(vectorAngle(x, y)).toBeCloseTo(Math.PI / 2, 12);
    expect(vectorAngle(x, vectorScale(x, -1))).toBeCloseTo(Math.PI, 12);
  });
});

describe('point laws', () => {
  it('derives displacement between points and back', () => {
    const from = makePoint3({ x: 1, y: 2, z: 3 });
    const to = makePoint3({ x: 4, y: 6, z: 3 });
    expect(vectorBetween(from, to)).toEqual({ x: 3, y: 4, z: 0 });
    expect(pointTranslate(from, vectorBetween(from, to))).toEqual(to);
    expect(pointDistance(from, to)).toBeCloseTo(5, 12);
  });

  it('defaults construction to the origin', () => {
    expect(makePoint3()).toEqual({ x: 0, y: 0, z: 0 });
    expect(makeVector3()).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('plane laws', () => {
  it('constructs a unit normal regardless of input scale', () => {
    const plane = makePlane(makePoint3(), { x: 0, y: 0, z: 5 });
    expect(plane.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(planeNormal(plane)).toEqual(plane.normal);
  });

  it('signs distance by the normal side', () => {
    const plane = makePlane({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(planeDistance(plane, { x: 15, y: 4, z: -2 })).toBeCloseTo(5, 12);
    expect(planeDistance(plane, { x: 7, y: 0, z: 0 })).toBeCloseTo(-3, 12);
    expect(planeDistance(plane, plane.origin)).toBeCloseTo(0, 12);
  });

  it('refuses a malformed plane', () => {
    expect(() => planeNormal({ origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 2 } }))
      .toThrow(/unit length/);
    expect(() => planeDistance({ origin: null, normal: { x: 0, y: 0, z: 1 } }, { x: 0, y: 0, z: 0 }))
      .toThrow(/origin/);
  });
});

describe('frame laws', () => {
  const frame = makeFrame({ x: 1, y: 2, z: 3 }, { x: 0.3, y: 0.4, z: Math.SQRT1_2 }, { x: 0, y: 1, z: 0 });

  it('constructs an orthonormal right-handed basis', () => {
    const axes = [frame.xAxis, frame.yAxis, frame.zAxis];
    for (const axis of axes) expect(vectorNorm(axis)).toBeCloseTo(1, 12);
    for (const [first, second] of [[axes[0], axes[1]], [axes[0], axes[2]], [axes[1], axes[2]]]) {
      expect(vectorDot(first, second)).toBeCloseTo(0, 12);
    }
    const handedness = vectorCross(frame.xAxis, frame.yAxis);
    expect(handedness.x).toBeCloseTo(frame.zAxis.x, 12);
    expect(handedness.y).toBeCloseTo(frame.zAxis.y, 12);
    expect(handedness.z).toBeCloseTo(frame.zAxis.z, 12);
  });

  it('aligns the x axis with the hint as closely as orthogonality allows', () => {
    const hint = { x: 0, y: 1, z: 0 };
    const projection = vectorSubtract(hint, vectorScale(frame.zAxis, vectorDot(hint, frame.zAxis)));
    expect(frame.xAxis).toEqual(vectorNormalize(projection));
    const world = makeFrame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
    expect(world.xAxis).toEqual({ x: 1, y: 0, z: 0 });
    expect(world.yAxis).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('falls back deterministically to the world axis least aligned with z', () => {
    const vertical = makeFrame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(vertical.xAxis).toEqual({ x: 1, y: 0, z: 0 });
    expect(vertical.yAxis).toEqual({ x: 0, y: 1, z: 0 });
    const tilted = makeFrame({ x: 0, y: 0, z: 0 }, { x: 0.7071067811865476, y: 0.7071067811865476, z: 0 });
    expect(tilted.xAxis).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('round-trips points through frame coordinates', () => {
    const world = { x: 8.5, y: -3.25, z: 12 };
    const local = pointToLocal(frame, world);
    const restored = pointToWorld(frame, local);
    expect(restored.x).toBeCloseTo(world.x, 12);
    expect(restored.y).toBeCloseTo(world.y, 12);
    expect(restored.z).toBeCloseTo(world.z, 12);
    expect(pointToLocal(frame, frame.origin)).toEqual({ x: 0, y: 0, z: 0 });
    const onZ = pointToWorld(frame, { x: 0, y: 0, z: 2.5 });
    expect(pointDistance(onZ, pointToWorld(frame, { x: 0, y: 0, z: 0 }))).toBeCloseTo(2.5, 12);
  });

  it('derives a frame from a plane through its normal', () => {
    const plane = makePlane({ x: 5, y: 0, z: -2 }, { x: 1, y: 1, z: 0 });
    const derived = makeFrame(plane.origin, plane.normal);
    expect(derived.zAxis).toEqual(plane.normal);
  });

  it('refuses a skew or left-handed frame at consumers', () => {
    const skew = {
      ...frame,
      yAxis: vectorNormalize(vectorAdd(frame.yAxis, vectorScale(frame.xAxis, 0.1)))
    };
    expect(() => pointToLocal(skew, { x: 0, y: 0, z: 0 })).toThrow(/orthogonal/);
    const leftHanded = { ...frame, xAxis: frame.yAxis, yAxis: frame.xAxis };
    expect(() => pointToWorld(leftHanded, { x: 0, y: 0, z: 0 })).toThrow(/right-handed/);
    const nonUnit = { ...frame, zAxis: vectorScale(frame.zAxis, 2) };
    expect(() => pointToLocal(nonUnit, { x: 0, y: 0, z: 0 })).toThrow(/unit length/);
  });
});

describe('conversion exactness', () => {
  it('reinterprets points and vectors componentwise without loss', () => {
    const point = { x: 12.5, y: -0.125, z: 1e3 };
    expect(pointToVector(point)).toEqual(point);
    expect(vectorToPoint(point)).toEqual(point);
    expect(vectorToPoint(pointToVector(point))).toEqual(point);
  });
});

describe('degenerate input policy', () => {
  it('refuses zero-length vectors where a direction is required', () => {
    expect(() => vectorNormalize({ x: 0, y: 0, z: 0 })).toThrow(/zero-length/);
    expect(() => makePlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toThrow(/non-zero normal/);
    expect(() => makeFrame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toThrow(/non-zero z axis/);
    expect(() => vectorAngle({ x: 0, y: 0, z: 0 }, A)).toThrow(/zero-length/);
  });

  it('refuses non-finite numbers instead of propagating NaN', () => {
    expect(() => makePoint3({ x: Number.NaN })).toThrow(/finite number/);
    expect(() => makeVector3({ x: Infinity })).toThrow(/finite number/);
    expect(() => vectorScale(A, Number.NaN)).toThrow(/finite number/);
    expect(() => vectorAdd(A, { x: '1', y: 0, z: 0 })).toThrow(/\{ x, y, z \}/);
  });
});
