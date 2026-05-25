export const DEFAULT_DRAWING_PEN = {
  stroke: { color: 'currentColor', weight: 0.5, pattern: 'SOLID' }
};

export const strokeDasharray = (pattern = 'SOLID') => {
  if (pattern === 'DASHED') return '5,5';
  if (pattern === 'DOTTED') return '1,3';
  return 'none';
};

const sameId = (left, right) => left?.toString?.() === right?.toString?.();
const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const standardPenId = (standard) => (
  standard?.data?.orgPenId ||
  standard?.orgPenId ||
  standard?.data?.defaultPenId ||
  standard?.defaultPenId ||
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

export const applyLayerPens = (drawing, options = {}) => {
  if (!drawing?.layers) return drawing;
  return {
    ...drawing,
    layers: drawing.layers.map(layer => {
      const standard = resolveLayerStandard({ layerName: layer.name, standardCode: layer.standardCode, ...options });
      const pen = standard ? resolveStandardPen(standard, options.pens, options.defaultPen) : (options.defaultPen || DEFAULT_DRAWING_PEN);
      return {
        ...layer,
        standardCode: standardCode(standard) || layer.standardCode || null,
        standardId: standard?._id || null,
        penId: pen?._id || null,
        color: pen.stroke?.color || layer.color || 'currentColor',
        weight: pen.stroke?.weight || layer.weight || 0.5,
        dasharray: strokeDasharray(pen.stroke?.pattern) || layer.dasharray || 'none'
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

export const normalizeGeometryDrawing = (source, options = {}) => {
  const geometry = source?.data?.geometry || source?.geometry || source || {};
  const preview = geometry.preview || geometry.data || geometry;
  const layers = Array.isArray(preview.layers) ? preview.layers : [];
  const points = Array.isArray(preview.points) ? preview.points : geometry.points;

  if (layers.length > 0) {
    return applyLayerPens({
      viewBox: preview.viewBox || '0 0 100 60',
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

  return null;
};

export const extractDesignerEdges = (vertices = [], params = {}) => {
  return vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const x1 = vertex[0];
    const y1 = -vertex[1];
    const x2 = next[0];
    const y2 = -next[1];
    const length = Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
    let label = `${length}`;
    let minDiff = 2;

    Object.entries(params).forEach(([key, value]) => {
      const diff = Math.abs(Number(value) - length);
      if (diff < minDiff) {
        minDiff = diff;
        label = `${key}: ${length}`;
      }
    });

    return {
      x1,
      y1,
      x2,
      y2,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      length,
      label
    };
  });
};

export const normalizeCassetteDrawing = (result, params = {}) => {
  if (!result) return null;
  const options = params.params || params.layers ? params : { params };
  const layerDescriptors = options.layers || {};
  const edgeParams = options.params || {};

  const extrusionPaths = (result.allCurves || [])
    .map((curve, index) => ({ curve, index }))
    .filter(({ curve }) => curve.isExtrusion)
    .map(({ curve, index }) => ({
      d: curve.path,
      fill: 'layer',
      stroke: 'none',
      opacity: 0.06,
      highlightedOpacity: 0.22,
      extrusionIndex: index
    }));

  const boundaryPaths = result.path ? [{
    d: result.path,
    fill: 'none',
    stroke: 'layer'
  }] : [];

  const layers = [];
  mergeLayerPaths(layers, normalizeLayerDescriptor(layerDescriptors.face), extrusionPaths);
  mergeLayerPaths(layers, normalizeLayerDescriptor(layerDescriptors.boundary), boundaryPaths);

  return {
    viewBox: result.viewBox || '0 0 100 100',
    layers,
    vertices: result.vertices || [],
    designerEdges: extractDesignerEdges(result.vertices || [], edgeParams)
  };
};
