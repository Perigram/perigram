import DxfParser from 'dxf-parser';

/**
 * Build a layer-to-pen map for use with generateSvgData.
 * Uses org override pen if available, falls back to default pen.
 * @param {Object} mapping - { layerName: standardCode }
 * @param {Array} standards - from layerStandardsStore.standards (with orgPenId merged)
 * @param {Array} pens - from penTemplatesStore.pens
 * @returns {Object} { layerName: penObject }
 */
export function buildLayerPenMap(mapping = {}, standards = [], pens = []) {
    const result = {};
    const codeForStandard = (standard) => standard?.data?.code || standard?.code || null;
    const standardPenId = (standard) => (
        standard?.data?.orgPenId ||
        standard?.orgPenId ||
        standard?.data?.defaultPenId ||
        standard?.defaultPenId ||
        null
    );
    for (const [layerName, targetCode] of Object.entries(mapping)) {
        if (!targetCode) continue;
        const standard = standards.find(s => codeForStandard(s) === targetCode);
        if (!standard) continue;
        const penId = standardPenId(standard);
        if (!penId) continue;
        const pen = pens.find(p => p._id?.toString() === penId.toString());
        if (pen) result[layerName] = pen;
    }
    return result;
}

/**
 * Parse DXF file and extract layer names
 * @param {File} file - DXF file object
 * @returns {Promise<string[]>} - Array of unique layer names
 */
