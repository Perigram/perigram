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
  referenceVertices: withoutClosingVertex(face.referenceVertices || face.vertices || []),
  sourceVertices: withoutClosingVertex(face.vertices || []),
  referencePoints: withoutClosingVertex(face.referenceVertices || face.vertices || []).map(point => [numeric(point?.[0]), numeric(point?.[1]), 0]),
  points: withoutClosingVertex(face.vertices || []).map(point => [numeric(point?.[0]), numeric(point?.[1]), 0]),
  holes: (face.holes || []).map(hole => withoutClosingVertex(hole).map(point => [numeric(point?.[0]), numeric(point?.[1]), 0])),
  sourceHoles: (face.holes || []).map(hole => withoutClosingVertex(hole)),
  normal: [0, 0, 1]
});

const placeChildFace = (childFace, parentPlacement, parentFace, fold) => {
  const parentSource = withoutClosingVertex(parentFace.referenceVertices || parentFace.vertices || []);
  const childReference = withoutClosingVertex(childFace.referenceVertices || childFace.vertices || []);
  const childSource = withoutClosingVertex(childFace.vertices || []);
  const parentIndex = Math.max(0, Math.round(numeric(fold.parentEdgeIndex, 0)));
  const childIndex = Math.max(0, Math.round(numeric(fold.childEdgeIndex, 0)));
  const parentReferencePoints = parentPlacement.referencePoints || parentPlacement.points;
  const parentStart = parentReferencePoints[parentIndex];
  const parentEnd = parentReferencePoints[(parentIndex + 1) % parentReferencePoints.length];
  const parentSourceStart = parentSource[parentIndex];
  const parentSourceEnd = parentSource[(parentIndex + 1) % parentSource.length];
  const childStart = Array.isArray(fold.childFoldStart)
    ? fold.childFoldStart
    : childReference[childIndex];
  const childEnd = Array.isArray(fold.childFoldEnd)
    ? fold.childFoldEnd
    : childReference[(childIndex + 1) % childReference.length];

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

  const mapPoint = (point) => {
    const delta = [
      numeric(point[0]) - numeric(childStart[0]),
      numeric(point[1]) - numeric(childStart[1])
    ];
    const along = dot2(delta, childAxis);
    const offset = cross2(childAxis, delta);
    return add3(add3(origin, scale3(axis, along)), scale3(perpendicular, offset));
  };

  return {
    nodeId: childFace.nodeId,
    workpieceId: childFace.workpieceId,
    sourceVertices: childSource,
    referenceVertices: childReference,
    normal,
    points: childSource.map(mapPoint),
    referencePoints: childReference.map(mapPoint),
    sourceHoles: (childFace.holes || []).map(hole => withoutClosingVertex(hole)),
    holes: (childFace.holes || []).map(hole => withoutClosingVertex(hole).map(mapPoint))
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
  const source = withoutClosingVertex(placement?.referenceVertices || placement?.sourceVertices || []);
  const points = placement?.referencePoints || placement?.points || [];
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
  points: placement.points.map(point => add3(multiplyMatrixVector(transform.matrix, point), transform.origin)),
  referencePoints: (placement.referencePoints || placement.points).map(point => add3(multiplyMatrixVector(transform.matrix, point), transform.origin)),
  holes: (placement.holes || []).map(hole => hole.map(point => add3(multiplyMatrixVector(transform.matrix, point), transform.origin)))
});

const jointTargetAnchor = (targetPlacement, joint) => {
  const targetBasis = faceBasis(targetPlacement);
  return add3(
    add3(faceSnapPoint3d(targetPlacement, joint.targetSnap), scale3(targetBasis.xAxis, numeric(joint.offsetX, 0))),
    scale3(targetBasis.yAxis, numeric(joint.offsetY, 0))
  );
};

