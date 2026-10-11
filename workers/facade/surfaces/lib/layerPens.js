// Layer-pen styling for drawing previews (the pen half of the app's
// drawingPreview contract, single-homed here for the plugin's editor
// surfaces — the app keeps its copy for the read-side preview family
// until that migrates too). Pure functions over standards/pens records.
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
        dasharray: strokeDasharray(stroke.pattern) || layer.dasharray || 'none'
      };
    })
  };
};
