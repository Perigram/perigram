import {
  buildCassetteV2CassetteMarkLayerData,
  buildCassetteV2TrapezoidTreeCurves
} from '../cassetteV2Renderer.js';
import { buildOccsEvaluatedDimensionEntities } from './dimensions.js';
import { buildOccsProductionLayout } from './production-layout.js';
import { OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from './layers.js';

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
  const foldLayerData = [];
  const markLayerData = [];
  const curves = [];

  for (const workpiece of sheetWorkpieces) {
    const workpieceCurves = buildCassetteV2TrapezoidTreeCurves(tree, {
      mode: 'workpiece',
      workpieceId: workpiece.id
    });
    curves.push(...workpieceCurves);
    markLayerData.push(...buildCassetteV2CassetteMarkLayerData(workpieceCurves, tree, context)
      .filter(mark => mark.workpieceId === workpiece.id));

    const layout = await buildOccsProductionLayout(
      workpieceCurves.map(curve => ({
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
    layerData: [...cutLayerData, ...foldLayerData, ...markLayerData, ...dimensionLayerData],
    dimensions: tree.parameters,
    dimensionEntities,
    annotations: {
      dimensions: dimensionEntities
    }
  };
};
