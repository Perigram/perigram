const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const samePoint2d = (left, right, tolerance = 0.001) => (
  Math.abs(numeric(left?.[0]) - numeric(right?.[0])) <= tolerance &&
  Math.abs(numeric(left?.[1]) - numeric(right?.[1])) <= tolerance
);

const withoutClosingVertex = (vertices = []) => (
  vertices.length > 1 && samePoint2d(vertices[0], vertices[vertices.length - 1])
    ? vertices.slice(0, -1)
    : vertices
);

const add3 = (left, right) => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2]
];

const sub3 = (left, right) => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2]
];

const scale3 = (vector, scale) => [
  vector[0] * scale,
  vector[1] * scale,
  vector[2] * scale
];

const dot2 = (left, right) => left[0] * right[0] + left[1] * right[1];
const dot3 = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const cross2 = (left, right) => left[0] * right[1] - left[1] * right[0];
const cross3 = (left, right) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0]
];

const length2 = (vector) => Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
const length3 = (vector) => Math.sqrt(dot3(vector, vector));

const normalize2 = (vector, fallback = [1, 0]) => {
  const length = length2(vector);
  return length > 0 ? [vector[0] / length, vector[1] / length] : fallback;
};

const normalize3 = (vector, fallback = [1, 0, 0]) => {
  const length = length3(vector);
  return length > 0 ? scale3(vector, 1 / length) : fallback;
};

const rotateAroundAxis = (vector, axis, angleDegrees) => {
  const radians = numeric(angleDegrees) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return add3(
    add3(scale3(vector, cos), scale3(cross3(axis, vector), sin)),
    scale3(axis, dot3(axis, vector) * (1 - cos))
  );
};

const identityMatrix = () => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
];

const multiplyMatrixVector = (matrix, vector) => [
  matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
  matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
  matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
];

const multiplyMatrices = (left, right) => left.map((row, rowIndex) => row.map((_, columnIndex) => (
  left[rowIndex][0] * right[0][columnIndex] +
  left[rowIndex][1] * right[1][columnIndex] +
  left[rowIndex][2] * right[2][columnIndex]
)));

