// The profile editor's derived canvas layers as native CadCraft entities:
// dimensions, the folded face hatch and outline, the zero axis, and the
// origin datum. Pure: the editor builds these from one evaluated sketch and
// hands them to CadCraftHost.annotate.
import { occProfileRectCornerVertices } from '../../occs/profiles.js';

export const PROFILE_ANNOTATION_LAYER = 'perigram-profile-annotations';
export const PROFILE_DIMENSION_LAYER = 'perigram-profile-dimensions';

export const OCCS_DIM_STYLE = Object.freeze({
  txt: 2.5,
  asz: 2.5,
  exe: 1.25,
  exo: 0.625,
  gap: 0.625,
  dli: 3.75,
  dec: 1,
  scale: 1
});
const DIM_STYLE = OCCS_DIM_STYLE;
const DIM_BASE_OFFSET = 7;
const DIM_STACK_STEP = 8;
const DIM_STACK_GAP = 2;

const point = (x, y) => ({ x: Number(x), y: Number(y) });
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const outwardNormal = (a, b, inward) => {
  const nx = b.y - a.y;
  const ny = a.x - b.x;
  const mid = midpoint(a, b);
  const dot = (inward.x - mid.x) * nx + (inward.y - mid.y) * ny;
  const out = dot > 0 ? { x: -nx, y: -ny } : { x: nx, y: ny };
  const length = Math.hypot(out.x, out.y) || 1;
  return { x: out.x / length, y: out.y / length };
};

const frameOf = (a, b, inward) => {
  const outward = outwardNormal(a, b, inward);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const side = horizontal
    ? (outward.y > 0 ? 'above' : 'below')
    : (outward.x > 0 ? 'right' : 'left');
  const along = horizontal ? [a.x, b.x] : [a.y, b.y];
  return {
    outward,
    side,
    alongMin: Math.min(...along),
    alongMax: Math.max(...along)
  };
};

const assignOffsets = (dimensions) => {
  const slots = { above: [], below: [], left: [], right: [] };
  for (const dimension of dimensions) {
    const placed = slots[dimension.side];
    let slot = 0;
    while ((placed[slot] || []).some(([min, max]) => (
      dimension.alongMin < max + DIM_STACK_GAP && dimension.alongMax > min - DIM_STACK_GAP
    ))) {
      slot += 1;
    }
    (placed[slot] ||= []).push([dimension.alongMin, dimension.alongMax]);
    dimension.offset = DIM_BASE_OFFSET + slot * DIM_STACK_STEP;
  }
};

const fieldLabel = (value, evaluated) => (
  typeof value === 'string' ? value : (Number.isFinite(evaluated) ? evaluated.toFixed(1) : '?')
);

const linearDimension = ({ kind = 'linear', key, a, b, inward, text, profile }) => ({
  kind,
  key,
  a,
  b,
  inward,
  text,
  profile: profile || null,
  ...frameOf(a, b, inward)
});

const dimensionEntity = (dimension) => {
  const mid = midpoint(dimension.a, dimension.b);
  return {
    type: 'dim',
    kind: dimension.kind,
    p1: dimension.a,
    p2: dimension.b,
    loc: {
      x: mid.x + dimension.outward.x * dimension.offset,
      y: mid.y + dimension.outward.y * dimension.offset
    },
    rot: Math.atan2(dimension.b.y - dimension.a.y, dimension.b.x - dimension.a.x),
    text: dimension.text,
    st: { ...DIM_STYLE },
    color: 8,
    layer: PROFILE_DIMENSION_LAYER,
    profile: dimension.profile,
    annotationKey: dimension.key
  };
};

const editableDimension = ({ shapeId, fieldKey, value, evaluated, a, b, inward, key }) => linearDimension({
  key,
  a,
  b,
  inward,
  text: fieldLabel(value, evaluated),
  profile: { shapeId, shapeIds: [shapeId], fieldKey }
});

