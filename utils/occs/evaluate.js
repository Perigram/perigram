import { buildCassetteV2TrapezoidTreeCurves } from '../cassetteV2Renderer.js';
import { buildOccsEvaluatedDimensionEntities } from './dimensions.js';
import { buildOccsProductionLayout } from './production-layout.js';
import { OCCS_LAYER_CUT_OUTER, OCCS_LAYER_FOLD_ROUTE } from './layers.js';

const clonePlain = (value) => JSON.parse(JSON.stringify(value || {}));

export const evaluateOccsCassetteTemplate = async (definition = {}, parameters = {}) => {
  const graphTree = definition?.extensions?.cutkit?.graphTree;
  if (!graphTree) throw new Error('OCCS cassette template does not contain a CutKit graph tree');

  const tree = clonePlain(graphTree);
  tree.parameters = {
    ...(tree.parameters || {}),
    ...(parameters || {})
  };
  const curves = buildCassetteV2TrapezoidTreeCurves(tree);
  const layout = await buildOccsProductionLayout(
    curves.map(curve => ({
      id: curve.node?.id,
      vertices: curve.boundaryVertices || curve.vertices
    }))
  );
  const polygons = layout.cutOuterPaths.map(coordinates => ({ coordinates }));
  const foldLayerData = layout.foldPaths.map((coordinates, index) => ({
    layer: OCCS_LAYER_FOLD_ROUTE,
    coordinates,
    handles: [`F${index + 1}`]
  }));
  const cutLayerData = polygons.map((polygon, index) => ({
    layer: OCCS_LAYER_CUT_OUTER,
    coordinates: polygon.coordinates,
    handles: [`C${index + 1}`]
  }));
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
    layerData: [...cutLayerData, ...foldLayerData, ...dimensionLayerData],
    dimensions: tree.parameters,
    dimensionEntities,
    annotations: {
      dimensions: dimensionEntities
    }
  };
};
