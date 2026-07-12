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
