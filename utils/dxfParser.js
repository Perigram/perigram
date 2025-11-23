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
            layerSet.add(entity.layer);
          }
        });
        
        // Convert Set to sorted array
        const layers = Array.from(layerSet).sort();
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
 * @returns {Promise<string>} - SVG string
 */
export async function generateSvgPreview(file) {
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
        
        // Calculate bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        dxf.entities.forEach(entity => {
          if (entity.vertices) {
            entity.vertices.forEach(v => {
              minX = Math.min(minX, v.x);
              minY = Math.min(minY, v.y);
              maxX = Math.max(maxX, v.x);
              maxY = Math.max(maxY, v.y);
            });
          }
          if (entity.startPoint) {
            minX = Math.min(minX, entity.startPoint.x);
            minY = Math.min(minY, entity.startPoint.y);
            maxX = Math.max(maxX, entity.startPoint.x);
            maxY = Math.max(maxY, entity.startPoint.y);
          }
          if (entity.endPoint) {
            minX = Math.min(minX, entity.endPoint.x);
            minY = Math.min(minY, entity.endPoint.y);
            maxX = Math.max(maxX, entity.endPoint.x);
            maxY = Math.max(maxY, entity.endPoint.y);
          }
          if (entity.center && entity.radius) {
            minX = Math.min(minX, entity.center.x - entity.radius);
            minY = Math.min(minY, entity.center.y - entity.radius);
            maxX = Math.max(maxX, entity.center.x + entity.radius);
            maxY = Math.max(maxY, entity.center.y + entity.radius);
          }
        });
        
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = Math.max(width, height) * 0.1;
        
        // Generate SVG paths
        let paths = '';
        dxf.entities.forEach(entity => {
          if (entity.type === 'LINE') {
            paths += `<line x1="${entity.startPoint.x}" y1="${-entity.startPoint.y}" x2="${entity.endPoint.x}" y2="${-entity.endPoint.y}" stroke="black" stroke-width="0.5" />`;
          } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const points = entity.vertices.map(v => `${v.x},${-v.y}`).join(' ');
            paths += `<polyline points="${points}" stroke="black" stroke-width="0.5" fill="none" />`;
          } else if (entity.type === 'CIRCLE') {
            paths += `<circle cx="${entity.center.x}" cy="${-entity.center.y}" r="${entity.radius}" stroke="black" stroke-width="0.5" fill="none" />`;
          } else if (entity.type === 'ARC') {
            // Simplified arc rendering
            const startAngle = entity.startAngle * Math.PI / 180;
            const endAngle = entity.endAngle * Math.PI / 180;
            const x1 = entity.center.x + entity.radius * Math.cos(startAngle);
            const y1 = entity.center.y + entity.radius * Math.sin(startAngle);
            const x2 = entity.center.x + entity.radius * Math.cos(endAngle);
            const y2 = entity.center.y + entity.radius * Math.sin(endAngle);
            const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
            paths += `<path d="M ${x1} ${-y1} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${x2} ${-y2}" stroke="black" stroke-width="0.5" fill="none" />`;
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