const chainDimensions = (shape) => {
  const corners = shape.points.filter(point => !point.chord);
  const closed = shape.closed && corners.length >= 3;
  const centroid = corners.length
    ? corners
      .reduce((sum, item) => ({ x: sum.x + item.x, y: sum.y + item.y }), { x: 0, y: 0 })
      : { x: 0, y: 0 };
  if (corners.length) {
    centroid.x /= corners.length;
    centroid.y /= corners.length;
  }
  const dimensions = [];
  const edgeCount = corners.length >= 2 ? (closed ? corners.length : corners.length - 1) : 0;
  for (let index = 0; index < edgeCount; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    const a = point(from.x, from.y);
    const b = point(to.x, to.y);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    dimensions.push(linearDimension({
      kind: 'aligned',
      key: `${shape.id}-${from.id}-${to.id}`,
      a,
      b,
      inward: centroid,
      text: length.toFixed(1)
    }));
  }
  return dimensions;
};

const primitiveDimensions = (authoredShape, shape) => {
  const linear = [];
  const fixed = [];
  const push = (fieldKey, a, b, inward, value, evaluated) => {
    linear.push(editableDimension({
      shapeId: shape.id,
      fieldKey,
      value,
      evaluated,
      a,
      b,
      inward,
      key: `${shape.id}:${fieldKey}`
    }));
  };
  if (shape.type === 'rect') {
    const corners = occProfileRectCornerVertices(shape).map(([x, y]) => point(x, y));
    const centroid = midpoint(corners[0], corners[2]);
    const xs = corners.map(corner => corner.x);
    const ys = corners.map(corner => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    push('width', corners[0], corners[1], centroid,
      authoredShape?.width ?? shape.width, shape.width);
    push('height', corners[1], corners[2], centroid,
      authoredShape?.height ?? shape.height, shape.height);
    push('center-x', point(0, minY), point(centroid.x, minY), centroid,
      authoredShape?.center?.[0] ?? shape.center[0], shape.center[0]);
    push('center-y', point(minX, 0), point(minX, centroid.y), centroid,
      authoredShape?.center?.[1] ?? shape.center[1], shape.center[1]);
  }
  if (shape.type === 'circle') {
    const radius = shape.diameter / 2;
    const [cx, cy] = shape.center;
    const center = point(cx, cy);
    fixed.push({
      type: 'dim',
      kind: 'diameter',
      c: center,
      p1: point(cx + radius, cy),
      loc: center,
      text: fieldLabel(authoredShape?.diameter ?? shape.diameter, shape.diameter),
      st: { ...DIM_STYLE },
      color: 8,
      layer: PROFILE_DIMENSION_LAYER,
      profile: { shapeId: shape.id, fieldKey: 'diameter' },
      annotationKey: `${shape.id}:diameter`
    });
    push('center-x', point(0, cy - radius), point(cx, cy - radius), center,
      authoredShape?.center?.[0] ?? shape.center[0], shape.center[0]);
    push('center-y', point(cx - radius, 0), point(cx - radius, cy), center,
      authoredShape?.center?.[1] ?? shape.center[1], shape.center[1]);
  }
  return { linear, fixed };
};

const dedupePositionDimensions = (dimensions) => {
  const byKey = new Map();
  const unique = [];
  for (const dimension of dimensions) {
    const fieldKey = dimension.profile?.fieldKey;
    if (fieldKey !== 'center-x' && fieldKey !== 'center-y') {
      unique.push(dimension);
      continue;
    }
    const key = `${fieldKey}:${dimension.text}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.profile.shapeIds = [...new Set([
        ...(existing.profile.shapeIds || []),
        ...(dimension.profile.shapeIds || [])
      ])];
      continue;
    }
    byKey.set(key, dimension);
    unique.push(dimension);
  }
  return unique;
};

const ringsOf = (face) => (
  face
    ? [...(face.polygons || []), ...(face.holes || [])]
      .filter(ring => ring.length >= 3)
      .map(ring => ring.map(([x, y]) => point(x, y)))
    : []
);

/** The native CadCraft entities that carry the profile canvas annotations. */
export function buildProfileAnnotations({
  evaluated,
  authored = null,
  resolvedFace = null,
  basisStart = null,
  basisEnd = null,
  axisStart = null,
  axisEnd = null,
  contextFace = null
} = {}) {
  const shapes = evaluated?.shapes || [];
  const authoredById = new Map((authored?.shapes || []).map(shape => [shape.id, shape]));
  const primitives = shapes
    .filter(shape => shape.type === 'rect' || shape.type === 'circle')
    .map(shape => primitiveDimensions(authoredById.get(shape.id), shape));
  const linearDimensions = dedupePositionDimensions([
    ...shapes.filter(shape => shape.type === 'chain').flatMap(shape => chainDimensions(shape)),
    ...primitives.flatMap(primitive => primitive.linear)
  ]);
  const fixedDimensions = primitives.flatMap(primitive => primitive.fixed);
  assignOffsets(linearDimensions);
  const dimensions = [...fixedDimensions, ...linearDimensions.map(dimensionEntity)];

  const decorations = [];
  const rings = ringsOf(resolvedFace);
  if (rings.length) {
    decorations.push({
      type: 'hatch',
      loops: rings.map(ring => ring.flatMap(item => [item.x, item.y])),
      pattern: 'ANSI31',
      pscale: 2,
      color: '#94a3b8',
      layer: PROFILE_ANNOTATION_LAYER
    });
    for (const ring of rings) {
      decorations.push({
        type: 'poly',
        pts: ring,
        closed: true,
        color: 7,
        layer: PROFILE_ANNOTATION_LAYER
      });
    }
  }
  const contextPoints = Array.isArray(contextFace)
    ? contextFace.filter(vertices => Array.isArray(vertices) && vertices.length >= 2)
    : [];
  if (contextPoints.length >= 3) {
    decorations.push({
      type: 'poly',
      pts: contextPoints.map(([x, y]) => point(x, y)),
      closed: true,
      color: 8,
      layer: PROFILE_ANNOTATION_LAYER
    });
  }
  if (Number.isFinite(basisStart) && Number.isFinite(basisEnd) && basisEnd > basisStart) {
    decorations.push({
      type: 'poly',
      pts: [point(basisStart, 0), point(basisEnd, 0)],
      closed: false,
      color: 7,
      layer: PROFILE_ANNOTATION_LAYER
    });
  } else if (Number.isFinite(axisStart) && Number.isFinite(axisEnd) && axisEnd > axisStart) {
    decorations.push({
      type: 'poly',
      pts: [point(0, axisStart), point(0, axisEnd)],
      closed: false,
      color: 7,
      layer: PROFILE_ANNOTATION_LAYER
    });
  }
  decorations.push({ type: 'point', x: 0, y: 0, color: 7, layer: PROFILE_ANNOTATION_LAYER });
  return { dimensions, decorations };
}

/** The editable field a native dimension label edits, by its shape and field key. */
export function profileDimensionField(shape, fieldKey) {
  if (!shape) return null;
  if (fieldKey === 'width') {
    return { value: shape.width, read: subject => subject?.width, apply: (subject, next) => ({ ...subject, width: next }) };
  }
  if (fieldKey === 'height') {
    return { value: shape.height, read: subject => subject?.height, apply: (subject, next) => ({ ...subject, height: next }) };
  }
  if (fieldKey === 'diameter') {
    return { value: shape.diameter, read: subject => subject?.diameter, apply: (subject, next) => ({ ...subject, diameter: next }) };
  }
  if (fieldKey === 'center-x') {
    return { value: shape.center?.[0], read: subject => subject?.center?.[0], apply: (subject, next) => ({ ...subject, center: [next, subject.center[1]] }) };
  }
  if (fieldKey === 'center-y') {
    return { value: shape.center?.[1], read: subject => subject?.center?.[1], apply: (subject, next) => ({ ...subject, center: [subject.center[0], next] }) };
  }
  return null;
}