export async function extractDxfLayers(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const dxfText = e.target.result;
        const parser = new DxfParser();
        const dxf = parser.parseSync(dxfText);
        
        if (!dxf || !dxf.entities) {
          reject(new Error('Invalid DXF file'));
          return;
        }
        
        // Extract unique layer names from entities
        const layerSet = new Set();
        dxf.entities.forEach(entity => {
          if (entity.layer) {
            console.log('[extractDxfLayers] Found entity on layer:', entity.layer);
            layerSet.add(entity.layer);
          }
        });
        
        // Convert Set to sorted array
        const layers = Array.from(layerSet).sort();
        console.log('[extractDxfLayers] Detected layers:', layers);
        resolve(layers);
      } catch (error) {
        reject(new Error(`Failed to parse DXF: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Generate detailed SVG data from DXF file
 * @param {File|string} source - DXF file object or DXF text
 * @param {Object} layerMapping - Optional layer to pen mapping { layerName: penTemplate }
 * @param {Object} defaultPen - Default pen for unmapped layers
 * @returns {Promise<Object>} - Object with viewbox, and layers with paths
 */
export async function generateSvgData(source, layerMapping = {}, defaultPen = null) {
  const getDxfText = async () => {
    if (typeof source === 'string') return source;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(source);
    });
  };

  try {
    const dxfText = await getDxfText();
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);
    
    if (!dxf || !dxf.entities) {
      throw new Error('Invalid DXF file');
    }
    
    const defaultPenSettings = defaultPen || {
      stroke: { color: 'currentColor', weight: 0.5, pattern: 'SOLID' }
    };
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    dxf.entities.forEach(entity => {
      const checkPoint = (p) => {
        if (p && p.x !== undefined && p.y !== undefined) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      };
      
      if (entity.vertices) entity.vertices.forEach(checkPoint);
      if (entity.startPoint) checkPoint(entity.startPoint);
      if (entity.endPoint) checkPoint(entity.endPoint);
      if (entity.center && entity.radius) {
        minX = Math.min(minX, entity.center.x - entity.radius);
        minY = Math.min(minY, entity.center.y - entity.radius);
        maxX = Math.max(maxX, entity.center.x + entity.radius);
        maxY = Math.max(maxY, entity.center.y + entity.radius);
      }
    });
    
    if (!isFinite(minX) || !isFinite(maxX)) {
      return null;
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    const layers = {};
    
    const getStrokeDasharray = (pattern) => {
      if (pattern === 'DASHED') return '5,5';
      if (pattern === 'DOTTED') return '1,3';
      return 'none';
    };

    const penStroke = (pen) => pen?.data?.stroke || pen?.stroke || {};
    
    dxf.entities.forEach(entity => {
      if (!layers[entity.layer]) {
        const pen = layerMapping[entity.layer] || defaultPenSettings;
        const stroke = penStroke(pen);
        layers[entity.layer] = {
          name: entity.layer,
          color: stroke.color || 'currentColor',
          weight: stroke.weight || 0.5,
          dasharray: getStrokeDasharray(stroke.pattern || 'SOLID'),
          paths: []
        };
      }
      
      const layer = layers[entity.layer];
      
      if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) {
        layer.paths.push(`<line x1="${entity.startPoint.x}" y1="${-entity.startPoint.y}" x2="${entity.endPoint.x}" y2="${-entity.endPoint.y}" />`);
      } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices) {
        const points = entity.vertices.map(v => `${v.x},${-v.y}`).join(' ');
        layer.paths.push(`<polyline points="${points}" fill="none" />`);
      } else if (entity.type === 'CIRCLE' && entity.center && entity.radius) {
        layer.paths.push(`<circle cx="${entity.center.x}" cy="${-entity.center.y}" r="${entity.radius}" fill="none" />`);
      } else if (entity.type === 'ARC' && entity.center && entity.radius) {
        const startAngle = entity.startAngle * Math.PI / 180;
        const endAngle = entity.endAngle * Math.PI / 180;
        const x1 = entity.center.x + entity.radius * Math.cos(startAngle);
        const y1 = entity.center.y + entity.radius * Math.sin(startAngle);
        const x2 = entity.center.x + entity.radius * Math.cos(endAngle);
        const y2 = entity.center.y + entity.radius * Math.sin(endAngle);
        const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
        const sweep = endAngle > startAngle ? 0 : 1; // DXF angles are CCW
        layer.paths.push(`<path d="M ${x1} ${-y1} A ${entity.radius} ${entity.radius} 0 ${largeArc} ${sweep} ${x2} ${-y2}" fill="none" />`);
      }
    });
    
    return {
      viewBox: `${minX} ${-maxY} ${width} ${height}`,
      layers: Object.values(layers)
    };
  } catch (e) {
    console.error('generateSvgData error:', e);
    return null;
  }
}

/**
 * Robust wrapper for generateSvgData from text (backward compatibility)
 */
export async function generateSvgDataFromText(dxfText, layerMapping = {}, defaultPen = null) {
  return await generateSvgData(dxfText, layerMapping, defaultPen);
}

/**
 * Generate SVG preview from DXF file (legacy support)
 */
export async function generateSvgPreview(file, layerMapping = {}, defaultPen = null) {
  const data = await generateSvgData(file, layerMapping, defaultPen);
  const paths = data.layers.map(l => {
    const strokeAttrs = `stroke="${l.color}" stroke-width="${l.weight * 10}" stroke-dasharray="${l.dasharray}"`;
    return `<g ${strokeAttrs}>${l.paths.join('')}</g>`;
  }).join('');
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${data.viewBox}" width="100%" height="100%">
    <rect width="100%" height="100%" fill="white"/>
    ${paths}
  </svg>`;
}

/**
 * Extract all polygons (closed paths) from DXF
 * @param {File} file - DXF file object
 * @returns {Promise<Array<Array<[number, number]>>>} - Array of polygons
 */
export async function extractPolygons(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dxfText = e.target.result;
        const parser = new DxfParser();
        const dxf = parser.parseSync(dxfText);
        
        if (!dxf || !dxf.entities) {
          reject(new Error('Invalid DXF file'));
          return;
        }
        
        const polygons = [];
        dxf.entities.forEach(entity => {
          if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices) {
            const coords = entity.vertices
              .filter(v => v && v.x !== undefined && v.y !== undefined)
              .map(v => [v.x, v.y]);
            if (coords.length >= 3) {
              polygons.push(coords);
            }
          }
        });
        resolve(polygons);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Validate DXF file structure
 * @param {File} file - DXF file object
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateDxfFile(file) {
  try {
    const layers = await extractDxfLayers(file);
    
    if (layers.length === 0) {
      return { valid: false, error: 'No layers found in DXF file' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
