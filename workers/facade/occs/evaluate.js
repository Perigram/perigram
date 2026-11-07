import {
  buildCassetteV2CassetteMarkLayerData,
  buildCassetteV2TreeCurves,
  cassetteV2BooleanOperationsForEntities,
  faceSketchCutEntitiesForTree,
  profileCutEntitiesForTree,
  profileEdgeEmbeddingsForTree,
  resultInnerCutEntities
} from '../surfaces/lib/cassetteV2Renderer.js';
import { buildOccsEvaluatedDimensionEntities } from './dimensions.js';
import { buildOccsProductionLayout } from './production-layout.js';
import { foldCassetteV2Region } from '../surfaces/lib/cassetteV2Clipper.js';
import { embedOccsProfilesIntoContour } from './profileEmbedding.js';
import { OCCS_LAYER_CONTOUR_CASSETTE_FACE, OCCS_LAYER_CUT_INNER, OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from './layers.js';

const clonePlain = (value) => JSON.parse(JSON.stringify(value || {}));

const definitionIdForWorkpiece = (workpiece = {}) => workpiece.definitionId || `${workpiece.id}_def`;

const occurrenceIdForWorkpiece = (workpiece = {}) => workpiece.occurrenceId || workpiece.id;

const getSheetWorkpieces = (definition = {}, tree = {}) => {
  const workpieces = Array.isArray(tree.workpieces) ? tree.workpieces : [];
  const sheetDefinitionIds = new Set((definition.definitions?.workpieces || [])
    .filter(workpiece => !workpiece.type || workpiece.type === 'sheet')
    .map(workpiece => workpiece.id));

  const sheetWorkpieces = workpieces.filter(workpiece => (
    !sheetDefinitionIds.size || sheetDefinitionIds.has(definitionIdForWorkpiece(workpiece))
  ));

  return sheetWorkpieces.length ? sheetWorkpieces : workpieces.slice(0, 1);
};

export const evaluateOccsCassetteTemplate = async (definition = {}, parameters = {}, context = {}) => {
  const graphTree = definition?.extensions?.perigram?.graphTree;
  if (!graphTree) throw new Error('OCCS cassette template does not contain a Perigram graph tree');

  const tree = clonePlain(graphTree);
  tree.parameters = {
    ...(tree.parameters || {}),
    ...(parameters || {})
  };

  const sheetWorkpieces = getSheetWorkpieces(definition, tree);
  const polygons = [];
  const cutLayerData = [];
  const profileCutLayerData = [];
  const foldLayerData = [];
  const markLayerData = [];
  const contourLayerData = [];
  const curves = [];

  for (const workpiece of sheetWorkpieces) {
    const workpieceCurves = await buildCassetteV2TreeCurves(tree, {
      mode: 'workpiece',
      workpieceId: workpiece.id
    });
    curves.push(...workpieceCurves);
    markLayerData.push(...buildCassetteV2CassetteMarkLayerData(workpieceCurves, tree, context)
      .filter(mark => mark.workpieceId === workpiece.id));

    // Open profiles replace their bound host edge with the composite
    // chain (array placement, anchors on the edge — the owner law of
    // 2026-10-15). The production contour truly embeds: cut/nesting
    // geometry follows the stitched boundary, and the contour layer
    // carries it for redraw. Overlapping or overflowing placements are
    // forbidden — the evaluation refuses instead of clamping.
    const faceCurves = new Map(workpieceCurves.map(curve => [curve.node.id, curve]));
    const embeddings = profileEdgeEmbeddingsForTree(workpieceCurves, tree)
      .filter(item => faceCurves.has(item.targetFaceId));
    const embeddingErrors = embeddings.filter(item => !item.embedding.ok);
    if (embeddingErrors.length) {
      const details = embeddingErrors
        .map(item => `${item.profileWorkpieceId}: ${item.embedding.reason}`)
        .join('; ');
      throw new Error(`Open profile placement is invalid (${details})`);
    }
    const appliedEmbeddings = [];
    const embeddedCurves = workpieceCurves.map((curve) => {
      const faceEmbeddings = embeddings
        .filter(item => item.targetFaceId === curve.node.id)
        .map(item => item.embedding);
      if (!faceEmbeddings.length) return curve;
      const source = curve.originalBoundaryVertices
        || curve.referenceVertices
        || curve.boundaryVertices
        || curve.vertices;
      const { contour, errors, applied } = embedOccsProfilesIntoContour(source, faceEmbeddings);
      if (errors.length) {
        throw new Error(`Open profile placement is invalid (${errors.join('; ')})`);
      }
      appliedEmbeddings.push(...applied);
      return {
        ...curve,
        boundaryVertices: contour,
        ...(curve.originalBoundaryVertices ? { originalBoundaryVertices: contour } : {}),
        ...(curve.referenceVertices ? { referenceVertices: contour } : {})
      };
    });
    for (const item of appliedEmbeddings) {
      contourLayerData.push({
        layer: OCCS_LAYER_CONTOUR_CASSETTE_FACE,
        coordinates: item.composite.map(vertex => [vertex[0], vertex[1]]),
        handles: [`${item.relationId}:EDGE`],
        workpieceId: workpiece.id,
        workpieceDefinitionId: definitionIdForWorkpiece(workpiece),
        occurrenceId: occurrenceIdForWorkpiece(workpiece),
        profileWorkpieceId: item.profileWorkpieceId,
        relationId: item.relationId
      });
    }

    // Closed profiles and sketch-face subtracts carry boolean
    // operations on the host face (owner law 2026-10-19): adds unite
    // into the face, subtracts cut from it — the same grouped fold the
    // designer applies.
    const cutEntities = [
      ...(await profileCutEntitiesForTree(workpieceCurves, tree, { strict: true })),
      ...faceSketchCutEntitiesForTree(workpieceCurves)
    ].filter(entity => faceCurves.has(entity.target));
    const cutEmbeddedCurves = [];
    for (const curve of embeddedCurves) {
      const operations = cassetteV2BooleanOperationsForEntities(
        cutEntities.filter(entity => entity.target === curve.node.id)
      );
      if (!operations.length) {
        cutEmbeddedCurves.push(curve);
        continue;
      }
      const baseBoundary = curve.boundaryVertices || curve.vertices;
      // The face is the largest ring of the fold (rings sort by area).
      const region = await foldCassetteV2Region(
        { polygons: [baseBoundary], holes: curve.holes || [] },
        operations
      );
      const outer = region.polygons[0];
      if (!outer?.length) {
        cutEmbeddedCurves.push(curve);
        continue;
      }
      cutEmbeddedCurves.push({
        ...curve,
        boundaryVertices: outer,
        vertices: outer,
        holes: region.holes
      });
    }

    // Inner cut paths ride the fold's result rings: the operands are
    // the recipe, the folded holes are the product.
    for (const entity of resultInnerCutEntities(cutEmbeddedCurves, cutEntities)) {
      profileCutLayerData.push({
        layer: entity.layer,
        coordinates: entity.geometry.vertices.map(vertex => [vertex[0], vertex[1]]),
        handles: [entity.id],
        workpieceId: workpiece.id,
        workpieceDefinitionId: definitionIdForWorkpiece(workpiece),
        occurrenceId: occurrenceIdForWorkpiece(workpiece),
        profileWorkpieceId: entity.profileWorkpieceId,
        relationId: entity.relationId
      });
    }

    const layout = await buildOccsProductionLayout(
      cutEmbeddedCurves
        .filter(curve => (curve.boundaryVertices || curve.vertices || []).length >= 3)
        .map(curve => ({
          id: curve.node?.id,
          vertices: curve.boundaryVertices || curve.vertices
        }))
    );
    const workpieceMeta = {
      workpieceId: workpiece.id,
      workpieceDefinitionId: definitionIdForWorkpiece(workpiece),
      occurrenceId: occurrenceIdForWorkpiece(workpiece)
    };

    layout.cutOuterPaths.forEach((coordinates, index) => {
      const handles = [`${workpiece.id}:C${index + 1}`];
      const polygon = {
        coordinates,
        handles,
        ...workpieceMeta
      };
      polygons.push(polygon);
      cutLayerData.push({
        layer: OCCS_LAYER_CUT_OUTER,
        coordinates,
        handles,
        ...workpieceMeta
      });
    });

    layout.foldPaths.forEach((coordinates, index) => {
      foldLayerData.push({
        layer: OCCS_LAYER_FOLD_ROUTE,
        coordinates,
        handles: [`${workpiece.id}:F${index + 1}`],
        ...workpieceMeta
      });
    });
  }

  const dimensionEntities = buildOccsEvaluatedDimensionEntities(curves);
  const dimensionLayerData = dimensionEntities.map(entity => ({
    id: entity.id,
    layer: entity.layer,
    target: entity.target,
    geometry: entity.geometry,
    value: entity.value,
    handles: [entity.id]
  }));

  return {
    polygons,
    nestingPolygons: polygons,
    layerData: [...cutLayerData, ...profileCutLayerData, ...foldLayerData, ...markLayerData, ...contourLayerData, ...dimensionLayerData],
    dimensions: tree.parameters,
    dimensionEntities,
    annotations: {
      dimensions: dimensionEntities
    }
  };
};
