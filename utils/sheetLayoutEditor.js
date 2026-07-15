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
  const radians = Math.abs(Number(rotation) || 0) <= Math.PI * 2
    ? Number(rotation) || 0
    : ((Number(rotation) || 0) * Math.PI) / 180;
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

export function clampSheetPlacement({ x = 0, y = 0, item = {}, rotation = 0, sheetWidth = 0, sheetHeight = 0 } = {}) {
  const bounds = sheetItemBounds(item, rotation);
  const minX = -bounds.minX;
  const minY = -bounds.minY;
  const maxX = Math.max(Number(sheetWidth) || 0, bounds.width) - bounds.maxX;
  const maxY = Math.max(Number(sheetHeight) || 0, bounds.height) - bounds.maxY;
  return {
    x: Math.min(Math.max(Number(x) || 0, minX), Math.max(maxX, minX)),
    y: Math.min(Math.max(Number(y) || 0, minY), Math.max(maxY, minY))
  };
}

export function snapSheetPlacementToNeighbors({ x = 0, y = 0, item = {}, rotation = 0, placements = [], items = [], currentIndex = -1, gap = 0, threshold } = {}) {
  const moving = sheetItemBounds(item, rotation);
  const toolGap = Math.max(Number(gap) || 0, 0);
  const snapThreshold = Math.max(Number(threshold) || toolGap || 5, 2);
  let nextX = Number(x) || 0;
  let nextY = Number(y) || 0;
  let bestX = snapThreshold + 1;
  let bestY = snapThreshold + 1;

  placements.forEach((placement, index) => {
    if (index === currentIndex) return;
    const source = sheetPlacementSource(items, placement);
    const transform = sheetPlacementTransform(placement);
    const bounds = sheetItemBounds(source, placement.transformation?.rotation ?? placement.rotation ?? 0);
    const other = absoluteBounds(bounds, transform.x, transform.y);
    const candidate = absoluteBounds(moving, nextX, nextY);

    if (rangesOverlap(candidate.minY, candidate.maxY, other.minY - toolGap, other.maxY + toolGap)) {
      for (const candidateX of [
        other.minX - toolGap - moving.maxX,
        other.maxX + toolGap - moving.minX
      ]) {
        const distance = Math.abs(candidateX - nextX);
        if (distance <= snapThreshold && distance < bestX) {
          nextX = candidateX;
          bestX = distance;
        }
      }
    }

    if (rangesOverlap(candidate.minX, candidate.maxX, other.minX - toolGap, other.maxX + toolGap)) {
      for (const candidateY of [
        other.minY - toolGap - moving.maxY,
        other.maxY + toolGap - moving.minY
      ]) {
        const distance = Math.abs(candidateY - nextY);
        if (distance <= snapThreshold && distance < bestY) {
          nextY = candidateY;
          bestY = distance;
        }
      }
    }
  });

  return { x: nextX, y: nextY, snappedX: bestX <= snapThreshold, snappedY: bestY <= snapThreshold };
}

function absoluteBounds(bounds, x, y) {
  return {
    minX: x + bounds.minX,
    minY: y + bounds.minY,
    maxX: x + bounds.maxX,
    maxY: y + bounds.maxY
  };
}

function rangesOverlap(leftMin, leftMax, rightMin, rightMax) {
  return leftMax >= rightMin && rightMax >= leftMin;
}

export function rotateSheetPlacement90(placement = {}) {
  const current = Number(placement.transformation?.rotation ?? placement.rotation ?? 0) || 0;
  const currentDegrees = Math.abs(current) <= Math.PI * 2 ? current * 180 / Math.PI : current;
  const rotation = ((currentDegrees + 90) % 360 + 360) % 360;
  return {
    ...placement,
    transformation: {
      ...(placement.transformation || {}),
      rotation,
      translation: placement.transformation?.translation || [placement.x || 0, placement.y || 0]
    }
  };
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
