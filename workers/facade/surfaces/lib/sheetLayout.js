// Sheet-design layout recompute (client-side, pure): the editor owns its
// save-time presentation compute exactly like the cassette designer owns
// OCCS evaluation — the nesting result's placed items become the stored
// geometry record, preview, and summary before the generic instance
// patch persists them. Construction-time compute lives in the facade
// plugin's executor (workers/facade); this is the editor surface's copy.

import { occsLayerExportName, occsLayerStandard, penForLayer, strokeDasharray } from '../../occs/layerStandards.js';

// Standard layers display their registry production export name — bare
// codes never surface in a drawing or the DXF export.
function displayLayerName(code) {
  return occsLayerStandard(code) ? occsLayerExportName(code) : code;
}

// Preview layers carry the layer standards' pens verbatim (color, weight,
// dash); stroke-width scaling to screen pixels is the renderer's concern.
function layerStyle(code) {
  const pen = penForLayer(code);
  return {
    color: pen.color,
    weight: pen.weight,
    dasharray: strokeDasharray(pen.pattern)
  };
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const x = Number(point[0]);
  const y = Number(point[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function normalizePoints(points = []) {
  return points.map(normalizePoint).filter(Boolean);
}

function samePoint(left, right) {
  return Math.abs(Number(left?.[0]) - Number(right?.[0])) <= 0.001 &&
    Math.abs(Number(left?.[1]) - Number(right?.[1])) <= 0.001;
}

function coordinatesPath(points = [], close = false) {
  const normalized = normalizePoints(points);
  if (normalized.length < 2) return null;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const closed = close && !samePoint(first, last) ? [...normalized, first] : normalized;
  const suffix = close || samePoint(first, last) ? ' Z' : '';
  return closed.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ') + suffix;
}

function closePath(points = []) {
  return coordinatesPath(points, true);
}

function itemTranslation(item = {}) {
  const translation = item.transformation?.translation;
  if (Array.isArray(translation) && translation.length >= 2) return translation;
  return [
    item.x ?? item.left ?? item.position?.x ?? 0,
    item.y ?? item.top ?? item.position?.y ?? 0
  ];
}

function itemRotation(item = {}) {
  return item.transformation?.rotation ?? item.rotation ?? item.angle ?? 0;
}

function transformItemPoints(points = [], item = {}) {
  const [tx, ty] = itemTranslation(item);
  const x = Number(tx) || 0;
  const y = Number(ty) || 0;
  const angle = Number(itemRotation(item)) || 0;
  const radians = Math.abs(angle) > Math.PI * 2 ? (angle * Math.PI) / 180 : angle;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([px, py]) => [
    x + px * cos - py * sin,
    y + px * sin + py * cos
  ]);
}

function transformPoint(point = [], item = {}) {
  return transformItemPoints([point], item)[0];
}

function itemPoints(item = {}) {
  const points = item.coords
    || item.coordinates
    || item.polygon
    || item.points
    || item.geometry?.coords
    || item.geometry?.coordinates
    || [];
  if (points.length) return points;
  const width = Number(item.width || item.w || item.size?.width || 0);
  const height = Number(item.height || item.h || item.size?.height || 0);
  if (width > 0 && height > 0) return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
  return [];
}

function itemSourceId(item = {}) {
  return item.item_id ?? item.itemId ?? item.id;
}

function itemSourcePointsById(result = {}) {
  return new Map((result.items || [])
    .map(item => [item.id?.toString(), {
      points: item.shape?.data || item.coords || item.coordinates || [],
      sourceLayers: item.sourceLayers || []
    }])
    .filter(([id, source]) => id !== undefined && Array.isArray(source.points) && source.points.length));
}

function layerCode(layer = {}) {
  return layer.layer || layer.standardCode || layer.name || 'geometry';
}

function layerPathShouldClose(layer = {}) {
  const code = layerCode(layer);
  return code.startsWith('cut.') || code.startsWith('contour.');
}

function pushLayerPath(layers, code, path) {
  if (!path) return;
  let layer = layers.find(item => (item.standardCode || item.name) === code);
  if (!layer) {
    layer = {
      name: displayLayerName(code),
      standardCode: code,
      ...layerStyle(code),
      paths: []
    };
    layers.push(layer);
  }
  layer.paths.push(path);
}

function dimensionGeometryPaths(layer = {}, item = {}) {
  const geometry = layer.geometry || {};
  if (geometry.type !== 'dimension') return [];
  const from = normalizePoint(geometry.from);
  const to = normalizePoint(geometry.to);
  if (!from || !to) return [];
  const transformedFrom = transformPoint(from, item);
  const transformedTo = transformPoint(to, item);
  const mid = [
    (transformedFrom[0] + transformedTo[0]) / 2,
    (transformedFrom[1] + transformedTo[1]) / 2
  ];
  const text = geometry.text || layer.value?.value?.toString?.() || '';
  return [
    coordinatesPath([transformedFrom, transformedTo]),
    text ? {
      kind: 'text',
      x: mid[0],
      y: mid[1],
      text,
      fill: 'layer',
      fontSize: 12
    } : null
  ].filter(Boolean);
}

function textGeometryPaths(layer = {}, item = {}) {
  const geometry = layer.geometry || {};
  if (geometry.type !== 'text') return [];
  const point = normalizePoint(geometry.point || geometry.position || geometry.origin);
  if (!point) return [];
  const transformed = transformPoint(point, item);
  const text = geometry.text || layer.value?.value?.toString?.() || '';
  if (!text) return [];
  return [{
    kind: 'text',
    x: transformed[0],
    y: transformed[1],
    text,
    fill: 'layer',
    fontSize: Number(geometry.fontSize) || 12,
    textAnchor: geometry.textAnchor || 'start',
    dominantBaseline: geometry.dominantBaseline || 'hanging',
    markKind: layer.markKind || geometry.markKind || null
  }];
}

function placedSourceLayerPaths(layer = {}, item = {}) {
  const coordinates = normalizePoints(layer.coordinates || []);
  if (coordinates.length >= 2) {
    return [coordinatesPath(
      transformItemPoints(coordinates, item),
      layerPathShouldClose(layer)
    )].filter(Boolean);
  }
  return [
    ...dimensionGeometryPaths(layer, item),
    ...textGeometryPaths(layer, item)
  ];
}

function nestingSourceForItem(sourcePointsById, item = {}) {
  return sourcePointsById.get(itemSourceId(item)?.toString()) || {
    points: itemPoints(item),
    sourceLayers: item.sourceLayers || []
  };
}

// The sheet design's typed parts relation (SPEC §6 edge `parts`): one
// cassette-design ref per distinct design. `designPins` (construct path)
// supplies the resolved revision pins; the editor path stores unpinned
// refs, which follow latest.
export function sheetDesignParts(result = {}, designPins = new Map()) {
  return designsForNestingResult(result).map(({ designId }) =>
    designPins.get(designId) || { type: 'cassette-design', id: designId });
}

export function designsForNestingResult(result = {}) {
  const itemsById = new Map((result.items || [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const layouts = result.solution?.layouts || result.layouts || [];
  const counts = new Map();

  layouts.forEach(layout => {
    const placedItems = layout.placed_items || layout.items || [];
    placedItems.forEach(placedItem => {
      const source = itemsById.get(itemSourceId(placedItem)?.toString()) || placedItem;
      const designId = source.design_id || source.designId || placedItem.design_id;
      if (!designId) return;
      const key = designId.toString();
      const current = counts.get(key) || { designId: key, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => String(left.designId).localeCompare(String(right.designId)));
}

export function nestingResultToPreview(result = {}, params = {}, options = {}) {
  const allLayouts = result.solution?.layouts || result.layouts || [];
  const layouts = Number.isInteger(options.layoutIndex)
    ? allLayouts.slice(options.layoutIndex, options.layoutIndex + 1)
    : allLayouts;
  const width = Number(params.width || params.virtualWidth || 1220);
  const height = Number(params.height || params.virtualLength || 2440);
  const gap = Math.max(width, height) * 0.08;
  const sheetPaths = [];
  const fallbackFacePaths = [];
  const placedLayers = [];
  const sourcePointsById = itemSourcePointsById(result);

  layouts.forEach((layout, index) => {
    const offsetY = Number.isInteger(options.layoutIndex) ? 0 : index * (height + gap);
    sheetPaths.push(`M 0 ${offsetY} H ${width} V ${offsetY + height} H 0 Z`);
    const items = layout.placed_items || layout.items || [];
    items.forEach(item => {
      const source = nestingSourceForItem(sourcePointsById, item);
      const sourceLayers = source.sourceLayers || [];
      if (sourceLayers.length) {
        sourceLayers.forEach(layer => {
          const code = layerCode(layer);
          placedSourceLayerPaths(layer, item).forEach(path => {
            if (typeof path === 'string') {
              const shifted = offsetY
                ? path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${x} ${Number(y) + offsetY}`)
                : path;
              pushLayerPath(placedLayers, code, shifted);
              return;
            }
            pushLayerPath(placedLayers, code, offsetY ? { ...path, y: path.y + offsetY } : path);
          });
        });
        return;
      }

      const points = transformItemPoints(source.points, item).map(([x, y]) => [x, y + offsetY]);
      const d = closePath(points);
      if (d) fallbackFacePaths.push(d);
    });
  });

  if (!sheetPaths.length) {
    sheetPaths.push(`M 0 0 H ${width} V ${height} H 0 Z`);
  }

  return {
    viewBox: `0 0 ${width} ${sheetPaths.length * height + Math.max(sheetPaths.length - 1, 0) * gap}`,
    layers: [
      {
        name: displayLayerName('contour.material_sheet'),
        standardCode: 'contour.material_sheet',
        ...layerStyle('contour.material_sheet'),
        paths: sheetPaths
      },
      ...placedLayers,
      {
        name: displayLayerName('contour.cassette_face'),
        standardCode: 'contour.cassette_face',
        ...layerStyle('contour.cassette_face'),
        paths: fallbackFacePaths
      }
    ].filter(layer => layer.paths.length)
  };
}

// The manual layout update's recompute: the design's stored geometry
// (fields.geometry, the §3 wire) merged with the editor's placed items →
// the next geometry record, the typed parts relation, and a preview.
// Pure — the caller persists both through the generic instance patch.
export function recomputeSheetLayout(design = {}, { items = [], placedItems = [] } = {}) {
  const geometry = design.fields?.geometry || {};
  const existingResult = geometry.data || {};
  const existingSolution = existingResult.solution || {};
  const result = {
    ...existingResult,
    items,
    solution: {
      ...existingSolution,
      layouts: [{
        ...(existingSolution.layouts?.[0] || {}),
        placed_items: placedItems
      }]
    }
  };
  const params = { ...(existingResult.solveParams || {}) };
  return {
    geometry: {
      ...geometry,
      data: result,
      preview: nestingResultToPreview(result, params, { layoutIndex: 0 })
    },
    relations: { parts: sheetDesignParts(result) }
  };
}
