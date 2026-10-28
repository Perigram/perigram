function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function sheetLayoutState(design = {}) {
  const result = clone(design.fields?.geometry?.data || {});
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

function normalizePolygonRing(points = []) {
  const ring = (Array.isArray(points) ? points : [])
    .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (ring.length < 3) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) <= GEOMETRY_EPSILON && Math.abs(first[1] - last[1]) <= GEOMETRY_EPSILON) {
    return ring.slice(0, -1);
  }
  return ring;
}

function normalizeSheetPolygon(sheetPolygon) {
  if (!sheetPolygon) return null;
  if (Array.isArray(sheetPolygon)) {
    const outer = normalizePolygonRing(sheetPolygon);
    return outer.length ? { outer, inner: [] } : null;
  }
  const outer = normalizePolygonRing(sheetPolygon.outer || sheetPolygon.data?.outer || []);
  if (!outer.length) return null;
  return {
    outer,
    inner: (sheetPolygon.inner || sheetPolygon.data?.inner || []).map(normalizePolygonRing).filter(ring => ring.length)
  };
}

function translatedItemPoints(item = {}, rotation = 0, x = 0, y = 0) {
  const radians = workerRotationRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return sheetItemPoints(item).map(point => [
    x + point[0] * cos - point[1] * sin,
    y + point[0] * sin + point[1] * cos
  ]);
}

function pointInsideOrOnPolygon(point, polygon = []) {
  return pointInPolygon(point, polygon) || polygonEdges(polygon).some(edge => pointOnSegment(point, edge[0], edge[1]));
}

function polygonInsideSheet(points = [], sheetPolygon = null) {
  const sheet = normalizeSheetPolygon(sheetPolygon);
  if (!sheet || points.length < 3) return true;
  const outerEdges = polygonEdges(sheet.outer);
  const candidateEdges = polygonEdges(points);
  if (!points.every(point => pointInsideOrOnPolygon(point, sheet.outer))) return false;
  for (const hole of sheet.inner) {
    if (points.some(point => pointInsideOrOnPolygon(point, hole))) return false;
  }
  for (const edge of candidateEdges) {
    if (outerEdges.some(boundary => segmentsProperlyIntersect(edge[0], edge[1], boundary[0], boundary[1]))) return false;
    for (const hole of sheet.inner) {
      if (polygonEdges(hole).some(boundary => segmentsIntersect(edge[0], edge[1], boundary[0], boundary[1]))) return false;
    }
  }
  return true;
}

function sheetPolygonCentroid(sheetPolygon = null, fallback = [0, 0]) {
  const sheet = normalizeSheetPolygon(sheetPolygon);
  if (!sheet) return fallback;
  const sum = sheet.outer.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [sum[0] / sheet.outer.length, sum[1] / sheet.outer.length];
}

