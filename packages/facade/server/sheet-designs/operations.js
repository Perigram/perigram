// Sheet-design pack operations (SPEC §13): the type rides the generic
// instance service — this module owns only the domain operations the pack
// adds: the manual layout update (recomputes geometry, preview, and
// summary from placed items) and the layered-DXF export. Persistence,
// access gating, transitions, and revisions go through the generic
// machinery (instanceServiceResolver('sheet-design')).
import { createError } from 'h3';
import crypto from 'node:crypto';
import { instanceServiceResolver } from '#services/features/instances/service.js';
import { hasInstanceAccess } from '#services/core/access/service.js';
import { generateLayeredDxf } from '#utils/dxf-writer.js';
import * as filesService from '#services/features/files/service.js';

const LAYER_STYLES = {
  'contour.material_sheet': { color: '#64748b', weight: 1, dasharray: '8,5' },
  'cut.outer': { color: '#dc2626', weight: 1 },
  'contour.cassette_face': { color: '#2563eb', weight: 2 },
  'fold.route': { color: '#d97706', weight: 1, dasharray: '6,4' },
  'code.cassette_mark': { color: '#059669', weight: 1 },
  'dimension.cassette': { color: '#7c3aed', weight: 0.7, dasharray: '1,3' }
};

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

function layerStyle(code) {
  return LAYER_STYLES[code] || { color: 'currentColor', weight: 1 };
}

function layerPathShouldClose(layer = {}) {
  const code = layerCode(layer);
  return code.startsWith('cut.') || code.startsWith('contour.');
}

function pushLayerPath(layers, code, path) {
  if (!path) return;
  let layer = layers.find(item => item.name === code);
  if (!layer) {
    layer = {
      name: code,
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

export function cassettesForNestingResult(result = {}) {
  const itemsById = new Map((result.items || [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const layouts = result.solution?.layouts || result.layouts || [];
  const counts = new Map();

  layouts.forEach(layout => {
    const placedItems = layout.placed_items || layout.items || [];
    placedItems.forEach(placedItem => {
      const source = itemsById.get(itemSourceId(placedItem)?.toString()) || placedItem;
      const cassetteId = source.cassette_id || source.cassetteId || placedItem.cassette_id;
      if (!cassetteId) return;
      const key = cassetteId.toString();
      const current = counts.get(key) || { cassetteId: key, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => String(left.cassetteId).localeCompare(String(right.cassetteId)));
}

export function cassetteCompositionForLayout(result = {}, layout = {}) {
  const itemsById = new Map((result.items || [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const counts = new Map();
  for (const placedItem of layout.placed_items || layout.items || []) {
    const source = itemsById.get(itemSourceId(placedItem)?.toString()) || placedItem;
    const cassetteDesignId = source.cassette_id || source.cassetteId || placedItem.cassette_id;
    if (!cassetteDesignId) continue;
    const id = cassetteDesignId.toString();
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([cassetteId, count]) => ({ cassetteId, count }))
    .sort((left, right) => String(left.cassetteId).localeCompare(String(right.cassetteId)));
}

export function compositionHash(composition = []) {
  const value = composition.map(item => [String(item.cassetteId), Number(item.count || 0)]);
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function collapseNestingLayoutsByComposition(result = {}) {
  const layouts = result.solution?.layouts || result.layouts || [];
  const groups = new Map();
  layouts.forEach((layout, layoutIndex) => {
    const composition = cassetteCompositionForLayout(result, layout);
    const hash = compositionHash(composition);
    const group = groups.get(hash);
    if (group) {
      group.sheetCount += 1;
      group.layoutIndexes.push(layoutIndex);
      return;
    }
    groups.set(hash, {
      compositionHash: hash,
      composition,
      sheetCount: 1,
      representativeLayoutIndex: layoutIndex,
      layoutIndexes: [layoutIndex]
    });
  });
  return [...groups.values()];
}

export function nestingResultForLayout(result = {}, layoutIndex = 0) {
  const layouts = result.solution?.layouts || result.layouts || [];
  const layout = layouts[layoutIndex];
  const solution = {
    ...(result.solution || {}),
    layouts: layout ? [layout] : []
  };
  if (layout?.density !== undefined) {
    solution.density = layout.density;
  }
  return {
    ...result,
    solution,
    layoutIndex
  };
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
        name: 'contour.material_sheet',
        standardCode: 'contour.material_sheet',
        ...layerStyle('contour.material_sheet'),
        paths: sheetPaths
      },
      ...placedLayers,
      {
        name: 'contour.cassette_face',
        standardCode: 'contour.cassette_face',
        ...layerStyle('contour.cassette_face'),
        paths: fallbackFacePaths
      }
    ].filter(layer => layer.paths.length)
  };
}

function requireReadable(design, auth) {
  if (auth?.memberships &&
      !hasInstanceAccess({ entity: design, typeId: 'sheet-design', feature: 'files', level: 'read', auth })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

// The manual layout update: recomputes the design's geometry record,
// preview, and summary from the editor's placed items, then writes through
// the generic instance patch (which owns access gating and revisions).
export async function updateLayout(id, { items = [], placedItems = [] } = {}, auth = {}) {
  if (!Array.isArray(items) || !Array.isArray(placedItems)) {
    throw createError({ statusCode: 400, message: 'Sheet layout items and placements must be arrays' });
  }
  const service = instanceServiceResolver('sheet-design');
  const design = await service.getById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Sheet design not found' });
  requireReadable(design, auth);

  const existingResult = design.data?.geometry?.data || {};
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
  const params = {
    ...(design.data?.solveParams || {}),
    width: design.specs?.width,
    height: design.specs?.length
  };
  const cassetteDesigns = cassettesForNestingResult(result);
  const cassettePlacementCount = cassetteDesigns.reduce((sum, item) => sum + Number(item.count || 0), 0);
  return await service.patch(id, {
    data: {
      ...(design.data || {}),
      cassetteDesigns,
      geometry: {
        ...(design.data?.geometry || {}),
        data: result,
        preview: nestingResultToPreview(result, params, { layoutIndex: 0 })
      },
      summary: {
        ...(design.summary || {}),
        placedCount: placedItems.length,
        partsCount: placedItems.length,
        cassetteDesignCount: cassetteDesigns.length,
        cassettePlacementCount
      }
    }
  }, { auth, organizationId: auth.organizationId || null });
}

function generateDxfForDesign(design) {
  const dxf = generateLayeredDxf({
    layers: design.data?.geometry?.preview?.layers || [],
    layerData: design.data?.geometry?.data?.layerData || [],
    polygonParts: design.data?.geometry?.data?.polygonParts || []
  });
  if (!dxf) throw createError({ statusCode: 404, message: 'Sheet design has no exportable geometry' });
  return dxf;
}

export async function generateDxf(id, auth = {}) {
  const service = instanceServiceResolver('sheet-design');
  const design = await service.getById(id);
  if (!design) throw createError({ statusCode: 404, message: 'Sheet design not found' });
  requireReadable(design, auth);
  return generateDxfForDesign(design);
}

export async function generateAndStoreDxf(id, auth = {}) {
  const file = await generateDxf(id, auth);
  const service = instanceServiceResolver('sheet-design');
  const design = await service.getById(id);
  const uploaded = await filesService.uploadFile(
    Buffer.from(file, 'utf8'),
    `${design.identity?.slug || design._id || id}.dxf`,
    {
      userId: auth.userId,
      organizationId: auth.organizationId,
      sheetDesignId: id,
      type: 'LAYOUT_DXF'
    },
    'nestDxf'
  );
  return { fileId: uploaded.id, dxf: file, design };
}