const edgeArrayBodyPoints = (targetPlacement, body) => {
  const pattern = body.pattern || {};
  const points2d = withoutClosingVertex(targetPlacement?.sourceVertices || []);
  const points3d = targetPlacement?.points || [];
  if (points2d.length < 2 || points3d.length < 2) return [];
  const match = String(pattern.edge || 'E0').match(/\d+/);
  const edgeIndex = match ? Math.max(0, Math.round(numeric(match[0], 0))) % points2d.length : 0;
  const start2d = points2d[edgeIndex];
  const end2d = points2d[(edgeIndex + 1) % points2d.length];
  const start3d = points3d[edgeIndex];
  const end3d = points3d[(edgeIndex + 1) % points3d.length];
  if (!start2d || !end2d || !start3d || !end3d) return [];

  const edge2d = [
    numeric(end2d[0], 0) - numeric(start2d[0], 0),
    numeric(end2d[1], 0) - numeric(start2d[1], 0)
  ];
  const edgeLength = length2(edge2d);
  if (edgeLength <= 0.001) return [];

  const edge3d = normalize3(sub3(end3d, start3d), [1, 0, 0]);
  const basis = faceBasis(targetPlacement);
  const normal2d = normalize2([-edge2d[1], edge2d[0]], [0, 1]);
  const inPlaneNormal = normalize3(add3(scale3(basis.xAxis, normal2d[0]), scale3(basis.yAxis, normal2d[1])), basis.yAxis);
  const mode = pattern.mode === 'spacing' ? 'spacing' : 'count';
  const margin = Math.max(0, numeric(body.offsetX, 0));
  const normalOffset = numeric(body.offsetY, 0);
  const requestedCount = Math.max(1, Math.round(numeric(pattern.count, 1)));
  const requestedSpacing = Math.max(0, numeric(pattern.spacing, 0));
  const usableStart = margin;
  const usableEnd = edgeLength - margin;
  if (usableEnd < usableStart) return [];

  const binding = body.targetSnap === 'end'
    ? 'end'
    : body.targetSnap === 'center' ? 'center' : 'start';
  let distances = [];
  if (mode === 'spacing' && requestedSpacing > 0) {
    if (binding === 'end') {
      for (let distance = usableEnd; distance >= usableStart - 0.001; distance -= requestedSpacing) {
        distances.push(Math.max(usableStart, distance));
      }
    } else {
      const span = Math.max(0, usableEnd - usableStart);
      const count = Math.max(1, Math.floor(span / requestedSpacing) + 1);
      const total = (count - 1) * requestedSpacing;
      const first = binding === 'center' ? usableStart + (span - total) / 2 : usableStart;
      distances = Array.from({ length: count }, (_, index) => Math.min(usableEnd, first + requestedSpacing * index));
    }
  } else if (requestedCount === 1) {
    distances = [binding === 'end' ? usableEnd : binding === 'center' ? (usableStart + usableEnd) / 2 : usableStart];
  } else {
    const spacing = Math.max(0, (usableEnd - usableStart) / (requestedCount - 1));
    distances = Array.from({ length: requestedCount }, (_, index) => usableStart + spacing * index);
    if (binding === 'end') distances.reverse();
  }

  return distances.map((distance, index) => ({
    index,
    point: add3(
      add3(start3d, scale3(edge3d, distance)),
      scale3(inPlaneNormal, normalOffset)
    ),
    axis: edge3d,
    normal: basis.normal
  }));
};

const bodyInstances = (placed, bodies = []) => bodies.flatMap((body) => {
  if (body.family === 'hanger_clip' && (body.productionMode || 'integralCut') === 'integralCut') {
    return [];
  }
  const targetPlacement = placed.get(body.targetFaceId);
  if (!targetPlacement) return [];
  const basis = faceBasis(targetPlacement);
  const points = body.pattern?.type === 'edgeArray'
    ? edgeArrayBodyPoints(targetPlacement, body)
    : [{
        index: 0,
        point: jointTargetAnchor(targetPlacement, body),
        axis: basis.xAxis,
        normal: basis.normal
      }];

  return points.map(entry => ({
    id: `${body.id}:${entry.index}`,
    workpieceId: body.workpieceId,
    relationId: body.relationId,
    family: body.family,
    productionMode: body.productionMode || '',
    parameters: body.parameters || {},
    center: entry.point,
    axis: entry.axis || basis.xAxis,
    normal: entry.normal || basis.normal
  }));
});

