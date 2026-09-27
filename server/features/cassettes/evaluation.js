/**
 * Cassette template evaluation: resolves a PARAMETRIC cassette's OCCS
 * construction definition into geometry (see the feature README's
 * evaluation contract) and renders simple polygon DXF output for export.
 */

import { createError } from 'h3';
import { findById } from './repository.js';
import { isOccsDocument } from '#utils/occs/parameters.js';

let evaluationChain = Promise.resolve();

const OCCS_CASSETTE_FACE_LAYER = 'contour.cassette_face';
const OCCS_FLAT_PATTERN_LAYER = 'contour.flat_pattern.face_and_returns';

function resolveTemplateDefinition(template = {}) {
  const candidates = [
    template.data?.definition,
    template.data?.definition?.definition,
    template.data?.definition?.occs,
    template.definition?.data,
    template.definition
  ].filter(candidate => candidate && typeof candidate === 'object');

  return candidates.find(isOccsDocument) ||
    candidates.find(candidate => (
      candidate.params ||
      candidate.extrusions ||
      candidate.extensions ||
      (candidate.parameters && !Array.isArray(candidate.parameters))
    )) ||
    {};
}

async function runWithEvaluationLock(task) {
  const run = evaluationChain.then(() => task());
  evaluationChain = run.catch(() => {});
  return run;
}

/**
 * Robust AC1015 DXF Generator for polygons
 */
export function generateSimpleDxf(polygons, nestingLayer = OCCS_FLAT_PATTERN_LAYER, internalLayer = OCCS_CASSETTE_FACE_LAYER) {
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

/**
 * Evaluate a parametric cassette and return its boundary coordinates
 */
export async function evaluateTemplate(cassetteId, dimensions) {
  return runWithEvaluationLock(async () => {
    const template = await findById(cassetteId);
    if (!template) throw new Error('Template not found');

    const definitionData = resolveTemplateDefinition(template);
    if (isOccsDocument(definitionData)) {
      const { evaluateOccsCassetteTemplate } = await import('#utils/occs/evaluate.js');
      return await evaluateOccsCassetteTemplate(definitionData, dimensions, {
        templateId: template._id?.toString?.() || cassetteId?.toString?.() || cassetteId,
        templateName: template.identity?.name || template.name || 'Cassette template'
      });
    }

    // Legacy parametric (WASM) definitions are gone: the OCCS graph tree is
    // the one construction contract, evaluated in pure JS. A template that
    // carries neither is legacy data and must be recreated as an OCCS
    // design.
    throw createError({
      statusCode: 422,
      message: 'Cassette template has no OCCS construction definition — legacy parametric templates are no longer supported; recreate the template as an OCCS design'
    });
  });
}