export function clampSheetPlacement({ x = 0, y = 0, item = {}, rotation = 0, sheetWidth = 0, sheetHeight = 0, boundaryOffset = 0, sheetPolygon = null, bounds = null } = {}) {
  const itemBounds = bounds || sheetItemBounds(item, rotation);
  const inset = Math.max(Number(boundaryOffset) || 0, 0);
  const minX = inset - itemBounds.minX;
  const minY = inset - itemBounds.minY;
  const maxX = Math.max((Number(sheetWidth) || 0) - inset - itemBounds.maxX, minX);
  const maxY = Math.max((Number(sheetHeight) || 0) - inset - itemBounds.maxY, minY);
  const rectangular = {
    x: Math.min(Math.max(Number(x) || 0, minX), maxX),
    y: Math.min(Math.max(Number(y) || 0, minY), maxY)
  };
  if (!sheetPolygon || polygonInsideSheet(translatedItemPoints(item, rotation, rectangular.x, rectangular.y), sheetPolygon)) {
    return rectangular;
  }

  const centroid = sheetPolygonCentroid(sheetPolygon, [Number(sheetWidth) / 2 || 0, Number(sheetHeight) / 2 || 0]);
  const itemCenter = [(itemBounds.minX + itemBounds.maxX) / 2, (itemBounds.minY + itemBounds.maxY) / 2];
  const target = { x: centroid[0] - itemCenter[0], y: centroid[1] - itemCenter[1] };
  let low = 0;
  let high = 1;
  let best = null;
  for (let step = 0; step < 24; step += 1) {
    const t = (low + high) / 2;
    const candidate = {
      x: rectangular.x + (target.x - rectangular.x) * t,
      y: rectangular.y + (target.y - rectangular.y) * t
    };
    if (polygonInsideSheet(translatedItemPoints(item, rotation, candidate.x, candidate.y), sheetPolygon)) {
      best = candidate;
      high = t;
    } else {
      low = t;
    }
  }
  return best || rectangular;
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

function edgeMidpoint(edge) {
  return [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
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

function edgeUnitNormal(edge) {
  const dx = edge[1][0] - edge[0][0];
  const dy = edge[1][1] - edge[0][1];
  const length = Math.hypot(dx, dy);
  if (length <= GEOMETRY_EPSILON) return null;
  return [-dy / length, dx / length];
}

function unitEdgeDirection(edge) {
  const dx = edge[1][0] - edge[0][0];
  const dy = edge[1][1] - edge[0][1];
  const length = Math.hypot(dx, dy);
  if (length <= GEOMETRY_EPSILON) return null;
  return [dx / length, dy / length];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function edgeLength(edge) {
  return Math.hypot(edge[1][0] - edge[0][0], edge[1][1] - edge[0][1]);
}

// Snap alignment pairs meaningful straight runs: real cassette features
// measure ≥ 5 mm while flattened-arc facets stay below ~2 mm, and a
// contour carries hundreds of those facets.
const SNAP_EDGE_MIN_LENGTH = 5;

function snapableEdges(points = [], minLength = SNAP_EDGE_MIN_LENGTH) {
  return polygonEdges(points).filter(edge => edgeLength(edge) >= minLength);
}

function edgeSnapCandidates({ movingPoints = [], otherPoints = [], bounded = {}, clearance = 0, minEdgeLength = SNAP_EDGE_MIN_LENGTH } = {}) {
  const movingEdges = snapableEdges(movingPoints, minEdgeLength);
  const otherEdges = snapableEdges(otherPoints, minEdgeLength)
    .map(edge => ({ edge, direction: unitEdgeDirection(edge), normal: edgeUnitNormal(edge) }))
    .filter(entry => entry.direction && entry.normal);
  const candidates = [];
  for (const movingEdge of movingEdges) {
    const movingDirection = unitEdgeDirection(movingEdge);
    if (!movingDirection) continue;
    for (const { edge: otherEdge, direction: otherDirection, normal: otherNormal } of otherEdges) {
      const parallel = Math.abs(dot(movingDirection, otherDirection));
      if (1 - parallel > 0.01) continue;
      const currentDistance = dot([
        movingEdge[0][0] - otherEdge[0][0],
        movingEdge[0][1] - otherEdge[0][1]
      ], otherNormal);
      for (const sign of [-1, 1]) {
        const delta = sign * clearance - currentDistance;
        candidates.push({
          x: bounded.x + otherNormal[0] * delta,
          y: bounded.y + otherNormal[1] * delta,
          snapped: true
        });
      }
    }
  }
  return candidates;
}

function polygonsClear(leftPoints = [], rightPoints = [], clearance = 0, rightEdges = null) {
  const gap = Math.max(Number(clearance) || 0, 0);
  if (leftPoints.length < 3 || rightPoints.length < 3) return true;
  const leftEdges = polygonEdges(leftPoints);
  const otherEdges = rightEdges || polygonEdges(rightPoints);
  for (const leftEdge of leftEdges) {
    for (const rightEdge of otherEdges) {
      if (segmentsProperlyIntersect(leftEdge[0], leftEdge[1], rightEdge[0], rightEdge[1])) {
        return false;
      }
    }
  }
  if (leftPoints.some(point => pointInPolygon(point, rightPoints)) || rightPoints.some(point => pointInPolygon(point, leftPoints))) {
    return false;
  }
  // Aligned overlaps hide between shared edge lines: every crossing is a
  // touch and every corner sits on a boundary. An edge midpoint strictly
  // inside the other polygon exposes them; flush neighbors keep their
  // midpoints on the shared line and stay legal.
  if (
    leftEdges.some(edge => pointInPolygon(edgeMidpoint(edge), rightPoints)) ||
    otherEdges.some(edge => pointInPolygon(edgeMidpoint(edge), leftPoints))
  ) {
    return false;
  }
  if (gap <= GEOMETRY_EPSILON) return true;
  for (const leftEdge of leftEdges) {
    const minX = Math.min(leftEdge[0][0], leftEdge[1][0]) - gap;
    const maxX = Math.max(leftEdge[0][0], leftEdge[1][0]) + gap;
    const minY = Math.min(leftEdge[0][1], leftEdge[1][1]) - gap;
    const maxY = Math.max(leftEdge[0][1], leftEdge[1][1]) + gap;
    for (const rightEdge of otherEdges) {
      if (rightEdge[0][0] < minX && rightEdge[1][0] < minX) continue;
      if (rightEdge[0][0] > maxX && rightEdge[1][0] > maxX) continue;
      if (rightEdge[0][1] < minY && rightEdge[1][1] < minY) continue;
      if (rightEdge[0][1] > maxY && rightEdge[1][1] > maxY) continue;
      if (segmentDistance(leftEdge, rightEdge) + GEOMETRY_EPSILON < gap) return false;
    }
  }
  return true;
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

// Drag-time snap resolution: one call per pointer frame. Candidate
// geometry against the OTHER placements is transform-invariant through a
// drag, so it is computed once here — never per candidate.
export function magneticSheetPlacement({
  items = [],
  placements = [],
  index = -1,
  x = 0,
  y = 0,
  sheetWidth = 0,
  sheetHeight = 0,
  sheetPolygon = null,
  boundaryOffset = 0,
  clearance = 0,
  threshold = null
} = {}) {
  const placement = placements[index];
  if (!placement) return { x, y, snapped: false };
  const source = sheetPlacementSource(items, placement);
  const rotation = placement.transformation?.rotation ?? placement.rotation ?? 0;
  const bounded = clampSheetPlacement({ x, y, item: source, rotation, sheetWidth, sheetHeight, boundaryOffset, sheetPolygon });
  const moving = sheetItemBounds(source, rotation);
  const gap = Math.max(Number(clearance) || 0, 0);
  const snapThreshold = threshold === null ? Math.max(gap * 2, 12) : Math.max(Number(threshold) || 0, 0);
  const others = placements
    .map((other, otherIndex) => {
      if (otherIndex === index) return null;
      const points = transformedPlacementPoints(items, other);
      return { bounds: sheetPlacementBounds(items, other), points, edges: polygonEdges(points) };
    })
    .filter(Boolean);

  // Duplicate snap lines (parallel edges, repeated bounds offsets) collapse
  // into one candidate at 0.1 mm — every duplicate would evaluate identically.
  const candidateByKey = new Map();
  const offer = candidate => {
    const key = `${Math.round(candidate.x * 10)}:${Math.round(candidate.y * 10)}`;
    if (!candidateByKey.has(key)) candidateByKey.set(key, candidate);
  };
  offer({ ...bounded, snapped: false });
  const boundedPoints = translatedItemPoints(source, rotation, bounded.x, bounded.y);
  for (const other of others) {
    const { bounds } = other;
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
    xCandidates.forEach(candidateX => offer({ x: candidateX, y: bounded.y, snapped: true }));
    yCandidates.forEach(candidateY => offer({ x: bounded.x, y: candidateY, snapped: true }));
    alignedX.forEach(candidateX => offer({ x: candidateX, y: bounded.y, snapped: true }));
    alignedY.forEach(candidateY => offer({ x: bounded.x, y: candidateY, snapped: true }));
    xCandidates.forEach(candidateX => alignedY.forEach(candidateY => offer({ x: candidateX, y: candidateY, snapped: true })));
    yCandidates.forEach(candidateY => alignedX.forEach(candidateX => offer({ x: candidateX, y: candidateY, snapped: true })));
    for (const candidate of edgeSnapCandidates({
      movingPoints: boundedPoints,
      otherPoints: other.points,
      bounded,
      clearance: gap
    })) {
      offer(candidate);
    }
  }

  // Cheapest tests first, in rank order, returning on the first survivor:
  // clamp and rank cost bounds math; containment, threshold, and clearance
  // cost polygon sweeps that most candidates never reach.
  const ranked = [...candidateByKey.values()]
    .map(candidate => ({
      ...clampSheetPlacement({ ...candidate, item: source, rotation, sheetWidth, sheetHeight, boundaryOffset, sheetPolygon, bounds: moving }),
      snapped: candidate.snapped
    }))
    .sort((left, right) => {
      if (left.snapped !== right.snapped) return left.snapped ? -1 : 1;
      return Math.hypot(left.x - bounded.x, left.y - bounded.y) - Math.hypot(right.x - bounded.x, right.y - bounded.y);
    });

  for (const candidate of ranked) {
    if (candidate.snapped && Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) > snapThreshold) continue;
    const points = translatedItemPoints(source, rotation, candidate.x, candidate.y);
    if (sheetPolygon && !polygonInsideSheet(points, sheetPolygon)) continue;
    const absolute = {
      minX: candidate.x + moving.minX,
      minY: candidate.y + moving.minY,
      maxX: candidate.x + moving.maxX,
      maxY: candidate.y + moving.maxY
    };
    if (others.every(other => (
      boundsClear(absolute, other.bounds, gap) || polygonsClear(points, other.points, gap, other.edges)
    ))) {
      return candidate;
    }
  }
  // A placement already sitting in violation stays draggable so it can be
  // pulled out; the gates re-engage once it clears.
  if (!placementHasClearance({ items, placements, placement, index, clearance: gap })) {
    return { ...bounded, snapped: false };
  }
  return null;
}

// First free position for a new item: a coarse sweep of the sheet from the
// top-left, gated like a drag; the fallback is the clamped corner.
export function freeSheetPlacement({
  item = {},
  items = [],
  placements = [],
  sheetWidth = 0,
  sheetHeight = 0,
  sheetPolygon = null,
  boundaryOffset = 0,
  clearance = 0,
  step = 25
} = {}) {
  const bounds = sheetItemBounds(item, 0);
  const startX = Math.max(boundaryOffset - bounds.minX, 0);
  const startY = Math.max(boundaryOffset - bounds.minY, 0);
  const maxX = Math.max((Number(sheetWidth) || 0) - boundaryOffset - bounds.maxX, startX);
  const maxY = Math.max((Number(sheetHeight) || 0) - boundaryOffset - bounds.maxY, startY);
  const withItem = [...items, item];
  const sweep = Math.max(Number(step) || 25, 1);
  for (let y = startY; y <= maxY + sweep; y += sweep) {
    for (let x = startX; x <= maxX + sweep; x += sweep) {
      const bounded = clampSheetPlacement({
        x: Math.min(x, maxX),
        y: Math.min(y, maxY),
        item,
        sheetWidth,
        sheetHeight,
        boundaryOffset,
        sheetPolygon
      });
      const candidate = {
        item_id: item.id,
        transformation: { rotation: 0, translation: [bounded.x, bounded.y] }
      };
      if (placementHasClearance({ items: withItem, placements, placement: candidate, clearance })) {
        return bounded;
      }
    }
  }
  return clampSheetPlacement({ x: startX, y: startY, item, sheetWidth, sheetHeight, boundaryOffset, sheetPolygon });
}

export function rotateSheetPlacementQuarterTurn({ items = [], placements = [], index = -1, sheetWidth = 0, sheetHeight = 0, sheetPolygon = null, boundaryOffset = 0, clearance = 0 } = {}) {
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
    sheetPolygon,
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

// Cassette-design records on the §3 wire: the baked geometry
// (`fields.geometry` — bake and DXF extraction write it; a design with
// none has no placeable geometry).
function designGeometryParts(design = {}) {
  const geometry = design.fields?.geometry || {};
  return {
    polygonParts: Array.isArray(geometry.nestingPolygons) ? geometry.nestingPolygons : [],
    layerData: Array.isArray(geometry.layerData) ? geometry.layerData : []
  };
}

// One sheet item per extracted polygon (each sheet workpiece nests as its
// own part); the item's source layers are the layer rows of its workpiece.
export function designSheetItems(design = {}, idPrefix = 'item') {
  const { polygonParts, layerData } = designGeometryParts(design);
  return polygonParts
    .map((part, index) => {
      const coordinates = (Array.isArray(part.coordinates) ? part.coordinates : [])
        .map(point => Array.isArray(point) && point.length >= 2
          ? [Number(point[0]) || 0, Number(point[1]) || 0]
          : null)
        .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (coordinates.length < 3) return null;
      const workpieceId = part.workpieceId || null;
      return {
        id: `${idPrefix}-${index}`,
        design_id: design._id,
        name: polygonParts.length > 1 ? `${design.name || design._id} ${index + 1}` : (design.name || design._id),
        shape: { type: 'simple_polygon', data: clone(coordinates) },
        sourceLayers: layerData
          .filter(layer => !workpieceId || !layer.workpieceId || layer.workpieceId === workpieceId)
          .map(layer => ({
            ...clone(layer),
            layer: layer.layer || layer.standardCode || layer.name
          }))
      };
    })
    .filter(Boolean);
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
