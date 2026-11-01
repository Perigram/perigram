// The profile editor's derived canvas annotations as native CadCraft
// entities: dimensions, the folded face hatch and outline, the zero axis
// and the origin datum. Pure: the editor builds these from one evaluated
// sketch and hands them to CadCraftHost.annotate.
import { occProfileRectCornerVertices } from '../../occs/profiles.js';

export const PROFILE_ANNOTATION_LAYER = 'perigram-profile-annotations';

const DIM_STYLE = Object.freeze({
  txt: 2.5,
  asz: 2.5,
  exe: 1.25,
  exo: 0.625,
  gap: 0.625,
  dli: 3.75,
  dec: 1,
  scale: 1
});
const DIM_BASE_OFFSET = 7;
const DIM_STACK_STEP = 8;

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

const createDimStack = () => {
  const slots = new Map();
  return (a, b, outward) => {
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const side = horizontal
      ? (outward.y > 0 ? 'above' : 'below')
      : (outward.x > 0 ? 'right' : 'left');
    const along = horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
    const slotKey = `${side}:${Math.round(along / 12)}`;
    const slot = slots.get(slotKey) || 0;
    slots.set(slotKey, slot + 1);
    return DIM_BASE_OFFSET + slot * DIM_STACK_STEP;
  };
};

const fieldLabel = (value, evaluated) => (
  typeof value === 'string' ? value : (Number.isFinite(evaluated) ? evaluated.toFixed(1) : '?')
);

const dimension = ({ kind, key, a, b, inward, text, profile, stack }) => {
  const outward = outwardNormal(a, b, inward);
  const offset = stack(a, b, outward);
  const mid = midpoint(a, b);
  return {
    type: 'dim',
    kind,
    p1: a,
    p2: b,
    loc: { x: mid.x + outward.x * offset, y: mid.y + outward.y * offset },
    rot: Math.atan2(b.y - a.y, b.x - a.x),
    text,
    st: { ...DIM_STYLE },
    color: 8,
    layer: PROFILE_ANNOTATION_LAYER,
    profile: profile || null,
    annotationKey: key
  };
};

const linearDimension = (args) => dimension({ ...args, kind: 'linear' });

const editableDimension = ({ shapeId, fieldKey, value, evaluated, a, b, inward, key, stack }) => linearDimension({
  key,
  a,
  b,
  inward,
  text: fieldLabel(value, evaluated),
  profile: { shapeId, fieldKey },
  stack
});

const chainDimensions = (shape, stack) => {
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
    const a = point(corners[index].x, corners[index].y);
    const b = point(corners[(index + 1) % corners.length].x, corners[(index + 1) % corners.length].y);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    dimensions.push(dimension({
      kind: 'aligned',
      key: `${shape.id}-${corners[index].id}-${corners[(index + 1) % corners.length].id}`,
      a,
      b,
      inward: centroid,
      text: length.toFixed(1),
      profile: null,
      stack
    }));
  }
  return dimensions;
};

const primitiveDimensions = (authoredShape, shape, stack) => {
  const dims = [];
  const push = (fieldKey, a, b, inward, value, evaluated) => {
    dims.push(editableDimension({
      shapeId: shape.id,
      fieldKey,
      value,
      evaluated,
      a,
      b,
      inward,
      key: `${shape.id}:${fieldKey}`,
      stack
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
    dims.push({
      type: 'dim',
      kind: 'diameter',
      c: center,
      p1: point(cx + radius, cy),
      loc: center,
      text: fieldLabel(authoredShape?.diameter ?? shape.diameter, shape.diameter),
      st: { ...DIM_STYLE },
      color: 8,
      layer: PROFILE_ANNOTATION_LAYER,
      profile: { shapeId: shape.id, fieldKey: 'diameter' },
      annotationKey: `${shape.id}:diameter`
    });
    push('center-x', point(0, cy - radius), point(cx, cy - radius), center,
      authoredShape?.center?.[0] ?? shape.center[0], shape.center[0]);
    push('center-y', point(cx - radius, 0), point(cx - radius, cy), center,
      authoredShape?.center?.[1] ?? shape.center[1], shape.center[1]);
  }
  return dims;
};

const dedupePositionDimensions = (dimensions) => {
  const seen = new Set();
  return dimensions.filter(dimension => {
    const fieldKey = dimension.profile?.fieldKey;
    if (fieldKey !== 'center-x' && fieldKey !== 'center-y') return true;
    const key = `${fieldKey}:${dimension.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ringsOf = (face) => (
  face
    ? [...(face.polygons || []), ...(face.holes || [])]
      .filter(ring => ring.length >= 3)
      .map(ring => ring.map(([x, y]) => point(x, y)))
    : []
);

/** The native CadCraft entities that carry the profile canvas annotations. */
export function buildProfileAnnotations({ evaluated, authored = null, resolvedFace = null } = {}) {
  const stack = createDimStack();
  const shapes = evaluated?.shapes || [];
  const authoredById = new Map((authored?.shapes || []).map(shape => [shape.id, shape]));
  const dimensions = dedupePositionDimensions([
    ...shapes.filter(shape => shape.type === 'chain').flatMap(shape => chainDimensions(shape, stack)),
    ...shapes.flatMap(shape => (
      shape.type === 'rect' || shape.type === 'circle'
        ? primitiveDimensions(authoredById.get(shape.id), shape, stack)
        : []
    ))
  ]);

  const entities = [...dimensions];
  const rings = ringsOf(resolvedFace);
  if (rings.length) {
    entities.push({
      type: 'hatch',
      loops: rings.map(ring => ring.flatMap(item => [item.x, item.y])),
      pattern: 'ANSI31',
      pscale: 2,
      color: '#94a3b8',
      layer: PROFILE_ANNOTATION_LAYER
    });
    for (const ring of rings) {
      entities.push({
        type: 'poly',
        pts: ring,
        closed: true,
        color: 7,
        layer: PROFILE_ANNOTATION_LAYER
      });
    }
  }
  entities.push(
    { type: 'xline', x: 0, y: 0, dx: 0, dy: 1, color: 7, layer: PROFILE_ANNOTATION_LAYER },
    { type: 'point', x: 0, y: 0, color: 7, layer: PROFILE_ANNOTATION_LAYER }
  );
  return entities;
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
