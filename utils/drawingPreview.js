export const DEFAULT_DRAWING_PEN = {
  stroke: { color: 'currentColor', weight: 0.5, pattern: 'SOLID' }
};

export const strokeDasharray = (pattern = 'SOLID') => {
  if (pattern === 'DASHED') return '5,5';
  if (pattern === 'DOTTED') return '1,3';
  return 'none';
};

const sameId = (left, right) => left?.toString?.() === right?.toString?.();
const standardCode = (standard) => standard?.fields?.code || null;
const standardPenId = (standard) => (
  standard?.fields?.orgPenId ||
  standard?.fields?.defaultPenId ||
  null
);

export const resolveStandardPen = (standard, pens = [], fallbackPen = DEFAULT_DRAWING_PEN) => {
  if (!standard) return fallbackPen;
  const penId = standardPenId(standard);
  return pens.find(pen => sameId(pen._id, penId)) || fallbackPen;
};

export const resolveLayerStandard = ({
  layerName,
  standardCode: sourceStandardCode,
  layerMapping = {},
  standards = []
} = {}) => {
  const mappedCode = layerMapping[layerName];
  const targetCode = mappedCode || sourceStandardCode;
  const mappedStandard = targetCode
    ? standards.find(standard => standardCode(standard) === targetCode)
    : null;
  if (mappedStandard) return mappedStandard;

  return standards.find(standard => standardCode(standard) === layerName) || null;
};

export const resolveLayerPen = (options = {}) => {
  const standard = resolveLayerStandard(options);
  if (standard) return resolveStandardPen(standard, options.pens, options.defaultPen);
  return options.defaultPen || DEFAULT_DRAWING_PEN;
};

const penStroke = (pen) => pen?.fields?.stroke || {};

export const applyLayerPens = (drawing, options = {}) => {
  if (!drawing?.layers) return drawing;
  return {
    ...drawing,
    layers: drawing.layers.map(layer => {
      const standard = resolveLayerStandard({ layerName: layer.name, standardCode: layer.standardCode, ...options });
      const pen = standard ? resolveStandardPen(standard, options.pens, null) : null;
      const fallbackStroke = penStroke(options.defaultPen || DEFAULT_DRAWING_PEN);
      const stroke = penStroke(pen);
      return {
        ...layer,
        standardCode: standardCode(standard) || layer.standardCode || null,
        standardId: standard?._id || null,
        penId: pen?._id || null,
        color: stroke.color || layer.color || fallbackStroke.color || 'currentColor',
        weight: stroke.weight || layer.weight || fallbackStroke.weight || 0.5,
        dasharray: stroke.pattern ? strokeDasharray(stroke.pattern) : (layer.dasharray || 'none')
      };
    })
  };
};

const normalizeLayerDescriptor = (descriptor, fallbackName = 'geometry') => {
  if (!descriptor) return { name: fallbackName };
  if (typeof descriptor === 'string') {
    return { name: descriptor, standardCode: descriptor };
  }

  const standardCode = descriptor.standardCode || descriptor.code || null;
  return {
    ...descriptor,
    name: descriptor.name || descriptor.layerName || standardCode || fallbackName,
    standardCode,
    role: descriptor.role || fallbackName
  };
};

const mergeLayerPaths = (layers, descriptor, paths) => {
  if (!paths.length) return;
  const key = descriptor.name || descriptor.standardCode || descriptor.role || 'geometry';
  const existing = layers.find(layer => (layer.name || layer.standardCode || layer.role) === key);
  if (existing) {
    existing.paths.push(...paths);
    return;
  }
  layers.push({ ...descriptor, paths: [...paths] });
};

const validPoint = (point) => (
  Array.isArray(point) &&
  point.length >= 2 &&
  Number.isFinite(Number(point[0])) &&
  Number.isFinite(Number(point[1]))
);

const normalizePolygonPoints = (points = []) => {
  const normalized = (Array.isArray(points) ? points : [])
    .filter(validPoint)
    .map(point => [Number(point[0]), Number(point[1])]);
  if (normalized.length >= 3) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.001 || Math.abs(first[1] - last[1]) > 0.001) {
      normalized.push([...first]);
    }
  }
  return normalized;
};

const polygonPath = (points = []) => {
  const normalized = normalizePolygonPoints(points);
  if (normalized.length < 3) return null;
  return normalized.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ') + ' Z';
};

const polylinePath = (points = [], close = false) => {
  const normalized = (Array.isArray(points) ? points : [])
    .filter(validPoint)
    .map(point => [Number(point[0]), Number(point[1])]);
  if (normalized.length < 2) return null;
  const d = normalized.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ');
  return close && normalized.length >= 3 ? `${d} Z` : d;
};

const polygonBounds = (rings = []) => {
  const points = rings.flat().filter(validPoint);
  const xs = points.map(point => Number(point[0]));
  const ys = points.map(point => Number(point[1]));
  if (!xs.length || !ys.length) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
};