const rotationMatrixAroundAxis = (axisValue, angleDegrees) => {
  const axis = normalize3(axisValue, [0, 0, 1]);
  const radians = numeric(angleDegrees, 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const t = 1 - cos;
  const [x, y, z] = axis;
  return [
    [t * x * x + cos, t * x * y - sin * z, t * x * z + sin * y],
    [t * x * y + sin * z, t * y * y + cos, t * y * z - sin * x],
    [t * x * z - sin * y, t * y * z + sin * x, t * z * z + cos]
  ];
};

const rotationMatrixBetween = (from, to) => {
  const source = normalize3(from, [0, 0, 1]);
  const target = normalize3(to, [0, 0, 1]);
  const axis = cross3(source, target);
  const axisLength = length3(axis);
  const dot = Math.max(-1, Math.min(1, dot3(source, target)));

  if (axisLength <= 0.000001) {
    if (dot >= 0) return identityMatrix();
    const fallbackAxis = Math.abs(source[0]) < 0.9
      ? normalize3(cross3(source, [1, 0, 0]), [0, 1, 0])
      : normalize3(cross3(source, [0, 1, 0]), [1, 0, 0]);
    return rotationMatrixAroundAxis(fallbackAxis, 180);
  }

  return rotationMatrixAroundAxis(scale3(axis, 1 / axisLength), Math.atan2(axisLength, dot) * 180 / Math.PI);
};

const signedAngleAroundAxis = (from, to, axisValue) => {
  const axis = normalize3(axisValue, [0, 0, 1]);
  const project = (vector) => normalize3(sub3(vector, scale3(axis, dot3(vector, axis))), [1, 0, 0]);
  const source = project(from);
  const target = project(to);
  const sin = dot3(axis, cross3(source, target));
  const cos = Math.max(-1, Math.min(1, dot3(source, target)));
  return Math.atan2(sin, cos) * 180 / Math.PI;
};

const flatFacePlacement = (face) => ({
  nodeId: face.nodeId,
  workpieceId: face.workpieceId,
  sourceVertices: withoutClosingVertex(face.vertices || []),
  points: withoutClosingVertex(face.vertices || []).map(point => [numeric(point?.[0]), numeric(point?.[1]), 0]),
  normal: [0, 0, 1]
});

const placeChildFace = (childFace, parentPlacement, parentFace, fold) => {
  const parentSource = withoutClosingVertex(parentFace.vertices || []);
  const childSource = withoutClosingVertex(childFace.vertices || []);
  const parentIndex = Math.max(0, Math.round(numeric(fold.parentEdgeIndex, 0)));
  const childIndex = Math.max(0, Math.round(numeric(fold.childEdgeIndex, 0)));
  const parentStart = parentPlacement.points[parentIndex];
  const parentEnd = parentPlacement.points[(parentIndex + 1) % parentPlacement.points.length];
  const parentSourceStart = parentSource[parentIndex];
  const parentSourceEnd = parentSource[(parentIndex + 1) % parentSource.length];
  const childStart = childSource[childIndex];
  const childEnd = childSource[(childIndex + 1) % childSource.length];

  if (!parentStart || !parentEnd || !parentSourceStart || !parentSourceEnd || !childStart || !childEnd) {
    return flatFacePlacement(childFace);
  }

  const parentAxis = normalize3(sub3(parentEnd, parentStart));
  const parentSourceAxis = normalize2([
    numeric(parentSourceEnd[0]) - numeric(parentSourceStart[0]),
    numeric(parentSourceEnd[1]) - numeric(parentSourceStart[1])
  ]);
  const childAxis = normalize2([
    numeric(childEnd[0]) - numeric(childStart[0]),
    numeric(childEnd[1]) - numeric(childStart[1])
  ]);
  const reversed = dot2(parentSourceAxis, childAxis) < 0;
  const axis = reversed ? scale3(parentAxis, -1) : parentAxis;
  const childStartDeltaFromParent = [
    numeric(childStart[0]) - numeric(parentSourceStart[0]),
    numeric(childStart[1]) - numeric(parentSourceStart[1])
  ];
  const origin = add3(parentStart, scale3(parentAxis, dot2(childStartDeltaFromParent, parentSourceAxis)));
  const normal = normalize3(rotateAroundAxis(parentPlacement.normal, parentAxis, numeric(fold.angle, 90)), parentPlacement.normal);
  const perpendicular = normalize3(cross3(normal, axis), parentPlacement.normal);

  return {
    nodeId: childFace.nodeId,
    workpieceId: childFace.workpieceId,
    sourceVertices: childSource,
    normal,
    points: childSource.map((point) => {
      const delta = [
        numeric(point[0]) - numeric(childStart[0]),
        numeric(point[1]) - numeric(childStart[1])
      ];
      const along = dot2(delta, childAxis);
      const offset = cross2(childAxis, delta);
      return add3(add3(origin, scale3(axis, along)), scale3(perpendicular, offset));
    })
  };
};

const faceSnapPoint2d = (vertices = [], snap = 'center') => {
  const points = withoutClosingVertex(vertices);
  if (!points.length) return [0, 0];
  const xs = points.map(point => numeric(point?.[0], 0));
  const ys = points.map(point => numeric(point?.[1], 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const value = String(snap || 'center');

  if (value === 'origin' || value === 'start') return [numeric(points[0]?.[0], 0), numeric(points[0]?.[1], 0)];
  if (value === 'end') return [numeric(points[1]?.[0], 0), numeric(points[1]?.[1], 0)];
  if (value === 'top_left') return [minX, maxY];
  if (value === 'top_right') return [maxX, maxY];
  if (value === 'bottom_left') return [minX, minY];
  if (value === 'bottom_right') return [maxX, minY];
  return [(minX + maxX) / 2, (minY + maxY) / 2];
};

const faceBasis = (placement) => {
  const source = withoutClosingVertex(placement?.sourceVertices || []);
  const points = placement?.points || [];
  const origin = points[0] || [0, 0, 0];
  const sourceStart = source[0] || [0, 0];
  const sourceEnd = source[1] || [1, 0];
  const sourceAxis = normalize2([
    numeric(sourceEnd[0]) - numeric(sourceStart[0]),
    numeric(sourceEnd[1]) - numeric(sourceStart[1])
  ]);
  const xAxis = normalize3(sub3(points[1] || [1, 0, 0], origin), [1, 0, 0]);
  const normal = normalize3(placement?.normal || [0, 0, 1], [0, 0, 1]);
  const yAxis = normalize3(cross3(normal, xAxis), [0, 1, 0]);
  return { origin, sourceStart, sourceAxis, xAxis, yAxis, normal };
};

const faceSnapPoint3d = (placement, snap) => {
  const localSnap = faceSnapPoint2d(placement?.sourceVertices || [], snap);
  const basis = faceBasis(placement);
  const delta = [
    numeric(localSnap[0]) - numeric(basis.sourceStart[0]),
    numeric(localSnap[1]) - numeric(basis.sourceStart[1])
  ];
  const along = dot2(delta, basis.sourceAxis);
  const offset = cross2(basis.sourceAxis, delta);
  return add3(add3(basis.origin, scale3(basis.xAxis, along)), scale3(basis.yAxis, offset));
};

const transformPlacement = (placement, transform) => ({
  ...placement,
  normal: normalize3(multiplyMatrixVector(transform.matrix, placement.normal), placement.normal),
  points: placement.points.map(point => add3(multiplyMatrixVector(transform.matrix, point), transform.origin))
});

const jointTargetAnchor = (targetPlacement, joint) => {
  const targetBasis = faceBasis(targetPlacement);
  return add3(
    add3(faceSnapPoint3d(targetPlacement, joint.targetSnap), scale3(targetBasis.xAxis, numeric(joint.offsetX, 0))),
    scale3(targetBasis.yAxis, numeric(joint.offsetY, 0))
  );
};

const attachmentDiagnostics = (placed, joints = [], tolerance = 0.5) => joints.map((joint, index) => {
  const targetPlacement = placed.get(joint.targetFaceId);
  const sourcePlacement = placed.get(joint.sourceFaceId);
  if (!targetPlacement || !sourcePlacement) {
    return {
      id: joint.id || `joint_${index + 1}`,
      sourceWorkpieceId: joint.sourceWorkpieceId,
      targetWorkpieceId: joint.targetWorkpieceId,
      sourceFaceId: joint.sourceFaceId,
      targetFaceId: joint.targetFaceId,
      driver: joint.driver !== false,
      status: 'unresolved',
      distance: null
    };
  }

  const targetPoint = jointTargetAnchor(targetPlacement, joint);
  const sourcePoint = faceSnapPoint3d(sourcePlacement, joint.sourceSnap);
  const distance = length3(sub3(sourcePoint, targetPoint));
  const driver = joint.driver !== false;
  return {
    id: joint.id || `joint_${index + 1}`,
    sourceWorkpieceId: joint.sourceWorkpieceId,
    targetWorkpieceId: joint.targetWorkpieceId,
    sourceFaceId: joint.sourceFaceId,
    targetFaceId: joint.targetFaceId,
    driver,
    status: driver || distance <= tolerance ? 'ok' : 'impossible',
    distance,
    sourcePoint,
    targetPoint
  };
});

const applyWorkpieceJointTransforms = (placed, joints = []) => {
  if (!joints.length) return { placements: placed, attachments: [] };

  const localPlaced = new Map(placed);
  const workpieceIds = new Set([...localPlaced.values()].map(face => face.workpieceId).filter(Boolean));
  const placementJoints = joints.filter(joint => joint.driver !== false);
  const sourceWorkpieceIds = new Set(placementJoints.map(joint => joint.sourceWorkpieceId).filter(Boolean));
  const transforms = new Map();

  for (const workpieceId of workpieceIds) {
    if (!sourceWorkpieceIds.has(workpieceId)) {
      transforms.set(workpieceId, { matrix: identityMatrix(), origin: [0, 0, 0] });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const joint of placementJoints) {
      if (!joint.sourceWorkpieceId || transforms.has(joint.sourceWorkpieceId)) continue;
      const targetTransform = transforms.get(joint.targetWorkpieceId);
      if (!targetTransform) continue;

      const targetLocal = localPlaced.get(joint.targetFaceId);
      const sourceLocal = localPlaced.get(joint.sourceFaceId);
      if (!targetLocal || !sourceLocal) continue;

      const targetPlacement = transformPlacement(targetLocal, targetTransform);
      const targetBasis = faceBasis(targetPlacement);
      const sourceBasis = faceBasis(sourceLocal);
      const desiredNormal = joint.targetSide === 'back'
        ? scale3(targetBasis.normal, -1)
        : targetBasis.normal;
      const align = rotationMatrixBetween(sourceBasis.normal, desiredNormal);
      const alignedSourceX = normalize3(multiplyMatrixVector(align, sourceBasis.xAxis), sourceBasis.xAxis);
      const twistAngle = signedAngleAroundAxis(alignedSourceX, targetBasis.xAxis, desiredNormal) + numeric(joint.rotation, 0);
      const twist = rotationMatrixAroundAxis(desiredNormal, twistAngle);
      const matrix = multiplyMatrices(twist, align);
      const targetAnchor = jointTargetAnchor(targetPlacement, joint);
      const sourceAnchor = multiplyMatrixVector(matrix, faceSnapPoint3d(sourceLocal, joint.sourceSnap));

      transforms.set(joint.sourceWorkpieceId, {
        matrix,
        origin: sub3(targetAnchor, sourceAnchor)
      });
      changed = true;
    }
  }

  for (const workpieceId of workpieceIds) {
    if (!transforms.has(workpieceId)) {
      transforms.set(workpieceId, { matrix: identityMatrix(), origin: [0, 0, 0] });
    }
  }

  const transformed = new Map([...localPlaced.entries()].map(([nodeId, placement]) => [
    nodeId,
    transformPlacement(placement, transforms.get(placement.workpieceId) || { matrix: identityMatrix(), origin: [0, 0, 0] })
  ]));

  return {
    placements: transformed,
    attachments: attachmentDiagnostics(transformed, joints)
  };
};

export const buildCassetteV2FoldedPreview = (preview = {}) => {
  const faces = Array.isArray(preview.faces) ? preview.faces : [];
  const folds = Array.isArray(preview.folds) ? preview.folds : [];
  const joints = Array.isArray(preview.joints) ? preview.joints : [];
  if (!faces.length) return { faces: [] };

  const faceById = new Map(faces.map(face => [face.nodeId, face]));
  const placed = new Map();
  const childIds = new Set(folds.map(fold => fold.childId));
  const rootFaces = faces.filter(face => !childIds.has(face.nodeId));
  for (const rootFace of (rootFaces.length ? rootFaces : [faces[0]])) {
    placed.set(rootFace.nodeId, flatFacePlacement(rootFace));
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const fold of folds) {
      if (placed.has(fold.childId) || !placed.has(fold.parentId)) continue;
      const childFace = faceById.get(fold.childId);
      const parentFace = faceById.get(fold.parentId);
      const parentPlacement = placed.get(fold.parentId);
      if (!childFace || !parentFace || !parentPlacement) continue;
      placed.set(fold.childId, placeChildFace(childFace, parentPlacement, parentFace, fold));
      changed = true;
    }
  }

  for (const face of faces) {
    if (!placed.has(face.nodeId)) placed.set(face.nodeId, flatFacePlacement(face));
  }

  const transformed = applyWorkpieceJointTransforms(placed, joints);

  return {
    faces: faces.map(face => transformed.placements.get(face.nodeId)).filter(Boolean),
    attachments: transformed.attachments
  };
};
