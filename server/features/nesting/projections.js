// Nesting projections (π): pure entity→value functions. No service imports,
// no persistence, no auth — the declared seam between entities and the
// nesting service (packages/cts SPEC §8: services consume values, never
// entity graphs; projections are the only entity→value gate).
import { createError } from 'h3';

export function buildNestingWorkerRequest(jobFiles, settings = {}) {
  const items = buildNestingItems(jobFiles);
  if (!items.length) throw createError({ statusCode: 400, message: 'No nestable cassette geometry found' });
  const params = resolveNestingParams(settings);
  return { items, params };
}

export function resolveNestingParams(settings = {}) {
  const context = resolveNestingContext(settings);
  return {
    width: context.width,
    height: context.height,
    space: context.space,
    sheetCount: context.sheetCount,
    sheet_polygon: context.sheet_polygon
  };
}

export function resolveNestingMaterialPool(settings = {}, queue = {}) {
  return Array.isArray(settings.materialPool) && settings.materialPool.length
    ? settings.materialPool
    : queue.data?.job?.materialPool || [];
}

export function resolveNestingContext(settings = {}) {
  const { machineSnapshot, toolSnapshot, materialSnapshot } = settings;
  if (!machineSnapshot?.source?.id) throw createError({ statusCode: 400, message: 'Machine snapshot is required' });
  if (!toolSnapshot?.source?.id) throw createError({ statusCode: 400, message: 'Tool snapshot is required' });
  if (!materialSnapshot?.mode) throw createError({ statusCode: 400, message: 'Material snapshot is required' });
  if (!(Number(toolSnapshot.kerf) > 0)) throw createError({ statusCode: 400, message: 'Selected tool must define a positive kerf' });
  if (!(Number(machineSnapshot.workingArea?.width) > 0) || !(Number(machineSnapshot.workingArea?.length) > 0)) {
    throw createError({ statusCode: 400, message: 'Selected machine must define a positive working area' });
  }
  if (!(Number(materialSnapshot.width) > 0) || !(Number(materialSnapshot.length) > 0) || !(Number(materialSnapshot.thickness) > 0)) {
    throw createError({ statusCode: 400, message: 'Selected material must define width, length, and thickness' });
  }
  if (!Number.isInteger(Number(materialSnapshot.sheetCount)) || Number(materialSnapshot.sheetCount) <= 0) {
    throw createError({ statusCode: 400, message: 'Selected material must provide at least one sheet' });
  }
  return {
    width: Number(materialSnapshot.width),
    height: Number(materialSnapshot.length),
    space: Number(toolSnapshot.kerf),
    sheetCount: Number(materialSnapshot.sheetCount),
    sheet_polygon: normalizeSheetPolygonShape(materialSnapshot.usableSheetPolygon),
    materialMode: materialSnapshot.mode,
    materialPool: materialSnapshot.sources || []
  };
}