const normalizePolygonDrawing = (polygon, options = {}) => {
  const outer = normalizePolygonPoints(polygon?.outer || []);
  const inner = (polygon?.inner || []).map(normalizePolygonPoints).filter(points => points.length >= 3);
  if (outer.length < 3) return null;

  const bounds = polygonBounds([outer, ...inner]);
  const d = [polygonPath(outer), ...inner.map(polygonPath)].filter(Boolean).join(' ');
  const padding = Math.max(bounds.width, bounds.height) * 0.04;
  return applyLayerPens({
    viewBox: `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`,
    layers: [{
      name: 'geometry',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: [{
        d,
        fill: inner.length ? 'layer' : 'none',
        stroke: 'layer',
        opacity: inner.length ? 0.16 : null,
        fillRule: inner.length ? 'evenodd' : null
      }]
    }]
  }, options);
};

const layerDataCoordinates = (entry = {}) => (
  Array.isArray(entry.coordinates) ? entry.coordinates : []
);

const layerDataPoint = (point = []) => (
  validPoint(point) ? [Number(point[0]), Number(point[1])] : null
);

const dimensionPoint = (point = []) => layerDataPoint(point);

const dimensionVector = (geometry = {}) => {
  const from = dimensionPoint(geometry.from);
  const to = dimensionPoint(geometry.to);
  if (!from || !to) return null;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return null;
  return {
    from,
    to,
    dx,
    dy,
    length,
    unit: [dx / length, dy / length],
    normal: [-dy / length, dx / length]
  };
};

