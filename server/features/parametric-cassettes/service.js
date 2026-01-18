/**
 * Parametric Cassettes Service
 * Handles geometry generation and baking of parametric templates into DXF files.
 */

import * as repository from './repository.js';
import { connectDB } from '../../db/mongo.js';
import { GridFSBucket, ObjectId } from 'mongodb';
import { buildNodiGraph } from '../../utils/cassetteGraphBuilder.js';
import init, { Modular } from 'nodi-modular';
import fs from 'fs/promises';
import path from 'path';

let modularInstance = null;
let baseTemplateGraph = null;

/**
 * Initialize the Nodi engine on the server
 */
async function getEngine() {
  if (modularInstance) return modularInstance;

  try {
    // Load WASM from node_modules
    const wasmPath = path.resolve(process.cwd(), 'node_modules/nodi-modular/index_bg.wasm');
    const wasmBuffer = await fs.readFile(wasmPath);
    await init(wasmBuffer);
    
    modularInstance = Modular.new();
    
    // Load the default graph structure
    const graphPath = path.resolve(process.cwd(), 'public/Cassette.json');
    const graphContent = await fs.readFile(graphPath, 'utf-8');
    baseTemplateGraph = JSON.parse(graphContent);
    
    return modularInstance;
  } catch (err) {
    console.error('Failed to initialize parametric engine:', err);
    throw err;
  }
}

/**
 * Robust AC1015 DXF Generator for polygons
 */
export function generateSimpleDxf(polygons, nestingLayer = '1_3_UNFOLD_BOUNDARY', internalLayer = '1_1_FACE') {
  let lines = [];

  const add = (code, value) => {
    lines.push(code.toString());
    lines.push(value.toString());
  };

  // Header
  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1015');
  add(9, '$HANDSEED');
  add(5, 'FFFF');
  add(0, 'ENDSEC');

  // Tables
  add(0, 'SECTION');
  add(2, 'TABLES');
  
  // LTYPE
  add(0, 'TABLE');
  add(2, 'LTYPE');
  add(5, '5');
  add(100, 'AcDbSymbolTable');
  add(70, 1);
  add(0, 'LTYPE');
  add(5, '10');
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbLinetypeTableRecord');
  add(2, 'Continuous');
  add(70, 0);
  add(3, 'Solid line');
  add(72, 65);
  add(73, 0);
  add(40, 0.0);
  add(0, 'ENDTAB');

  // LAYER
  add(0, 'TABLE');
  add(2, 'LAYER');
  add(5, '2');
  add(100, 'AcDbSymbolTable');
  add(70, 2);
  
  add(0, 'LAYER');
  add(5, '11');
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbLayerTableRecord');
  add(2, nestingLayer);
  add(70, 0);
  add(62, 7);
  add(6, 'Continuous');
  
  add(0, 'LAYER');
  add(5, '12');
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbLayerTableRecord');
  add(2, internalLayer);
  add(70, 0);
  add(62, 1); // Red
  add(6, 'Continuous');
  
  add(0, 'ENDTAB');

  // STYLE
  add(0, 'TABLE');
  add(2, 'STYLE');
  add(5, '3');
  add(100, 'AcDbSymbolTable');
  add(70, 0);
  add(0, 'ENDTAB');

  // VIEW
  add(0, 'TABLE');
  add(2, 'VIEW');
  add(5, '4');
  add(100, 'AcDbSymbolTable');
  add(70, 0);
  add(0, 'ENDTAB');

  // BLOCK_RECORD
  add(0, 'TABLE');
  add(2, 'BLOCK_RECORD');
  add(5, '1');
  add(100, 'AcDbSymbolTable');
  add(70, 2);
  add(0, 'BLOCK_RECORD');
  add(5, '1F');
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbBlockTableRecord');
  add(2, '*Model_Space');
  add(0, 'BLOCK_RECORD');
  add(5, '20');
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbBlockTableRecord');
  add(2, '*Paper_Space');
  add(0, 'ENDTAB');

  add(0, 'ENDSEC');

  // Blocks
  add(0, 'SECTION');
  add(2, 'BLOCKS');
  
  add(0, 'BLOCK');
  add(5, '21');
  add(100, 'AcDbEntity');
  add(8, '0');
  add(100, 'AcDbBlockBegin');
  add(2, '*Model_Space');
  add(70, 0);
  add(10, 0.0);
  add(20, 0.0);
  add(30, 0.0);
  add(3, '*Model_Space');
  add(1, '');
  add(0, 'ENDBLK');
  add(5, '22');
  add(100, 'AcDbEntity');
  add(8, '0');
  add(100, 'AcDbBlockEnd');

  add(0, 'BLOCK');
  add(5, '23');
  add(100, 'AcDbEntity');
  add(8, '0');
  add(100, 'AcDbBlockBegin');
  add(2, '*Paper_Space');
  add(70, 0);
  add(10, 0.0);
  add(20, 0.0);
  add(30, 0.0);
  add(3, '*Paper_Space');
  add(1, '');
  add(0, 'ENDBLK');
  add(5, '24');
  add(100, 'AcDbEntity');
  add(8, '0');
  add(100, 'AcDbBlockEnd');

  add(0, 'ENDSEC');

  // Entities
  add(0, 'SECTION');
  add(2, 'ENTITIES');

  let handleCount = 256;

  polygons.forEach((polygon, idx) => {
    const coords = polygon.coordinates || polygon;
    if (!coords || coords.length < 3) return;

    const layer = idx === 0 ? nestingLayer : internalLayer;
    const handle = (handleCount++).toString(16).toUpperCase();
    
    add(0, 'LWPOLYLINE');
    add(5, handle);
    add(100, 'AcDbEntity');
    add(8, layer);
    add(100, 'AcDbPolyline');
    add(90, coords.length);
    add(70, 1); // Closed
    
    for (const [x, y] of coords) {
      add(10, x);
      add(20, y);
    }
  });

  add(0, 'ENDSEC');

  // Objects
  add(0, 'SECTION');
  add(2, 'OBJECTS');
  add(0, 'DICTIONARY');
  add(5, 'C');
  add(100, 'AcDbDictionary');
  add(280, 0);
  add(281, 1);
  add(3, 'ACAD_GROUP');
  add(350, 'D');
  add(0, 'DICTIONARY');
  add(5, 'D');
  add(100, 'AcDbDictionary');
  add(280, 0);
  add(281, 1);
  add(0, 'ENDSEC');

  add(0, 'EOF');

  return lines.join('\n');
}

