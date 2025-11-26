/**
 * DXF Polygon Extraction Utility
 * Extracts polygon coordinates from DXF files for nesting
 */

import DxfParser from 'dxf-parser';

/**
 * Extract polygons from a DXF buffer for a specific layer
 * @param {Buffer} dxfBuffer - DXF file buffer
 * @param {string} layerName - Layer to extract polygons from
 * @returns {Array} Array of polygon parts with coordinates
 */
export function extractPolygonsFromDXF(dxfBuffer, layerName) {
  try {
    const parser = new DxfParser();
    const dxfString = dxfBuffer.toString('utf-8');
    const dxf = parser.parseSync(dxfString);
    
    if (!dxf || !dxf.entities) {
      console.error('Failed to parse DXF or no entities found');
      return [];
    }
    
    const polygonParts = [];
    
    // Filter entities by layer
    const layerEntities = dxf.entities.filter(entity => 
      entity.layer === layerName
    );
    
    console.log(`Found ${layerEntities.length} entities in layer "${layerName}"`);
    
    for (const entity of layerEntities) {
      let coordinates = null;
      
      // Handle different entity types
      if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        // Polyline - already a list of vertices
        coordinates = entity.vertices.map(v => [v.x, v.y]);
        
        // Close the polygon if not already closed
        if (coordinates.length > 0) {
          const first = coordinates[0];
          const last = coordinates[coordinates.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coordinates.push([first[0], first[1]]);
          }
        }
      } 
      else if (entity.type === 'LINE') {
        // Line - convert to 2-point polygon
        coordinates = [
          [entity.vertices[0].x, entity.vertices[0].y],
          [entity.vertices[1].x, entity.vertices[1].y]
        ];
      }
      else if (entity.type === 'CIRCLE') {
        // Circle - approximate with polygon (16 segments)
        const segments = 16;
        coordinates = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          const x = entity.center.x + entity.radius * Math.cos(angle);
          const y = entity.center.y + entity.radius * Math.sin(angle);
          coordinates.push([x, y]);
        }
      }
      else if (entity.type === 'ARC') {
        // Arc - approximate with line segments
        const segments = 16;
        const startAngle = entity.startAngle * Math.PI / 180;
        const endAngle = entity.endAngle * Math.PI / 180;
        coordinates = [];
        for (let i = 0; i <= segments; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / segments);
          const x = entity.center.x + entity.radius * Math.cos(angle);
          const y = entity.center.y + entity.radius * Math.sin(angle);
          coordinates.push([x, y]);
        }
      }
      else if (entity.type === 'SPLINE') {
        // Spline - use control points as approximation
        coordinates = entity.controlPoints.map(p => [p.x, p.y]);
      }
      
      if (coordinates && coordinates.length >= 3) {
        polygonParts.push({
          coordinates,
          handles: entity.handle ? [entity.handle] : []
        });
      }
    }
    
    console.log(`Extracted ${polygonParts.length} polygon parts from layer "${layerName}"`);
    return polygonParts;
    
  } catch (error) {
    console.error('Error extracting polygons from DXF:', error);
    return [];
  }
}

/**
 * Extract polygons from DXF for nesting
 * 
 * NESTING WORKFLOW:
 * 1. Upload cassette with layerMapping: { "UNFOLD_LAYER": "1_3_UNFOLD_BOUNDARY", ... }
 * 2. System finds which DXF layer is mapped to "1_3_UNFOLD_BOUNDARY"
 * 3. Extract ALL entities from that layer as polygon parts (coords + handles)
 * 4. Store polygonParts in cassette document
 * 5. When nesting: Worker uses ONLY these polygonParts (nesting layer only!)
 * 
 * @param {Buffer} dxfBuffer - DXF file buffer
 * @param {Object} layerMapping - Mapping: { [dxfLayerName]: layerStandardCode }
 *                                Example: { "UNFOLD": "1_3_UNFOLD_BOUNDARY", "CUT": "2_1_CUT" }
 * @param {string} nestingLayerCode - Layer code for nesting (default: "1_3_UNFOLD_BOUNDARY")
 * @returns {Array} Array of { coordinates: [[x,y], ...], handles: [handle, ...] }
 */
export function extractNestingPolygons(dxfBuffer, layerMapping, nestingLayerCode) {
  if (!layerMapping || typeof layerMapping !== 'object') {
    console.warn('No layer mapping provided');
    return [];
  }
  
  // Find which DXF layer is mapped to the nesting layer code
  const dxfLayerName = Object.keys(layerMapping).find(
    layerName => layerMapping[layerName] === nestingLayerCode
  );
  
  if (!dxfLayerName) {
    console.warn(`No DXF layer mapped to "${nestingLayerCode}" for nesting`);
    console.log('Available mappings:', layerMapping);
    return [];
  }
  
  console.log(`Extracting nesting polygons from DXF layer "${dxfLayerName}" → ${nestingLayerCode}`);
  return extractPolygonsFromDXF(dxfBuffer, dxfLayerName);
}