const dimensionOffsetNumber = (geometry = {}, fallback = 0) => {
  const numeric = Number(geometry.offset);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const dimensionTextGap = (geometry = {}) => {
  const numeric = Number(geometry.textGap);
  return Number.isFinite(numeric) ? numeric : 11;
};

const dimensionTextScreenGap = (geometry = {}) => {
  const numeric = Number(geometry.textOffset);
  return Number.isFinite(numeric) ? numeric : 0;
};

const dimensionPath = (geometry = {}) => {
  const vector = dimensionVector(geometry);
  if (!vector) return null;
  const { from, to, normal } = vector;
  const offset = dimensionOffsetNumber(geometry);
  const dimFrom = [from[0] + normal[0] * offset, from[1] + normal[1] * offset];
  const dimTo = [to[0] + normal[0] * offset, to[1] + normal[1] * offset];
  return {
    d: [
      polylinePath([from, dimFrom]),
      polylinePath([to, dimTo]),
      polylinePath([dimFrom, dimTo])
    ].filter(Boolean).join(' '),
    stroke: 'layer',
    fill: 'none'
  };
};

const dimensionTextPath = (geometry = {}) => {
  const vector = dimensionVector(geometry);
  if (!vector || !geometry.text) return null;
  const { from, to, normal } = vector;
  const offset = dimensionOffsetNumber(geometry);
  const textGap = dimensionTextGap(geometry);
  const textOffset = dimensionTextScreenGap(geometry);
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  const x = midX + normal[0] * (offset + textGap) + textOffset;
  const y = midY + normal[1] * (offset + textGap);
  return {
    kind: 'text',
    x,
    y,
    text: String(geometry.text),
    fill: 'layer',
    fontSize: geometry.fontSize || 12,
    textAnchor: geometry.textAnchor || 'middle',
    dominantBaseline: geometry.dominantBaseline || 'middle'
  };
};

const dimensionTextPoint = (geometry = {}) => {
  const text = dimensionTextPath(geometry);
  if (!text) return null;
  return [text.x, text.y];
};

const layerDataEntryPaths = (entry = {}) => {
  const geometry = entry.geometry || {};
  if (geometry.type === 'text') {
    const point = layerDataPoint(geometry.point);
    if (!point) return [];
    return [{
      kind: 'text',
      x: point[0],
      y: point[1],
      text: String(geometry.text || ''),
      fill: 'layer',
      fontSize: geometry.fontSize || 12,
      textAnchor: geometry.textAnchor || 'middle',
      dominantBaseline: geometry.dominantBaseline || 'middle'
    }];
  }

  if (geometry.type === 'dimension') {
    return [dimensionPath(geometry), dimensionTextPath(geometry)].filter(Boolean);
  }

  const coordinates = layerDataCoordinates(entry);
  const isClosedLayer = ['cut.outer', 'contour.cassette_face'].includes(entry.layer || entry.name || entry.standardCode);
  const d = polylinePath(coordinates, isClosedLayer);
  if (!d) return [];
  return [{
    d,
    stroke: 'layer',
    fill: 'none'
  }];
};

const normalizeLayerDataDrawing = (source, options = {}) => {
  const data = source?.data || source || {};
  const geometryData = data.geometry?.data || {};
  // The declared preview channel may hand the baked parts straight
  // through as the geometry value (a type's previewSource fallbackPaths
  // resolve layer/polygon parts off the wire DTO): an array there IS the
  // layerData list; an object may carry either parts list beside the
  // geometry block.
  const geometryLayerData = Array.isArray(data.geometry)
    ? data.geometry
    : (Array.isArray(data.geometry?.layerData) ? data.geometry.layerData : []);
  const geometryPolygonParts = Array.isArray(data.geometry?.polygonParts)
    ? data.geometry.polygonParts
    : [];
  const layerData = Array.isArray(data.layerData)
    ? data.layerData
    : (geometryLayerData.length ? geometryLayerData : (Array.isArray(geometryData.layerData) ? geometryData.layerData : []));
  const polygonParts = Array.isArray(data.polygonParts)
    ? data.polygonParts
    : (geometryPolygonParts.length ? geometryPolygonParts : (Array.isArray(geometryData.polygonParts) ? geometryData.polygonParts : []));
  const layers = [];
  const boundsPoints = [];

  for (const entry of layerData) {
    const layerName = entry.layer || entry.name || entry.standardCode || 'geometry';
    const descriptor = normalizeLayerDescriptor({
      name: layerName,
      standardCode: entry.standardCode || entry.code || layerName,
      role: entry.role || null,
      color: entry.color || 'currentColor',
      weight: entry.weight || 1,
      dasharray: entry.dasharray || 'none'
    }, layerName);
    const paths = layerDataEntryPaths(entry);
    mergeLayerPaths(layers, descriptor, paths);
    boundsPoints.push(...layerDataCoordinates(entry));
    if (entry.geometry?.point) boundsPoints.push(entry.geometry.point);
    if (entry.geometry?.from) boundsPoints.push(entry.geometry.from);
    if (entry.geometry?.to) boundsPoints.push(entry.geometry.to);
    const textPoint = entry.geometry?.type === 'dimension' ? dimensionTextPoint(entry.geometry) : null;
    if (textPoint) boundsPoints.push(textPoint);
  }

  if (!layers.length && polygonParts.length) {
    const descriptor = normalizeLayerDescriptor({
      name: 'cut.outer',
      standardCode: 'cut.outer',
      color: 'currentColor',
      weight: 1
    }, 'cut.outer');
    const paths = polygonParts
      .map(part => polylinePath(part.coordinates, true))
      .filter(Boolean)
      .map(d => ({ d, stroke: 'layer', fill: 'none' }));
    mergeLayerPaths(layers, descriptor, paths);
    boundsPoints.push(...polygonParts.flatMap(part => part.coordinates || []));
  }

  if (!layers.length) return null;

  const bounds = polygonBounds([boundsPoints]);
  const padding = Math.max(bounds?.width || 1, bounds?.height || 1) * 0.04;
  return applyLayerPens({
    viewBox: `${(bounds?.minX || 0) - padding} ${(bounds?.minY || 0) - padding} ${(bounds?.width || 1) + padding * 2} ${(bounds?.height || 1) + padding * 2}`,
    layers
  }, options);
};

export const normalizeGeometryDrawing = (source, options = {}) => {
  const geometry = source?.data?.geometry || source?.geometry || source || {};
  const preview = geometry.preview || geometry.data || geometry;
  const layers = Array.isArray(preview.layers) ? preview.layers : [];
  const points = Array.isArray(preview.points) ? preview.points : geometry.points;
  const polygon = preview.polygon || geometry.polygon || null;
  const bakedDrawing = normalizeLayerDataDrawing(source, options);
  const preferLayerData = Boolean(source?.__perigramPreferLayerData);

  if (preferLayerData && bakedDrawing) {
    return bakedDrawing;
  }

  if (layers.length > 0) {
    return applyLayerPens({
      viewBox: preview.viewBox || '0 0 100 60',
      vertices: preview.vertices || [],
      designerFaces: preview.designerFaces || [],
      designerProfiles: preview.designerProfiles || [],
      designerFoldEdges: preview.designerFoldEdges || [],
      designerSections: preview.designerSections || { handles: [], segments: [] },
      designerEdges: preview.designerEdges || [],
      designerAttachmentMarkers: preview.designerAttachmentMarkers || [],
      dimensionAnnotations: preview.dimensionAnnotations || [],
      foldedPreview: preview.foldedPreview || { faces: [], folds: [] },
      layers: layers.map(layer => ({
        name: layer.name || 'geometry',
        standardCode: layer.standardCode || layer.code || null,
        role: layer.role || null,
        color: layer.color || 'currentColor',
        weight: layer.weight || 1,
        dasharray: layer.dasharray || 'none',
        paths: Array.isArray(layer.paths) ? layer.paths : []
      }))
    }, options);
  }

  if (bakedDrawing) {
    return bakedDrawing;
  }

  if (Array.isArray(points) && points.length > 0) {
    const xs = points.map(point => Number(point[0])).filter(Number.isFinite);
    const ys = points.map(point => Number(point[1])).filter(Number.isFinite);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const padding = Math.max(width, height) * 0.08;
    const d = `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ')} Z`;
    return {
      viewBox: `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`,
      layers: [{
        name: 'geometry',
        color: 'currentColor',
        weight: 2,
        dasharray: 'none',
        paths: [d]
      }]
    };
  }

  if (polygon) {
    return normalizePolygonDrawing(polygon, options);
  }

  return null;
};
