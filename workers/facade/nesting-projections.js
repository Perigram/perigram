// The nesting services' value→value helpers — contract in ./README.md (Services).

function nestingError(message) {
  const error = new Error(message);
  error.status = 400;
  error.statusCode = 400;
  throw error;
}

export function normalizeNestingItems(items) {
  if (!Array.isArray(items) || !items.length) nestingError('The nesting run has no parts to place');
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      nestingError(`Item ${index} is not a part`);
    }
    const authoredCount = Number(item.count);
    const count = authoredCount === 0 || !Number.isFinite(authoredCount)
      ? (item.count == null || item.count === '' || authoredCount === 0 ? 1 : NaN)
      : Math.trunc(authoredCount);
    if (!Number.isSafeInteger(count) || count < 1) {
      nestingError(`Item ${index} count must be a positive safe integer`);
    }
    return { ...item, count };
  });
}

export function nestingSheetCount(items = []) {
  const total = items.reduce((sum, item) => (
    sum + Math.max(1, Math.trunc(Number(item?.count) || 1))
  ), 0);
  if (!Number.isSafeInteger(total)) nestingError('Nesting sheet count exceeds the safe integer limit');
  return Math.max(1, total);
}

export function stableSheetName(layout = null, draft = {}) {
  const authored = String(draft?.data?.name || '').trim();
  if (authored) return authored;
  const identity = String(layout?.compositionKey || JSON.stringify(layout || {}));
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `Sheet ${(hash >>> 0).toString(36)}`;
}

export function buildValueWorkerRequest(jobFiles, params = {}) {
  const items = buildNestingItems(jobFiles);
  if (!items.length) throw nestingError('No nestable cassette-design geometry found');
  return {
    items,
    params: {
      width: Number(params.width),
      height: Number(params.height),
      space: Number(params.space),
      sheetCount: Number(params.sheetCount),
      ...(params.sheet_polygon ? { sheet_polygon: normalizeSheetPolygonShape(params.sheet_polygon) } : {})
    }
  };
}

// The nesting-parts projection (SPEC §8 p, service-resolved): each nesting
// polygon part rides with its own workpiece layers, so a solve's source
// items carry what the sheet composition transforms — parts and layers
// join by workpieceId.
export function nestingPartsProjection(geometry = null) {
  const parts = Array.isArray(geometry?.nestingPolygons) ? geometry.nestingPolygons : [];
  const layerData = Array.isArray(geometry?.layerData) ? geometry.layerData : [];
  return parts.map(part => ({
    ...part,
    sourceLayers: sourceLayersForPart(layerData, part)
  }));
}

