export const DEFAULT_DRAWING_PEN = {
  stroke: { color: 'currentColor', weight: 0.5, pattern: 'SOLID' }
};

export const strokeDasharray = (pattern = 'SOLID') => {
  if (pattern === 'DASHED') return '5,5';
  if (pattern === 'DOTTED') return '1,3';
  return 'none';
};

const sameId = (left, right) => left?.toString?.() === right?.toString?.();

export const resolveStandardPen = (standard, pens = [], fallbackPen = DEFAULT_DRAWING_PEN) => {
  if (!standard) return fallbackPen;
  const penId = standard.orgPenId || standard.defaultPenId;
  return pens.find(pen => sameId(pen._id, penId)) || fallbackPen;
};

export const resolveLayerPen = ({
  layerName,
  layerMapping = {},
  standards = [],
  pens = [],
  defaultPen = DEFAULT_DRAWING_PEN
} = {}) => {
  const mappedCode = layerMapping[layerName];
  const mappedStandard = mappedCode
    ? standards.find(standard => standard.code === mappedCode)
    : null;
  if (mappedStandard) return resolveStandardPen(mappedStandard, pens, defaultPen);

  const namedStandard = standards.find(standard => standard.code === layerName);
  if (namedStandard) return resolveStandardPen(namedStandard, pens, defaultPen);

  return defaultPen;
};

export const applyLayerPens = (drawing, options = {}) => {
  if (!drawing?.layers) return drawing;
  return {
    ...drawing,
    layers: drawing.layers.map(layer => {
      const pen = resolveLayerPen({ layerName: layer.name, ...options });
      return {
        ...layer,
        color: pen.stroke?.color || layer.color || 'currentColor',
        weight: pen.stroke?.weight || layer.weight || 0.5,
        dasharray: strokeDasharray(pen.stroke?.pattern) || layer.dasharray || 'none'
      };
    })
  };
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
  return {
    viewBox: result.viewBox || '0 0 100 100',
    layers: [],
    path: result.path || '',
    vertices: result.vertices || [],
    allCurves: result.allCurves || [],
    designerEdges: extractDesignerEdges(result.vertices || [], params)
  };
};
