const pluginId = "geometry-base";
const name = "Geometry Base";
const description = "Canonical geometry kinds, coordinate conventions, and basic point, vector, plane, and frame operations";
const version = "1";
const declarations = /* @__PURE__ */ JSON.parse(`{"types":[],"runtimes":[{"id":"geometry-base","language":"javascript","version":"1","entry":"/runtime/geometry-base-bundle.mjs","targets":["browser","server"]}],"services":[{"id":"make-point3","label":"Point","description":"Construct a point from x, y, z coordinates","signature":{"input":{"base":"record","fields":{"x":{"base":"number","nullable":true,"default":0},"y":{"base":"number","nullable":true,"default":0},"z":{"base":"number","nullable":true,"default":0}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"make-vector3","label":"Vector","description":"Construct a vector from x, y, z components","signature":{"input":{"base":"record","fields":{"x":{"base":"number","nullable":true,"default":0},"y":{"base":"number","nullable":true,"default":0},"z":{"base":"number","nullable":true,"default":0}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-between","label":"Vector between points","description":"The displacement from one point to another","signature":{"input":{"base":"record","fields":{"from":{"base":"json","kind":"geometry.point3","unit":"mm"},"to":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-add","label":"Add vectors","description":"Sum two vectors","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.vector3","unit":"mm"},"b":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-subtract","label":"Subtract vectors","description":"Difference of two vectors","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.vector3","unit":"mm"},"b":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-scale","label":"Scale vector","description":"Multiply a vector by a scalar factor","signature":{"input":{"base":"record","fields":{"v":{"base":"json","kind":"geometry.vector3","unit":"mm"},"factor":{"base":"number","nullable":true,"default":1}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-dot","label":"Dot product","description":"Scalar product of two vectors","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.vector3","unit":"mm"},"b":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"number"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-cross","label":"Cross product","description":"Vector product of two vectors","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.vector3","unit":"mm"},"b":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-norm","label":"Vector length","description":"Euclidean length of a vector","signature":{"input":{"base":"record","fields":{"v":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"number","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-normalize","label":"Unit vector","description":"The unit-length direction of a vector","signature":{"input":{"base":"record","fields":{"v":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"vector-angle","label":"Angle between vectors","description":"The angle between two vectors, in radians","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.vector3","unit":"mm"},"b":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"number","kind":"geometry.angle"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"point-translate","label":"Translate point","description":"Move a point by a displacement vector","signature":{"input":{"base":"record","fields":{"point":{"base":"json","kind":"geometry.point3","unit":"mm"},"offset":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"point-distance","label":"Distance between points","description":"Euclidean distance between two points","signature":{"input":{"base":"record","fields":{"a":{"base":"json","kind":"geometry.point3","unit":"mm"},"b":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"number","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"points-vectors","label":"Points & vectors"}},{"id":"make-plane","label":"Plane","description":"Construct a plane from an origin point and a normal vector","signature":{"input":{"base":"record","fields":{"origin":{"base":"json","kind":"geometry.point3","unit":"mm"},"normal":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.plane","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"plane-normal","label":"Plane normal","description":"The unit normal of a plane","signature":{"input":{"base":"record","fields":{"plane":{"base":"json","kind":"geometry.plane","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"plane-distance","label":"Distance to plane","description":"Signed distance from a point to a plane; positive on the normal side","signature":{"input":{"base":"record","fields":{"plane":{"base":"json","kind":"geometry.plane","unit":"mm"},"point":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"number","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"make-frame","label":"Frame","description":"Construct a right-handed frame from an origin, a z axis, and an optional x axis hint","signature":{"input":{"base":"record","fields":{"origin":{"base":"json","kind":"geometry.point3","unit":"mm"},"zAxis":{"base":"json","kind":"geometry.vector3","unit":"mm"},"xAxisHint":{"base":"json","kind":"geometry.vector3","unit":"mm","nullable":true}}},"output":{"base":"json","kind":"geometry.frame","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"frame-from-plane","label":"Frame from plane","description":"A frame on a plane with a deterministic x axis","signature":{"input":{"base":"record","fields":{"plane":{"base":"json","kind":"geometry.plane","unit":"mm"}}},"output":{"base":"json","kind":"geometry.frame","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"frame-origin","label":"Frame origin","description":"The origin point of a frame","signature":{"input":{"base":"record","fields":{"frame":{"base":"json","kind":"geometry.frame","unit":"mm"}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"frame-axis","label":"Frame axis","description":"One basis axis of a frame: x, y, or z","signature":{"input":{"base":"record","fields":{"frame":{"base":"json","kind":"geometry.frame","unit":"mm"},"axis":{"base":"string","nullable":true,"default":"z"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"point-to-local","label":"Point to frame coordinates","description":"Express a world point in a frame's local coordinates","signature":{"input":{"base":"record","fields":{"frame":{"base":"json","kind":"geometry.frame","unit":"mm"},"point":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"point-to-world","label":"Point to world coordinates","description":"Place a frame-local point into world coordinates","signature":{"input":{"base":"record","fields":{"frame":{"base":"json","kind":"geometry.frame","unit":"mm"},"point":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"planes-frames","label":"Planes & frames"}},{"id":"point-to-vector","label":"Point to vector","description":"The displacement vector from the origin to a point","signature":{"input":{"base":"record","fields":{"point":{"base":"json","kind":"geometry.point3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.vector3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"conversions","label":"Conversions"}},{"id":"vector-to-point","label":"Vector to point","description":"The point at the tip of a displacement vector from the origin","signature":{"input":{"base":"record","fields":{"vector":{"base":"json","kind":"geometry.vector3","unit":"mm"}}},"output":{"base":"json","kind":"geometry.point3","unit":"mm"}},"execution":{"runtime":"geometry-base","kind":"pure","targets":["browser","server"],"capabilities":[],"deterministic":true,"idempotent":true},"palette":{"group":"conversions","label":"Conversions"}}]}`);
const listing = {
  pluginId,
  name,
  description,
  version,
  declarations
};
const TRANSPORT_SHAPES = Object.freeze(["item", "list", "tree", "map", "tuple", "stream"]);
const SHAPES = new Set(TRANSPORT_SHAPES);
const NODE_EXECUTION_KINDS = Object.freeze(["pure", "read", "stateful", "proposal", "commit", "effect", "control"]);
new Set(NODE_EXECUTION_KINDS);
const PORT_COMPATIBILITY_OUTCOMES = Object.freeze(["exact", "safe-coercion", "conditional", "conversion-required", "incompatible"]);
new Set(PORT_COMPATIBILITY_OUTCOMES);
const CONVERSION_FIDELITIES = Object.freeze(["lossless", "semantically-lossy", "visual-only"]);
new Set(CONVERSION_FIDELITIES);
const SERVICE_SEMANTIC_KEYS = ["kind", "representation", "nominal", "provider", "schema", "entityType", "identity", "constraints", "unit"];
function servicePortContract(schema = {}) {
  const shape = SHAPES.has(schema.base) ? schema.base : "item";
  const semanticSource = shape === "item" ? schema : schema.itemType || { base: "json" };
  const semantic = { base: semanticSource.base || "json" };
  for (const key of SERVICE_SEMANTIC_KEYS) {
    if (Object.hasOwn(semanticSource.semantic || {}, key)) semantic[key] = semanticSource.semantic[key];
    if (Object.hasOwn(semanticSource, key)) semantic[key] = semanticSource[key];
  }
  if (schema.nullable === true || semanticSource.nullable === true) semantic.nullable = true;
  return { shape, semantic };
}
function nodeDefinitionFromService(service, { provider, runtimeId } = {}) {
  return {
    provider,
    id: service.id,
    version: String(service.nodeVersion || "1"),
    label: service.label || service.id,
    ...service.description ? { description: service.description } : {},
    palette: {
      group: service.palette.group,
      ...service.palette.label ? { label: service.palette.label } : {},
      keywords: service.palette.keywords || []
    },
    inputs: Object.entries(service.signature?.input?.fields || {}).map(([id, field]) => ({
      id,
      label: field.label || id,
      ...servicePortContract(field),
      required: field.nullable !== true,
      ...Object.hasOwn(field, "default") ? { default: field.default } : {},
      ...field.description ? { description: field.description } : {}
    })),
    outputs: [{
      id: "value",
      label: service.signature?.output?.label || "Value",
      ...servicePortContract(service.signature?.output || {}),
      required: true
    }],
    ...service.configuration ? { configuration: service.configuration } : {},
    execution: {
      runtime: runtimeId,
      kind: service.execution.kind,
      targets: service.execution.targets,
      capabilities: service.execution.capabilities || [],
      deterministic: service.execution.deterministic === true,
      idempotent: service.execution.idempotent === true
    }
  };
}
const ZERO_NORM_EPS = 1e-12;
const ORTHONORMAL_EPS = 1e-6;
const WORLD_AXES = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
function refusal(message) {
  throw new Error(message);
}
function finiteNumber(value, name2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    refusal(`${name2} must be a finite number, got ${typeof value === "number" ? String(value) : JSON.stringify(value)}`);
  }
  return value;
}
function isVector3(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && ["x", "y", "z"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key])));
}
function vector3(value, name2) {
  if (!isVector3(value)) refusal(`${name2} must be a { x, y, z } record of finite numbers`);
  return value;
}
function point3(value, name2) {
  return vector3(value, name2);
}
function makePoint3({ x = 0, y = 0, z = 0 } = {}) {
  finiteNumber(x, "x");
  finiteNumber(y, "y");
  finiteNumber(z, "z");
  return { x, y, z };
}
function makeVector3({ x = 0, y = 0, z = 0 } = {}) {
  finiteNumber(x, "x");
  finiteNumber(y, "y");
  finiteNumber(z, "z");
  return { x, y, z };
}
function vectorBetween(from, to) {
  point3(from, "from");
  point3(to, "to");
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}
function vectorAdd(a, b) {
  vector3(a, "a");
  vector3(b, "b");
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vectorSubtract(a, b) {
  vector3(a, "a");
  vector3(b, "b");
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vectorScale(v, factor = 1) {
  vector3(v, "v");
  finiteNumber(factor, "factor");
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}
function vectorDot(a, b) {
  vector3(a, "a");
  vector3(b, "b");
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function vectorCross(a, b) {
  vector3(a, "a");
  vector3(b, "b");
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function vectorNorm(v) {
  vector3(v, "v");
  return Math.hypot(v.x, v.y, v.z);
}
function vectorNormalize(v) {
  vector3(v, "v");
  const norm = Math.hypot(v.x, v.y, v.z);
  if (norm < ZERO_NORM_EPS) refusal("cannot normalize a zero-length vector");
  return { x: v.x / norm, y: v.y / norm, z: v.z / norm };
}
function vectorAngle(a, b) {
  vector3(a, "a");
  vector3(b, "b");
  const cross = vectorCross(a, b);
  if (vectorNorm(a) < ZERO_NORM_EPS || vectorNorm(b) < ZERO_NORM_EPS) {
    refusal("the angle is undefined for a zero-length vector");
  }
  return Math.atan2(Math.hypot(cross.x, cross.y, cross.z), vectorDot(a, b));
}
function pointTranslate(point, offset) {
  point3(point, "point");
  vector3(offset, "offset");
  return { x: point.x + offset.x, y: point.y + offset.y, z: point.z + offset.z };
}
function pointDistance(a, b) {
  point3(a, "a");
  point3(b, "b");
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function makePlane(origin, normal) {
  point3(origin, "origin");
  vector3(normal, "normal");
  if (vectorNorm(normal) < ZERO_NORM_EPS) refusal("make-plane requires a non-zero normal vector");
  return { origin: { ...origin }, normal: vectorNormalize(normal) };
}
function assertPlane(value, name2 = "plane") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    refusal(`${name2} must be a { origin, normal } record`);
  }
  point3(value.origin, `${name2}.origin`);
  vector3(value.normal, `${name2}.normal`);
  if (Math.abs(vectorNorm(value.normal) - 1) > ORTHONORMAL_EPS) {
    refusal(`${name2}.normal must be unit length — construct planes through make-plane`);
  }
  return value;
}
function planeNormal(plane) {
  assertPlane(plane, "plane");
  return { ...plane.normal };
}
function planeDistance(plane, point) {
  assertPlane(plane, "plane");
  point3(point, "point");
  return vectorDot(vectorSubtract(point, plane.origin), plane.normal);
}
function basisForZ(zUnit, xAxisHint) {
  let reference = xAxisHint && vectorNorm(xAxisHint) >= ZERO_NORM_EPS ? xAxisHint : null;
  if (reference && Math.abs(vectorDot(vectorNormalize(reference), zUnit)) >= 1 - ORTHONORMAL_EPS) {
    reference = null;
  }
  if (!reference) {
    reference = WORLD_AXES.reduce((best, axis) => Math.abs(vectorDot(axis, zUnit)) < Math.abs(vectorDot(best, zUnit)) ? axis : best, WORLD_AXES[0]);
  }
  const xAxis = vectorNormalize(vectorSubtract(
    reference,
    vectorScale(zUnit, vectorDot(reference, zUnit))
  ));
  const yAxis = vectorCross(zUnit, xAxis);
  return { xAxis, yAxis };
}
function makeFrame(origin, zAxis, xAxisHint = null) {
  point3(origin, "origin");
  vector3(zAxis, "zAxis");
  if (vectorNorm(zAxis) < ZERO_NORM_EPS) refusal("make-frame requires a non-zero z axis");
  if (xAxisHint != null) vector3(xAxisHint, "xAxisHint");
  const zUnit = vectorNormalize(zAxis);
  const { xAxis, yAxis } = basisForZ(zUnit, xAxisHint);
  return {
    origin: { ...origin },
    xAxis,
    yAxis,
    zAxis: zUnit
  };
}
function frameFromPlane(plane) {
  assertPlane(plane, "plane");
  const frame = makeFrame(plane.origin, plane.normal);
  return frame;
}
function assertFrame(value, name2 = "frame") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    refusal(`${name2} must be a { origin, xAxis, yAxis, zAxis } record`);
  }
  point3(value.origin, `${name2}.origin`);
  const axes = ["xAxis", "yAxis", "zAxis"].map((key) => {
    vector3(value[key], `${name2}.${key}`);
    return value[key];
  });
  const [xAxis, yAxis, zAxis] = axes;
  for (const [index, axis] of axes.entries()) {
    if (Math.abs(vectorNorm(axis) - 1) > ORTHONORMAL_EPS) {
      refusal(`${name2}.${["xAxis", "yAxis", "zAxis"][index]} must be unit length — construct frames through make-frame`);
    }
  }
  const pairs = [[xAxis, yAxis], [xAxis, zAxis], [yAxis, zAxis]];
  if (pairs.some(([a, b]) => Math.abs(vectorDot(a, b)) > ORTHONORMAL_EPS)) {
    refusal(`${name2} axes must be orthogonal — construct frames through make-frame`);
  }
  const handedness = vectorCross(xAxis, yAxis);
  if (Math.abs(handedness.x - zAxis.x) > ORTHONORMAL_EPS || Math.abs(handedness.y - zAxis.y) > ORTHONORMAL_EPS || Math.abs(handedness.z - zAxis.z) > ORTHONORMAL_EPS) {
    refusal(`${name2} must be right-handed (xAxis × yAxis = zAxis)`);
  }
  return value;
}
function frameOrigin(frame) {
  assertFrame(frame, "frame");
  return { ...frame.origin };
}
function frameAxis(frame, axis = "z") {
  assertFrame(frame, "frame");
  const key = `${String(axis).toLowerCase()}Axis`;
  if (!["xAxis", "yAxis", "zAxis"].includes(key)) {
    refusal("axis must be one of x, y, or z");
  }
  return { ...frame[key] };
}
function pointToLocal(frame, point) {
  assertFrame(frame, "frame");
  point3(point, "point");
  const delta = vectorSubtract(point, frame.origin);
  return {
    x: vectorDot(delta, frame.xAxis),
    y: vectorDot(delta, frame.yAxis),
    z: vectorDot(delta, frame.zAxis)
  };
}
function pointToWorld(frame, point) {
  assertFrame(frame, "frame");
  point3(point, "point");
  const alongAxes = vectorAdd(
    vectorAdd(vectorScale(frame.xAxis, point.x), vectorScale(frame.yAxis, point.y)),
    vectorScale(frame.zAxis, point.z)
  );
  return pointTranslate(frame.origin, alongAxes);
}
function pointToVector(point) {
  point3(point, "point");
  return { x: point.x, y: point.y, z: point.z };
}
function vectorToPoint(vector) {
  vector3(vector, "vector");
  return { x: vector.x, y: vector.y, z: vector.z };
}
const GEOMETRY_PROVIDER = "plugin.geometry-base";
const RUNTIME_ID = "geometry-base";
const OPERATIONS = {
  "make-point3": (input) => makePoint3(input),
  "make-vector3": (input) => makeVector3(input),
  "vector-between": (input) => vectorBetween(input.from, input.to),
  "vector-add": (input) => vectorAdd(input.a, input.b),
  "vector-subtract": (input) => vectorSubtract(input.a, input.b),
  "vector-scale": (input) => vectorScale(input.v, input.factor),
  "vector-dot": (input) => vectorDot(input.a, input.b),
  "vector-cross": (input) => vectorCross(input.a, input.b),
  "vector-norm": (input) => vectorNorm(input.v),
  "vector-normalize": (input) => vectorNormalize(input.v),
  "vector-angle": (input) => vectorAngle(input.a, input.b),
  "point-translate": (input) => pointTranslate(input.point, input.offset),
  "point-distance": (input) => pointDistance(input.a, input.b),
  "make-plane": (input) => makePlane(input.origin, input.normal),
  "plane-normal": (input) => planeNormal(input.plane),
  "plane-distance": (input) => planeDistance(input.plane, input.point),
  "make-frame": (input) => makeFrame(input.origin, input.zAxis, input.xAxisHint ?? null),
  "frame-from-plane": (input) => frameFromPlane(input.plane),
  "frame-origin": (input) => frameOrigin(input.frame),
  "frame-axis": (input) => frameAxis(input.frame, input.axis),
  "point-to-local": (input) => pointToLocal(input.frame, input.point),
  "point-to-world": (input) => pointToWorld(input.frame, input.point),
  "point-to-vector": (input) => pointToVector(input.point),
  "vector-to-point": (input) => vectorToPoint(input.vector)
};
const CONVERSIONS = [
  {
    id: "point3-to-vector3",
    from: { base: "json", kind: "geometry.point3", unit: "mm" },
    to: { base: "json", kind: "geometry.vector3", unit: "mm" },
    provider: GEOMETRY_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: "lossless"
  },
  {
    id: "vector3-to-point3",
    from: { base: "json", kind: "geometry.vector3", unit: "mm" },
    to: { base: "json", kind: "geometry.point3", unit: "mm" },
    provider: GEOMETRY_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: "lossless"
  }
];
function nodeDefinitions(source = listing, runtimeId = RUNTIME_ID, provider = GEOMETRY_PROVIDER) {
  const runtime = source.declarations?.runtimes?.find((item) => item.id === runtimeId);
  if (!runtime) throw new Error(`Geometry runtime declaration is missing: ${runtimeId}`);
  return source.declarations.services.filter((service) => service.execution?.runtime === runtimeId && service.execution.targets?.includes("browser") && service.palette?.visible !== false && service.palette?.group).map((service) => nodeDefinitionFromService(service, { provider, runtimeId }));
}
function createRuntime() {
  return {
    execute(operationId, input = {}) {
      const operation = OPERATIONS[operationId];
      if (!operation) throw new Error(`Unsupported geometry-base operation: ${operationId}`);
      const graphInvocation = input?.mode === "preview" && input?.inputs && typeof input.inputs === "object";
      const value = operation(graphInvocation ? input.inputs : input);
      return graphInvocation ? { value } : value;
    },
    providers: [{
      provider: GEOMETRY_PROVIDER,
      definitions: nodeDefinitions(),
      conversions: CONVERSIONS
    }]
  };
}
export {
  CONVERSIONS,
  GEOMETRY_PROVIDER,
  RUNTIME_ID,
  createRuntime,
  nodeDefinitions
};