function calculateArea(vertices) {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i][0] * vertices[j][1];
    area -= vertices[j][0] * vertices[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Evaluate a parametric cassette and return its boundary coordinates
 */
export async function evaluateTemplate(cassetteId, dimensions) {
  const template = await repository.findTemplateById(cassetteId);
  if (!template) throw new Error('Template not found');

  const engine = await getEngine();
  
  // Merge entry dimensions with template data
  const cassetteData = {
    params: { ...(template.data?.params || {}), ...dimensions },
    extrusions: template.data?.extrusions || []
  };

  // Build the graph for this specific set of parameters
  const { graph } = buildNodiGraph(cassetteData, baseTemplateGraph);
  engine.loadGraph(JSON.stringify(graph));

  try {
    const result = await engine.evaluate();
    const { geometryIdentifiers } = result;

    const allCurves = [];
    geometryIdentifiers.forEach((id) => {
      const interop = engine.findGeometryInteropById(id);
      if (interop?.variant === 'Curve' && interop.data.vertices?.length > 0) {
        allCurves.push({
          vertices: interop.data.vertices, 
          id,
          area: calculateArea(interop.data.vertices)
        });
      }
    });

    if (allCurves.length === 0) {
      throw new Error('Geometry evaluation produced no curves');
    }

    // Sort by area descending so largest is first (assumed boundary)
    allCurves.sort((a, b) => b.area - a.area);

    const polygons = allCurves.map(c => ({ coordinates: c.vertices }));

    return {
      polygons,
      dimensions: cassetteData.params
    };
  } catch (e) {
    console.error('Nodi evaluation failed:', e);
    throw new Error(`Geometry evaluation failed: ${e.message}`);
  }
}

/**
 * Generate and store a DXF for a parametric cassette entry
 */
export async function bakeTemplateInstance(cassetteId, dimensions, userId) {
  const existing = await repository.findExistingBakedInstance(cassetteId, dimensions);
  if (existing) return existing;

  const { polygons, dimensions: evalDims } = await evaluateTemplate(cassetteId, dimensions);
  
  // Default layers from standards
  const nestingLayer = '1_3_UNFOLD_BOUNDARY';
  const internalLayer = '1_1_FACE';
  
  const dxfContent = generateSimpleDxf(polygons, nestingLayer, internalLayer);
  
  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  const filename = `baked-${cassetteId}-${Date.now()}.dxf`;
  
  const fileId = await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { userId, type: 'BAKED_PARAMETRIC' }
    });
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);
    uploadStream.write(dxfContent);
    uploadStream.end();
  });

  const template = await repository.findTemplateById(cassetteId);
  
  // ONLY use the largest polygon for nesting to avoid duplicate items
  const nestingPolygons = [polygons[0]];
  
  // Store all polygons with their target layers in layerData for artifacts generation
  const layerData = polygons.map((p, idx) => ({
    layer: idx === 0 ? nestingLayer : internalLayer,
    coordinates: p.coordinates,
    handles: [(256 + idx).toString(16).toUpperCase()]
  }));

  const bakedData = {
    name: `${template.name} (${evalDims.A}x${evalDims.B})`,
    slug: `baked-${template.slug}-${Date.now()}`,
    userId: userId,
    type: 'BAKED_PARAMETRIC',
    dxfId: fileId,
    polygonParts: nestingPolygons.map((p, i) => ({
      coordinates: p.coordinates,
      handles: [(256 + i).toString(16).toUpperCase()]
    })),
    layerData: layerData, // Added layerData for better procedural placement
    metadata: {
      originalCassetteId: new ObjectId(cassetteId),
      dimensions: evalDims
    }
  };

  return await repository.createBakedInstance(bakedData);
}