function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function sheetLayoutState(design = {}) {
  const result = clone(design.data?.geometry?.data || {});
  const layout = result.solution?.layouts?.[0] || result.layouts?.[0] || {};
  return {
    items: Array.isArray(result.items) ? result.items : [],
    placedItems: clone(layout.placed_items || layout.items || [])
  };
}

export function snapSheetCoordinate(value, increment = 1) {
  const numeric = Number(value) || 0;
  const step = Math.max(Number(increment) || 1, 0.001);
  return Math.round(numeric / step) * step;
}

function workerRotationRadians(rotation = 0) {
  const value = Number(rotation) || 0;
  return Math.abs(value) <= Math.PI * 2 ? value : value * Math.PI / 180;
}

export function sheetItemPoints(item = {}) {
  const candidates = [
    item.shape?.data,
    item.coords,
    item.coordinates,
    item.polygon,
    item.points
  ];
  const points = candidates.find(value => Array.isArray(value) && value.length >= 3) || [];
  return points
    .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

export function sheetPlacementSource(items = [], placement = {}) {
  const id = placement.item_id ?? placement.itemId ?? placement.id;
  return items.find(item => String(item.id) === String(id)) || placement;
}

export function sheetPlacementTransform(placement = {}) {
  const translation = placement.transformation?.translation || [placement.x || 0, placement.y || 0];
  const rawRotation = Number(placement.transformation?.rotation ?? placement.rotation ?? 0) || 0;
  return {
    x: Number(translation[0]) || 0,
    y: Number(translation[1]) || 0,
    rotation: Math.abs(rawRotation) <= Math.PI * 2 ? rawRotation * 180 / Math.PI : rawRotation
  };
}

export function sheetItemBounds(item = {}, rotation = 0) {
  const points = sheetItemPoints(item);
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const radians = workerRotationRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated = points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
  const xs = rotated.map(point => point[0]);
  const ys = rotated.map(point => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function clampSheetPlacement({ x = 0, y = 0, item = {}, rotation = 0, sheetWidth = 0, sheetHeight = 0, boundaryOffset = 0 } = {}) {
  const bounds = sheetItemBounds(item, rotation);
  const inset = Math.max(Number(boundaryOffset) || 0, 0);
  const minX = inset - bounds.minX;
  const minY = inset - bounds.minY;
  const maxX = Math.max((Number(sheetWidth) || 0) - inset - bounds.maxX, minX);
  const maxY = Math.max((Number(sheetHeight) || 0) - inset - bounds.maxY, minY);
  return {
    x: Math.min(Math.max(Number(x) || 0, minX), maxX),
    y: Math.min(Math.max(Number(y) || 0, minY), maxY)
  };
}

export function sheetPlacementBounds(items = [], placement = {}) {
  const transform = sheetPlacementTransform(placement);
  const bounds = sheetItemBounds(sheetPlacementSource(items, placement), placement.transformation?.rotation ?? placement.rotation ?? 0);
  return {
    minX: transform.x + bounds.minX,
    minY: transform.y + bounds.minY,
    maxX: transform.x + bounds.maxX,
    maxY: transform.y + bounds.maxY
  };
}

function boundsClear(left, right, clearance) {
  const gap = Math.max(Number(clearance) || 0, 0);
  return left.maxX + gap <= right.minX ||
    right.maxX + gap <= left.minX ||
    left.maxY + gap <= right.minY ||
    right.maxY + gap <= left.minY;
}

const GEOMETRY_EPSILON = 0.001;

function transformedPlacementPoints(items = [], placement = {}) {
  const transform = sheetPlacementTransform(placement);
  const rotation = placement.transformation?.rotation ?? placement.rotation ?? 0;
  const radians = workerRotationRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return sheetItemPoints(sheetPlacementSource(items, placement)).map(([x, y]) => [
    transform.x + x * cos - y * sin,
    transform.y + x * sin + y * cos
  ]);
}

function polygonEdges(points = []) {
  const clean = points.filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (clean.length < 2) return [];
  return clean.map((point, index) => [point, clean[(index + 1) % clean.length]]);
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function between(value, start, end) {
  return value >= Math.min(start, end) - GEOMETRY_EPSILON && value <= Math.max(start, end) + GEOMETRY_EPSILON;
}

function pointOnSegment(point, start, end) {
  return Math.abs(cross(start, end, point)) <= GEOMETRY_EPSILON &&
    between(point[0], start[0], end[0]) &&
    between(point[1], start[1], end[1]);
}

function segmentsProperlyIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON || abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON) &&
    (cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON || cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON);
}

function segmentsIntersect(a, b, c, d) {
  if (segmentsProperlyIntersect(a, b, c, d)) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b) || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function pointInPolygon(point, polygon = []) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (pointOnSegment(point, polygon[j], polygon[i])) return false;
    const intersects = ((polygon[i][1] > point[1]) !== (polygon[j][1] > point[1])) &&
      (point[0] < (polygon[j][0] - polygon[i][0]) * (point[1] - polygon[i][1]) / (polygon[j][1] - polygon[i][1]) + polygon[i][0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function segmentDistance([a, b], [c, d]) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}

function polygonsClear(leftPoints = [], rightPoints = [], clearance = 0) {
  const gap = Math.max(Number(clearance) || 0, 0);
  if (leftPoints.length < 3 || rightPoints.length < 3) return true;
  const leftEdges = polygonEdges(leftPoints);
  const rightEdges = polygonEdges(rightPoints);
  for (const leftEdge of leftEdges) {
    for (const rightEdge of rightEdges) {
      if (segmentsProperlyIntersect(leftEdge[0], leftEdge[1], rightEdge[0], rightEdge[1])) {
        return false;
      }
      if (segmentsIntersect(leftEdge[0], leftEdge[1], rightEdge[0], rightEdge[1])) {
        return gap <= GEOMETRY_EPSILON;
      }
    }
  }
  if (leftPoints.some(point => pointInPolygon(point, rightPoints)) || rightPoints.some(point => pointInPolygon(point, leftPoints))) {
    return false;
  }
  if (gap <= GEOMETRY_EPSILON) return true;
  const minDistance = Math.min(...leftEdges.flatMap(leftEdge => rightEdges.map(rightEdge => segmentDistance(leftEdge, rightEdge))));
  return minDistance + GEOMETRY_EPSILON >= gap;
}

export function placementHasClearance({ items = [], placements = [], placement, index = -1, clearance = 0 } = {}) {
  const candidate = sheetPlacementBounds(items, placement);
  const candidatePoints = transformedPlacementPoints(items, placement);
  return placements.every((other, otherIndex) => (
    otherIndex === index ||
    boundsClear(candidate, sheetPlacementBounds(items, other), clearance) ||
    polygonsClear(candidatePoints, transformedPlacementPoints(items, other), clearance)
  ));
}

export function magneticSheetPlacement({
  items = [],
  placements = [],
  index = -1,
  x = 0,
  y = 0,
  sheetWidth = 0,
  sheetHeight = 0,
  boundaryOffset = 0,
  clearance = 0,
  threshold = null
} = {}) {
  const placement = placements[index];
  if (!placement) return { x, y, snapped: false };
  const source = sheetPlacementSource(items, placement);
  const rotation = placement.transformation?.rotation ?? placement.rotation ?? 0;
  const bounded = clampSheetPlacement({ x, y, item: source, rotation, sheetWidth, sheetHeight, boundaryOffset });
  const moving = sheetItemBounds(source, rotation);
  const gap = Math.max(Number(clearance) || 0, 0);
  const snapThreshold = threshold === null ? Math.max(gap * 2, 12) : Math.max(Number(threshold) || 0, 0);
  const candidates = [{ ...bounded, snapped: false }];

  placements.forEach((other, otherIndex) => {
    if (otherIndex === index) return;
    const bounds = sheetPlacementBounds(items, other);
    const xCandidates = [
      bounds.minX - gap - moving.maxX,
      bounds.maxX + gap - moving.minX
    ];
    const yCandidates = [
      bounds.minY - gap - moving.maxY,
      bounds.maxY + gap - moving.minY
    ];
    const alignedX = [bounds.minX - moving.minX, bounds.maxX - moving.maxX];
    const alignedY = [bounds.minY - moving.minY, bounds.maxY - moving.maxY];
    xCandidates.forEach(candidateX => candidates.push({ x: candidateX, y: bounded.y, snapped: true }));
    yCandidates.forEach(candidateY => candidates.push({ x: bounded.x, y: candidateY, snapped: true }));
    alignedX.forEach(candidateX => candidates.push({ x: candidateX, y: bounded.y, snapped: true }));
    alignedY.forEach(candidateY => candidates.push({ x: bounded.x, y: candidateY, snapped: true }));
    xCandidates.forEach(candidateX => alignedY.forEach(candidateY => candidates.push({ x: candidateX, y: candidateY, snapped: true })));
    yCandidates.forEach(candidateY => alignedX.forEach(candidateX => candidates.push({ x: candidateX, y: candidateY, snapped: true })));
  });

  return candidates
    .map(candidate => ({
      ...clampSheetPlacement({ ...candidate, item: source, rotation, sheetWidth, sheetHeight, boundaryOffset }),
      snapped: candidate.snapped
    }))
    .filter(candidate => Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) <= snapThreshold || !candidate.snapped)
    .filter(candidate => placementHasClearance({
      items,
      placements,
      index,
      clearance: gap,
      placement: placementWithTranslation(placement, candidate.x, candidate.y)
    }))
    .sort((left, right) => {
      if (left.snapped !== right.snapped) return left.snapped ? -1 : 1;
      return Math.hypot(left.x - bounded.x, left.y - bounded.y) - Math.hypot(right.x - bounded.x, right.y - bounded.y);
    })[0] || null;
}

export function rotateSheetPlacementQuarterTurn({ items = [], placements = [], index = -1, sheetWidth = 0, sheetHeight = 0, boundaryOffset = 0, clearance = 0 } = {}) {
  const placement = placements[index];
  if (!placement) return null;
  const transform = sheetPlacementTransform(placement);
  const current = workerRotationRadians(placement.transformation?.rotation ?? placement.rotation ?? 0);
  const rotation = (current + Math.PI / 2) % (Math.PI * 2);
  const source = sheetPlacementSource(items, placement);
  const bounded = clampSheetPlacement({
    x: transform.x,
    y: transform.y,
    item: source,
    rotation,
    sheetWidth,
    sheetHeight,
    boundaryOffset
  });
  const rotated = {
    ...placement,
    transformation: {
      ...(placement.transformation || {}),
      rotation,
      translation: [bounded.x, bounded.y]
    }
  };
  return placementHasClearance({ items, placements, placement: rotated, index, clearance }) ? rotated : null;
}

function designLayerData(design = {}) {
  const data = design.data || {};
  const geometry = data.geometry?.data || {};
  return [data.layerData, geometry.layerData].find(items => Array.isArray(items) && items.length) || [];
}

function designPolygonParts(design = {}) {
  const data = design.data || {};
  const geometry = data.geometry?.data || {};
  return [data.polygonParts, geometry.polygonParts, geometry.layerData, data.layerData]
    .find(items => Array.isArray(items) && items.some(item => Array.isArray(item?.coordinates) && item.coordinates.length >= 3)) || [];
}

export function cassetteDesignSheetItem(design = {}, id) {
  const polygon = designPolygonParts(design)
    .find(item => (item.layer || item.standardCode) === 'cut.outer')
    || designPolygonParts(design)[0];
  if (!polygon?.coordinates?.length) return null;
  return {
    id,
    cassette_id: design._id,
    name: design.identity?.name || design.identity?.slug || design._id,
    shape: { type: 'simple_polygon', data: clone(polygon.coordinates) },
    sourceLayers: designLayerData(design).map(layer => ({
      ...clone(layer),
      layer: layer.layer || layer.standardCode || layer.name
    }))
  };
}

export function placementWithTranslation(placement = {}, x, y) {
  return {
    ...placement,
    transformation: {
      ...(placement.transformation || {}),
      rotation: placement.transformation?.rotation ?? placement.rotation ?? 0,
      translation: [x, y]
    }
  };
}