// Parametric evaluation is injected: the caller owns the template service,
// this function owns the merge/equality geometry contract.
export async function resolveQueueDesignGeometry({ entry, sourceDesign, parameters = {}, evaluateTemplate, cache = new Map() } = {}) {
  if (!sourceDesign) return null;
  const sourceParameters = hasEntries(sourceDesign.data?.parameters)
    ? sourceDesign.data.parameters
    : (sourceDesign.provenance?.derivedFrom?.parameters || {});
  const effectiveParameters = { ...sourceParameters, ...(parameters || {}) };
  const canDeriveParametricGeometry = hasEntries(sourceParameters);
  if (!canDeriveParametricGeometry || sameParameterMap(effectiveParameters, sourceParameters)) return sourceDesign;

  const sourceRef = sourceDesign.provenance?.derivedFrom?.source;
  if (sourceRef?.type !== 'cassette' || !sourceRef.id) {
    throw createError({ statusCode: 400, message: `Parametric cassette design ${entry.id} has no source cassette template provenance` });
  }

  const cacheKey = `${sourceRef.id}:${stableParameterKey(effectiveParameters)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const evaluated = await evaluateTemplate(sourceRef.id, effectiveParameters);
  const polygonParts = evaluated.nestingPolygons?.length ? evaluated.nestingPolygons : evaluated.polygons;
  if (!polygonParts?.length) {
    throw createError({ statusCode: 400, message: `Parametric cassette template ${sourceRef.id} produced no geometry` });
  }
  const design = {
    ...sourceDesign,
    data: {
      ...(sourceDesign.data || {}),
      parameters: evaluated.dimensions || effectiveParameters,
      polygonParts,
      layerData: evaluated.layerData || sourceDesign.data?.layerData || [],
      geometry: {
        ...(sourceDesign.data?.geometry || {}),
        data: {
          ...(sourceDesign.data?.geometry?.data || {}),
          dimensions: evaluated.dimensions || effectiveParameters,
          polygonParts,
          layerData: evaluated.layerData || sourceDesign.data?.geometry?.data?.layerData || []
        }
      }
    }
  };
  cache.set(cacheKey, design);
  return design;
}

export function stableParameterKey(parameters = {}) {
  return JSON.stringify(Object.keys(parameters || {}).sort().map(key => [key, normalizeParameterValue(parameters[key])]));
}

export function sameParameterMap(left = {}, right = {}) {
  return stableParameterKey(left) === stableParameterKey(right);
}

function normalizeParameterValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
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
      cassette_id: item.cassette_id || requestItem.cassette_id,
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
      cassette_id: item.cassette_id,
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

export function summarizeNestingResult(result = {}, params = {}) {
  const layouts = result.solution?.layouts || result.layouts || [];
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

export function insetSheetPolygon(polygon, offset = 0) {
  const normalized = normalizeSheetPolygonShape(polygon);
  if (!normalized) throw createError({ statusCode: 400, message: 'Material sheet polygon is invalid' });
  const inset = Number(offset || 0);
  if (!(inset > 0)) return normalized;
  return withClipper(async (clipper, paths) => {
    const orientedRings = [
      orientRing(normalized.outer, true),
      ...normalized.inner.map(ring => orientRing(ring, false))
    ];
    for (const ring of orientedRings) {
      const path = new clipper.PathD();
      for (const [x, y] of ring.slice(0, -1)) {
        const point = new clipper.PointD(x, y, 0);
        path.push_back(point);
        point.delete();
      }
      paths.push_back(path);
      path.delete();
    }
    const result = clipper.InflatePathsD(paths, -inset, clipper.JoinType.Miter, clipper.EndType.Polygon, 2, 3, 0);
    try {
      const rings = [];
      for (let index = 0; index < result.size(); index += 1) {
        const path = result.get(index);
        const ring = [];
        for (let pointIndex = 0; pointIndex < path.size(); pointIndex += 1) {
          const point = path.get(pointIndex);
          ring.push([point.x, point.y]);
          point.delete();
        }
        path.delete();
        const closed = normalizeSheetPolygon(ring);
        if (closed) rings.push(closed);
      }
      if (!rings.length) throw createError({ statusCode: 400, message: 'Machine boundary offset leaves no usable material area' });
      const outerRings = rings.filter(ring => signedPolygonArea(ring) > 0);
      const innerRings = rings.filter(ring => signedPolygonArea(ring) < 0);
      if (outerRings.length !== 1) {
        throw createError({ statusCode: 400, message: 'Machine boundary offset creates disconnected usable material areas' });
      }
      return {
        outer: orientRing(outerRings[0], true),
        inner: innerRings.map(ring => orientRing(ring, false))
      };
    } finally {
      result.delete();
    }
  });
}

async function withClipper(body) {
  const { default: createClipper } = await import('clipper2-wasm');
  const clipper = await createClipper();
  const paths = new clipper.PathsD();
  try {
    return await body(clipper, paths);
  } finally {
    paths.delete();
  }
}

export function signedPolygonArea(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return twiceArea / 2;
}

function orientRing(ring, counterClockwise) {
  const normalized = normalizeSheetPolygon(ring);
  if (!normalized) return ring;
  const isCounterClockwise = signedPolygonArea(normalized) > 0;
  const points = normalized.slice(0, -1);
  if (isCounterClockwise !== counterClockwise) points.reverse();
  const firstIndex = points.reduce((bestIndex, point, index) => {
    const best = points[bestIndex];
    return point[0] < best[0] || (point[0] === best[0] && point[1] < best[1]) ? index : bestIndex;
  }, 0);
  const canonical = [...points.slice(firstIndex), ...points.slice(0, firstIndex)];
  return [...canonical, canonical[0]];
}

function fallbackBinShapeData(params = {}, width = 0, height = 0) {
  const sheetPolygon = normalizeSheetPolygonShape(params.sheet_polygon);
  if (sheetPolygon) return sheetPolygon;
  return {
    outer: [[0, 0], [width, 0], [width, height], [0, height], [0, 0]],
    inner: []
  };
}

function buildNestingItems(jobFiles = []) {
  let id = 0;
  const items = [];
  for (const file of jobFiles) {
    const count = Number(file.count || file.quantity || 1);
    const polygonParts = file.polygonParts || [];
    const layerData = file.layerData || [];
    if (polygonParts.length) {
      for (const part of polygonParts) {
        const coords = normalizeCoordinates(part.coordinates);
        if (!isValidPolygonCoordinates(coords)) continue;
        items.push({
          id,
          cassette_id: file.cassetteId,
          coords,
          handles: part.handles || [],
          sourceLayers: sourceLayersForPart(layerData, part),
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
      cassette_id: file.cassetteId,
      coords: rectangle,
      handles: [],
      sourceLayers: sourceLayersForPart(layerData, {}),
      count
    });
    id += 1;
  }
  return items;
}

export function getPolygonParts(entity = {}) {
  return entity.data?.polygonParts
    || entity.polygonParts
    || entity.data?.geometry?.data?.polygonParts
    || [];
}

export function getLayerData(entity = {}) {
  return entity.data?.layerData
    || entity.layerData
    || entity.data?.geometry?.data?.layerData
    || [];
}

function sourceLayersForPart(layerData = [], part = {}) {
  return layerData.filter(layer => (
    !layer.workpieceId ||
    !part.workpieceId ||
    layer.workpieceId === part.workpieceId
  ));
}

export function hasEntries(value = {}) {
  return value && typeof value === 'object' && Object.keys(value).length > 0;
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

export function normalizeMaterialPoolSource(source = {}) {
  const dimensions = source.dimensions || source.specsData || source.sheet || {};
  const parsed = parseDimensionText(source.specs || source.label || '');
  const width = Number(dimensions.width || dimensions.w || parsed.width || 0);
  const height = Number(dimensions.length || dimensions.height || dimensions.h || parsed.height || 0);
  const available = Number(source.available || source.availableCount || source.quantity || source.count || 1);
  const thickness = Number(dimensions.thickness || source.thickness || 0);
  const sheetPolygon = resolveMaterialSheetPolygon(source);
  return {
    ...source,
    width,
    height,
    thickness,
    sheetPolygon,
    available: Number.isFinite(available) && available > 0 ? Math.floor(available) : 1
  };
}

function resolveMaterialSheetPolygon(source = {}) {
  return normalizeSheetPolygonShape(
    source.sheet_polygon ||
    source.sheetPolygon ||
    source.geometry?.polygon ||
    source.geometryData?.polygon ||
    source.data?.geometryData?.polygon ||
    source.data?.geometry?.data?.polygon ||
    source.data?.geometry?.polygon ||
    source.geometry?.data?.polygon ||
    source.geometry?.polygon?.outer ||
    source.geometryData?.polygon?.outer ||
    source.data?.geometryData?.polygon?.outer ||
    source.data?.geometry?.data?.polygon?.outer ||
    source.data?.geometry?.polygon?.outer ||
    source.geometry?.data?.polygon?.outer ||
    firstPolygonPartCoordinates(source.geometryData?.polygonParts) ||
    firstPolygonPartCoordinates(source.data?.geometry?.data?.polygonParts)
  );
}

function firstPolygonPartCoordinates(parts = []) {
  const part = Array.isArray(parts) ? parts.find(item => Array.isArray(item?.coordinates)) : null;
  return part?.coordinates || null;
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

function parseDimensionText(text = '') {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return {};
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
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
