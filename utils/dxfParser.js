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
