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
 * Extract polygons from DXF using layer mapping
 * @param {Buffer} dxfBuffer - DXF file buffer
 * @param {Object} layerMapping - Mapping of layer names to standard types
 * @param {string} nestingLayer - Which standard layer type to use for nesting (e.g., 'frame', 'cut')
 * @returns {Array} Array of polygon parts for the nesting layer
 */
export function extractNestingPolygons(dxfBuffer, layerMapping, nestingLayer = 'frame') {
  // Find which DXF layer is mapped to the nesting layer standard
  const dxfLayerName = Object.keys(layerMapping).find(
    layerName => layerMapping[layerName] === nestingLayer
  );
  
  if (!dxfLayerName) {
    console.warn(`No layer mapped to "${nestingLayer}" for nesting`);
    return [];
  }
  
  console.log(`Extracting polygons from layer "${dxfLayerName}" (mapped as ${nestingLayer})`);
  return extractPolygonsFromDXF(dxfBuffer, dxfLayerName);
}
