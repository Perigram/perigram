import DxfParser from 'dxf-parser';

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
 * Generate SVG preview from DXF file
 * @param {File} file - DXF file object
 * @param {Object} layerMapping - Optional layer to pen mapping { layerName: penTemplate }
 * @param {Object} defaultPen - Default pen for unmapped layers
 * @returns {Promise<string>} - SVG string
 */
export async function generateSvgPreview(file, layerMapping = {}, defaultPen = null) {
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
        
        // Default pen settings
        const defaultPenSettings = defaultPen || {
          stroke: { color: '#000000', weight: 0.5, pattern: 'SOLID' }
        };
        
        // Calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        dxf.entities.forEach(entity => {
          if (entity.vertices) {
            entity.vertices.forEach(v => {
              if (v && v.x !== undefined && v.y !== undefined) {
                minX = Math.min(minX, v.x);
                minY = Math.min(minY, v.y);
                maxX = Math.max(maxX, v.x);
                maxY = Math.max(maxY, v.y);
              }
            });
          }
          if (entity.startPoint && entity.startPoint.x !== undefined) {
            minX = Math.min(minX, entity.startPoint.x);
            minY = Math.min(minY, entity.startPoint.y);
            maxX = Math.max(maxX, entity.startPoint.x);
            maxY = Math.max(maxY, entity.startPoint.y);
          }
          if (entity.endPoint && entity.endPoint.x !== undefined) {
            minX = Math.min(minX, entity.endPoint.x);
            minY = Math.min(minY, entity.endPoint.y);
            maxX = Math.max(maxX, entity.endPoint.x);
            maxY = Math.max(maxY, entity.endPoint.y);
          }
          if (entity.center && entity.center.x !== undefined && entity.radius) {
            minX = Math.min(minX, entity.center.x - entity.radius);
            minY = Math.min(minY, entity.center.y - entity.radius);
            maxX = Math.max(maxX, entity.center.x + entity.radius);
            maxY = Math.max(maxY, entity.center.y + entity.radius);
          }
        });
        
        // Check if we got valid bounds
        if (!isFinite(minX) || !isFinite(maxX)) {
          reject(new Error('Could not determine DXF bounds'));
          return;
        }
        
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = Math.max(width, height) * 0.1;
        
        // Helper to get pen for layer
        const getPenForLayer = (layerName) => {
          const pen = layerMapping[layerName];
          return pen || defaultPenSettings;
        };
        
        // Helper to convert pen pattern to SVG stroke-dasharray
        const getStrokeDasharray = (pattern) => {
          if (pattern === 'DASHED') return '55';
          if (pattern === 'DOTTED') return '13';
          return 'none';
        };
        
        // Generate SVG paths grouped by layer
        let paths = '';
        console.log('[dxfParser] Generating SVG with layerMapping keys:', Object.keys(layerMapping));
        console.log('[dxfParser] layerMapping full:', layerMapping);
        console.log('[dxfParser] Default pen:', defaultPenSettings);
        
        // Sample first entity layer for debugging
        if (dxf.entities.length > 0) {
          console.log('[dxfParser] First entity layer name:', JSON.stringify(dxf.entities[0].layer));
          console.log('[dxfParser] First mapping key:', JSON.stringify(Object.keys(layerMapping)[0]));
        }
        
        dxf.entities.forEach(entity => {
          try {
            const pen = getPenForLayer(entity.layer);
            const color = pen.stroke?.color || '#000000';
            const weight = pen.stroke?.weight * 10 || 0.5;
            const dasharray = getStrokeDasharray(pen.stroke?.pattern || 'SOLID');
            const strokeAttrs = `stroke="${color}" stroke-width="${weight}" stroke-dasharray="${dasharray}"`;
            
            // Log mapped layers specifically
            if (layerMapping[entity.layer]) {
              console.log(`[dxfParser] MAPPED layer "${entity.layer}": pen=`, pen, `color=${color}, weight=${weight}`);
            }
            
            if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) {
              paths += `<line x1="${entity.startPoint.x}" y1="${-entity.startPoint.y}" x2="${entity.endPoint.x}" y2="${-entity.endPoint.y}" ${strokeAttrs} />`;
            } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices) {
              const points = entity.vertices
                .filter(v => v && v.x !== undefined && v.y !== undefined)
                .map(v => `${v.x},${-v.y}`)
                .join(' ');
              if (points) {
                paths += `<polyline points="${points}" ${strokeAttrs} fill="none" />`;
              }
            } else if (entity.type === 'CIRCLE' && entity.center && entity.radius) {
              paths += `<circle cx="${entity.center.x}" cy="${-entity.center.y}" r="${entity.radius}" ${strokeAttrs} fill="none" />`;
            } else if (entity.type === 'ARC' && entity.center && entity.radius && entity.startAngle !== undefined && entity.endAngle !== undefined) {
              // Simplified arc rendering
              const startAngle = entity.startAngle * Math.PI / 180;
              const endAngle = entity.endAngle * Math.PI / 180;
              const x1 = entity.center.x + entity.radius * Math.cos(startAngle);
              const y1 = entity.center.y + entity.radius * Math.sin(startAngle);
              const x2 = entity.center.x + entity.radius * Math.cos(endAngle);
              const y2 = entity.center.y + entity.radius * Math.sin(endAngle);
              const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
              paths += `<path d="M ${x1} ${-y1} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${x2} ${-y2}" ${strokeAttrs} fill="none" />`;
            }
          } catch (err) {
            // Skip entities that fail to render
            console.warn('Failed to render entity:', entity.type, err);
          }
        });
        
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${-(maxY + padding)} ${width + 2 * padding} ${height + 2 * padding}" width="100%" height="100%">
          <rect width="100%" height="100%" fill="white"/>
          ${paths}
        </svg>`;
        
        resolve(svg);
      } catch (error) {
        reject(new Error(`Failed to generate SVG: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
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
