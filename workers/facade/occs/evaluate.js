import {
  buildCassetteV2CassetteMarkLayerData,
  buildCassetteV2TrapezoidTreeCurves,
  profileCutEntitiesForTree,
  profileEdgeEmbeddingsForTree
} from '../surfaces/lib/cassetteV2Renderer.js';
import { buildOccsEvaluatedDimensionEntities } from './dimensions.js';
import { buildOccsProductionLayout } from './production-layout.js';
import { differenceCassetteV2FacePolygon, unionCassetteV2FacePolygons } from '../surfaces/lib/cassetteV2Clipper.js';
import { embedOccsProfilesIntoContour } from './profileEmbedding.js';
import { OCCS_LAYER_CONTOUR_CASSETTE_FACE, OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from './layers.js';

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
    const workpieceCurves = buildCassetteV2TrapezoidTreeCurves(tree, {
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
    const embeddedCurves = workpieceCurves.map((curve) => {
      const faceEmbeddings = embeddings
        .filter(item => item.targetFaceId === curve.node.id)
        .map(item => item.embedding);
      if (!faceEmbeddings.length) return curve;
      const source = curve.originalBoundaryVertices
        || curve.referenceVertices
        || curve.boundaryVertices
        || curve.vertices;
      const { contour, errors } = embedOccsProfilesIntoContour(source, faceEmbeddings);
      if (errors.length) {
        throw new Error(`Open profile placement is invalid (${errors.join('; ')})`);
      }
      return {
        ...curve,
        boundaryVertices: contour,
        ...(curve.originalBoundaryVertices ? { originalBoundaryVertices: contour } : {}),
        ...(curve.referenceVertices ? { referenceVertices: contour } : {})
      };
    });
    for (const item of embeddings) {
      const curve = faceCurves.get(item.targetFaceId);
      contourLayerData.push({
        layer: OCCS_LAYER_CONTOUR_CASSETTE_FACE,
        coordinates: item.embedding.composite.map(vertex => [vertex[0], vertex[1]]),
        handles: [`${item.relationId}:EDGE`],
        workpieceId: workpiece.id,
        workpieceDefinitionId: definitionIdForWorkpiece(workpiece),
        occurrenceId: occurrenceIdForWorkpiece(workpiece),
        profileWorkpieceId: item.profileWorkpieceId,
        relationId: item.relationId
      });
    }

    // Closed profiles carry boolean operations on the host face (owner
    // law 2026-10-19): add operands unite into the face, subtract
    // operands cut from it — the same fold the designer applies.
    const profileCutEntities = (await profileCutEntitiesForTree(workpieceCurves, tree))
      .filter(entity => faceCurves.has(entity.target));
    const cutEmbeddedCurves = [];
    for (const curve of embeddedCurves) {
      const operations = profileCutEntities.filter(entity => entity.target === curve.node.id);
      if (!operations.length) {
        cutEmbeddedCurves.push(curve);
        continue;
      }
      const ringsOf = filterOp => operations
        .filter(entity => entity.booleanOperation === filterOp)
        .flatMap(entity => entity.geometry.type === 'polygons'
          ? entity.geometry.polygons
          : [entity.geometry.vertices]);
      const addRings = ringsOf('add');
      const subtractRings = ringsOf('subtract');
      const baseBoundary = curve.boundaryVertices || curve.vertices;
      const unitedFaces = addRings.length
        ? await unionCassetteV2FacePolygons([baseBoundary, ...addRings])
        : [baseBoundary];
      const face = await unionCassetteV2FacePolygons(unitedFaces);
      const boundary = face[0] || baseBoundary;
      const difference = subtractRings.length
        ? await differenceCassetteV2FacePolygon(boundary, subtractRings)
        : { outer: boundary, holes: curve.holes || [] };
      cutEmbeddedCurves.push({
        ...curve,
        boundaryVertices: difference.outer?.length ? difference.outer : boundary,
        vertices: difference.outer?.length ? difference.outer : boundary,
        holes: difference.holes || curve.holes || []
      });
    }

    for (const entity of profileCutEntities.filter(entity => !entity.booleanOnly)) {
      const rings = entity.geometry.type === 'polygons'
        ? entity.geometry.polygons
        : [entity.geometry.vertices];
      rings.forEach((ring, ringIndex) => {
        profileCutLayerData.push({
          layer: entity.layer,
          coordinates: ring.map(vertex => [vertex[0], vertex[1]]),
          handles: [`${entity.id}:${ringIndex}`],
          workpieceId: workpiece.id,
          workpieceDefinitionId: definitionIdForWorkpiece(workpiece),
          occurrenceId: occurrenceIdForWorkpiece(workpiece),
          profileWorkpieceId: entity.profileWorkpieceId,
          relationId: entity.relationId
        });
      });
    }

    const layout = await buildOccsProductionLayout(
      cutEmbeddedCurves.map(curve => ({
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