export function enrichNestingResult(result = {}, request = {}) {
  const params = request.params || {};
  const width = Number(params.width || 1220);
  const height = Number(params.height || 2440);
  const requestItems = request.items || [];
  const resultItemsById = new Map((Array.isArray(result.items) ? result.items : [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const enrichedItems = requestItems.map(requestItem => {
    const item = resultItemsById.get(requestItem.id?.toString()) || {};
    resultItemsById.delete(requestItem.id?.toString());
    return {
      ...item,
      id: requestItem.id,
      design_id: item.design_id || requestItem.design_id,
      design_key: item.design_key || requestItem.design_key,
      handles: item.handles?.length ? item.handles : requestItem.handles || [],
      sourceLayers: item.sourceLayers?.length ? item.sourceLayers : requestItem.sourceLayers || [],
      demand: item.demand ?? requestItem.count ?? 1,
      shape: item.shape?.data?.length ? item.shape : {
        type: 'simple_polygon',
        data: requestItem.coords || []
      }
    };
  });
  enrichedItems.push(...Array.from(resultItemsById.values()));
  if (!enrichedItems.length) {
    enrichedItems.push(...requestItems.map(item => ({
      id: item.id,
      design_id: item.design_id,
      design_key: item.design_key,
      handles: item.handles || [],
      sourceLayers: item.sourceLayers || [],
      demand: item.count || 1,
      shape: {
        type: 'simple_polygon',
        data: item.coords || []
      }
    })));
  }
  return {
    ...result,
    items: enrichedItems,
    bins: Array.isArray(result.bins) && result.bins.length
      ? result.bins
      : [{
        id: 0,
        shape: {
          type: 'polygon',
          data: fallbackBinShapeData(params, width, height)
        },
        stock: params.sheetCount || 1
      }]
  };
}

// The worker returns its placements under `solution.layouts` (lbf output);
// the value boundary exposes them as the service's `layouts` half, each
// layout self-contained for sheet construction: `sourceItems` resolves its
// placements to the request items (shape, source layers, cassette
// provenance) and `sheetPolygon` carries its bin shape.
export function nestingLayouts(result = {}) {
  const layouts = result.solution?.layouts || result.layouts || [];
  const itemsById = new Map((result.items || [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const binsById = new Map((result.bins || [])
    .map(bin => [bin.id?.toString(), bin])
    .filter(([id]) => id !== undefined));
  return layouts.map(layout => {
    const placements = layout.placed_items || layout.items || [];
    const sourceItems = [...new Map(placements
      .map(placed => itemsById.get(String(placed.item_id ?? placed.itemId ?? placed.id ?? '')))
      .filter(Boolean)
      .map(item => [item.id?.toString(), item])).values()];
    const bin = binsById.get(String(layout.container_id ?? layout.bin_id ?? '')) || null;
    return {
      ...layout,
      ...(sourceItems.length ? { sourceItems } : {}),
      ...(bin?.shape?.data ? { sheetPolygon: bin.shape.data } : {})
    };
  });
}

// The solve's quantity join (facade SPEC): sheets whose placements cut
// the same design multiset are one sheet design applied `count` times.
// The grouping key is the sorted design-id multiset; the group's first
// layout is the representative geometry.
export function groupNestingLayouts(result = {}) {
  const layouts = nestingLayouts(result);
  const designByItemId = new Map((result.items || [])
    .map(item => [item.id?.toString(), String(item.design_key ?? item.design_id ?? '')]));
  const groups = new Map();
  for (const layout of layouts) {
    const placements = layout.placed_items || layout.items || [];
    // Equal sheet designs carry the same design composition on the same
    // sheet shape. Placement order, rotation, and translation are the
    // solver's arrangement; they do not change the design.
    const key = JSON.stringify({
      sheet: normalizeCompositionPolygon(layout.sheetPolygon),
      designs: placements
        .map(placed => designByItemId.get(String(placed.item_id ?? placed.itemId ?? placed.id ?? '')) ?? '')
        .sort()
    });
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { ...layout, count: 1, compositionKey: key });
  }
  return [...groups.values()];
}

function normalizeCompositionPolygon(polygon) {
  if (!polygon || typeof polygon !== 'object') return null;
  const ring = value => (Array.isArray(value) ? value.map(point => {
    const values = Array.isArray(point) ? point : [point?.x, point?.y];
    return values.map(value => Number(value) || 0);
  }) : []);
  return { outer: ring(polygon.outer), inner: Array.isArray(polygon.inner) ? polygon.inner.map(ring) : [] };
}

export function summarizeNestingResult(result = {}, params = {}) {
  const layouts = nestingLayouts(result);
  const placedCount = layouts.reduce((sum, layout) => sum + (layout.placed_items?.length || layout.items?.length || 0), 0);
  const sheetCount = layouts.length;
  const density = result.solution?.density ?? averageLayoutDensity(layouts);
  const sheetArea = nestingSheetArea(result, params);
  const efficiency = firstFinite([
    result.stats?.efficiency,
    result.efficiency,
    percentFromDensity(density),
    percentFromPlacedArea(result, layouts, sheetArea)
  ]);
  const remnantArea = firstFinite([
    result.stats?.remnantArea,
    result.remnantArea,
    remnantAreaFromDensity(density, sheetArea, sheetCount),
    remnantAreaFromPlacedArea(result, layouts, sheetArea, sheetCount)
  ]);
  return { efficiency, sheetCount, remnantArea, placedCount };
}

function buildNestingItems(jobFiles = []) {
  let id = 0;
  const items = [];
  for (const file of jobFiles) {
    const count = Number(file.count || file.quantity || 1);
    // The design key rides the element: an explicit designId, the part's
    // own design id (the projection stamps it), or the element's own
    // identity when the item is a record that carries one.
    const itemDesignId = String(file.designId ?? file.design_id ?? file._id ?? file.id ?? '');
    const itemDesignKey = String(file.designKey ?? file.design_key ?? '');
    // Parts arrive as a list or — after a tree flatten over a
    // single-element list — as one part object.
    const polygonParts = Array.isArray(file.polygonParts)
      ? file.polygonParts
      : file.polygonParts && typeof file.polygonParts === 'object'
        ? [file.polygonParts]
        : partsOfElement(file);
    if (polygonParts.length) {
      for (const part of polygonParts) {
        const coords = normalizeCoordinates(part.coordinates);
        if (!isValidPolygonCoordinates(coords)) continue;
        items.push({
          id,
          design_id: String(part.designId ?? itemDesignId),
          design_key: itemDesignKey || String(part.designId ?? itemDesignId),
          coords,
          handles: part.handles || [],
          sourceLayers: part.sourceLayers?.length
            ? part.sourceLayers
            : sourceLayersForPart(part.layerData || file.layerData || [], part),
          count
        });
        id += 1;
      }
      continue;
    }

    const rectangle = rectangleFromDimensions(file.dimensions || {});
    if (!rectangle.length) continue;
    items.push({
      id,
      design_id: itemDesignId,
      design_key: itemDesignKey || itemDesignId,
      coords: rectangle,
      handles: [],
      sourceLayers: sourceLayersForPart(file.layerData || [], {}),
      count
    });
    id += 1;
  }
  return items;
}

// An element (an entity wire record) carries its geometry under
// fields.geometry — the same nesting polygons the projection would emit.
function partsOfElement(file = {}) {
  const geometry = file.fields?.geometry ?? file.geometry;
  if (!geometry || !Array.isArray(geometry.nestingPolygons)) return [];
  return nestingPartsProjection(geometry);
}

function sourceLayersForPart(layerData = [], part = {}) {
  return layerData.filter(layer => (
    !layer.workpieceId ||
    !part.workpieceId ||
    layer.workpieceId === part.workpieceId
  ));
}

function normalizeCoordinates(coords = []) {
  return coords
    .filter(point => Array.isArray(point) && point.length >= 2)
    .map(point => [Number(point[0]), Number(point[1])])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function uniquePointCount(coords = []) {
  return new Set(coords.map(point => `${roundCoord(point[0])}:${roundCoord(point[1])}`)).size;
}

function roundCoord(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function isValidPolygonCoordinates(coords = []) {
  if (!Array.isArray(coords) || coords.length < 3) return false;
  if (uniquePointCount(coords) < 3) return false;
  return polygonArea(coords) > 0.000001;
}

function rectangleFromDimensions(dimensions = {}) {
  const values = Object.values(dimensions).map(Number).filter(Number.isFinite);
  if (values.length < 2) return [];
  const [width, height] = values;
  if (width <= 0 || height <= 0) return [];
  return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
}

export function normalizeSheetPolygonShape(polygon = null) {
  if (polygon && !Array.isArray(polygon) && typeof polygon === 'object') {
    const outer = normalizeSheetPolygon(polygon.outer || polygon.data?.outer || []);
    if (!outer) return null;
    const inner = (polygon.inner || polygon.data?.inner || [])
      .map(normalizeSheetPolygon)
      .filter(Boolean);
    return { outer, inner };
  }
  const outer = normalizeSheetPolygon(polygon);
  return outer ? { outer, inner: [] } : null;
}

function normalizeSheetPolygon(points = []) {
  const normalized = normalizeCoordinates(Array.isArray(points) ? points : []);
  if (!isValidPolygonCoordinates(normalized)) return null;
  if (!sameCoordinate(normalized[0], normalized[normalized.length - 1])) {
    normalized.push([...normalized[0]]);
  }
  return normalized;
}

function sameCoordinate(left = [], right = []) {
  return Math.abs(Number(left[0]) - Number(right[0])) <= 0.001 &&
    Math.abs(Number(left[1]) - Number(right[1])) <= 0.001;
}

function fallbackBinShapeData(params = {}, width = 0, height = 0) {
  const sheetPolygon = normalizeSheetPolygonShape(params.sheet_polygon);
  if (sheetPolygon) return sheetPolygon;
  return {
    outer: [[0, 0], [width, 0], [width, height], [0, height], [0, 0]],
    inner: []
  };
}

function firstFinite(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.round(number * 100) / 100;
  }
  return 0;
}

function averageLayoutDensity(layouts = []) {
  const densities = layouts.map(layout => Number(layout.density)).filter(Number.isFinite);
  if (!densities.length) return null;
  return densities.reduce((sum, density) => sum + density, 0) / densities.length;
}

function percentFromDensity(density) {
  if (density === null || density === undefined || density === '') return null;
  const number = Number(density);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? number * 100 : number;
}

function remnantAreaFromDensity(density, sheetArea, sheetCount) {
  if (density === null || density === undefined || density === '') return null;
  const number = Number(density);
  if (!Number.isFinite(number) || !sheetArea || !sheetCount) return null;
  const ratio = number <= 1 ? number : number / 100;
  return Math.max(sheetArea * sheetCount * (1 - ratio), 0) / 1000000;
}

function percentFromPlacedArea(result, layouts, sheetArea) {
  const placedArea = nestingPlacedArea(result, layouts);
  if (!placedArea || !sheetArea || !layouts.length) return null;
  return (placedArea / (sheetArea * layouts.length)) * 100;
}

function remnantAreaFromPlacedArea(result, layouts, sheetArea, sheetCount) {
  const placedArea = nestingPlacedArea(result, layouts);
  if (!sheetArea || !sheetCount) return null;
  return Math.max(sheetArea * sheetCount - placedArea, 0) / 1000000;
}

function nestingSheetArea(result = {}, params = {}) {
  const paramShapeArea = polygonShapeArea(params.sheet_polygon);
  if (paramShapeArea > 0) return paramShapeArea;
  const binOuter = result.bins?.[0]?.shape?.data?.outer;
  const binInner = result.bins?.[0]?.shape?.data?.inner || [];
  const binShapeArea = polygonShapeArea({ outer: binOuter, inner: binInner });
  if (binShapeArea > 0) return binShapeArea;
  const width = Number(params.width || params.virtualWidth || 0);
  const height = Number(params.height || params.virtualLength || 0);
  return width > 0 && height > 0 ? width * height : 0;
}

function nestingPlacedArea(result = {}, layouts = []) {
  const sourceAreas = new Map((result.items || [])
    .map(item => [item.id?.toString(), polygonArea(item.shape?.data || item.coords || item.coordinates)])
    .filter(([id, area]) => id !== undefined && area > 0));
  return layouts.reduce((sum, layout) => {
    const items = layout.placed_items || layout.items || [];
    return sum + items.reduce((layoutSum, item) => {
      const id = item.item_id ?? item.itemId ?? item.id;
      return layoutSum + (sourceAreas.get(id?.toString()) || 0);
    }, 0);
  }, 0);
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!Array.isArray(current) || !Array.isArray(next)) continue;
    const x1 = Number(current[0]);
    const y1 = Number(current[1]);
    const x2 = Number(next[0]);
    const y2 = Number(next[1]);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function polygonShapeArea(shape = null) {
  const normalized = normalizeSheetPolygonShape(shape);
  if (!normalized) return 0;
  const outerArea = polygonArea(normalized.outer);
  const innerArea = normalized.inner.reduce((sum, ring) => sum + polygonArea(ring), 0);
  return Math.max(outerArea - innerArea, 0);
}