const pointOnFace = (placement, point = [0, 0, 0]) => {
  const basis = faceBasis(placement);
  const delta = [
    numeric(point[0]) - numeric(basis.sourceStart[0]),
    numeric(point[1]) - numeric(basis.sourceStart[1])
  ];
  const along = dot2(delta, basis.sourceAxis);
  const offset = cross2(basis.sourceAxis, delta);
  return add3(add3(basis.origin, scale3(basis.xAxis, along)), scale3(basis.yAxis, offset));
};

const circleCutoutPoints = (placement, geometry = {}) => {
  const diameter = numeric(geometry.diameter, 5);
  const radius = Math.max(0.1, diameter / 2);
  const center = geometry.center || [0, 0, 0];
  const basis = faceBasis(placement);
  const center3d = pointOnFace(placement, center);
  return Array.from({ length: 33 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return add3(
      add3(center3d, scale3(basis.xAxis, Math.cos(angle) * radius)),
      scale3(basis.yAxis, Math.sin(angle) * radius)
    );
  });
};

const cutoutInstances = (placed, cutouts = []) => cutouts
  .map((cutout) => {
    const targetPlacement = placed.get(cutout.targetFaceId);
    if (!targetPlacement) return null;
    const geometry = cutout.geometry || {};
    const points = geometry.type === 'circle'
      ? circleCutoutPoints(targetPlacement, geometry)
      : (geometry.vertices || []).map(point => pointOnFace(targetPlacement, point));
    if (points.length < 2) return null;
    return {
      id: cutout.id,
      layer: cutout.layer,
      workpieceId: cutout.workpieceId,
      relationId: cutout.relationId,
      targetFaceId: cutout.targetFaceId,
      geometryType: geometry.type,
      points
    };
  })
  .filter(Boolean);

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
      // The host side picks the face side the sheet lands on; the self
      // side flips the sheet against it (front-to-front, back-to-back).
      const hostNormal = joint.targetSide === 'back'
        ? scale3(targetBasis.normal, -1)
        : targetBasis.normal;
      const desiredNormal = joint.sourceSide === 'back'
        ? scale3(hostNormal, -1)
        : hostNormal;
      const align = rotationMatrixBetween(sourceBasis.normal, desiredNormal);
      const alignedSourceX = normalize3(multiplyMatrixVector(align, sourceBasis.xAxis), sourceBasis.xAxis);
      const twistAngle = signedAngleAroundAxis(alignedSourceX, targetBasis.xAxis, desiredNormal) + numeric(joint.rotation, 0);
      const twist = rotationMatrixAroundAxis(desiredNormal, twistAngle);
      const matrix = multiplyMatrices(twist, align);
      const targetAnchor = jointTargetAnchor(targetPlacement, joint);
      // The self anchor rides its own offset pair in the self face's
      // frame before the alignment matrix places it — symmetric to
      // jointTargetAnchor on the host side.
      const sourceAnchor = multiplyMatrixVector(matrix, add3(
        add3(
          faceSnapPoint3d(sourceLocal, joint.sourceSnap),
          scale3(sourceBasis.xAxis, numeric(joint.sourceOffsetX, 0))
        ),
        scale3(sourceBasis.yAxis, numeric(joint.sourceOffsetY, 0))
      ));

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
  const bodies = Array.isArray(preview.bodies) ? preview.bodies : [];
  const cutouts = Array.isArray(preview.cutouts) ? preview.cutouts : [];
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
    attachments: transformed.attachments,
    bodies: bodyInstances(transformed.placements, bodies),
    cutouts: cutoutInstances(transformed.placements, cutouts)
  };
};
