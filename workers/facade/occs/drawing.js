import { buildOccsProductionLayout } from './production-layout.js';
import { buildOccsDimensionLayerFromFaceCurves } from './dimensions.js';
import { occsLayerExportName } from './layerStandards.js';
import {
  OCCS_LAYER_CONTOUR_CASSETTE_FACE,
  OCCS_LAYER_CUT_OUTER,
  OCCS_LAYER_FOLD_ROUTE
} from './layers.js';

const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const samePoint2d = (left, right, tolerance = 0.001) => (
  Math.abs(numeric(left?.[0]) - numeric(right?.[0])) <= tolerance &&
  Math.abs(numeric(left?.[1]) - numeric(right?.[1])) <= tolerance
);

export const withoutClosingOccsVertex = (vertices = []) => (
  vertices.length > 1 && samePoint2d(vertices[0], vertices[vertices.length - 1])
    ? vertices.slice(0, -1)
    : vertices
);

export const toOccsSvgPoint = (point) => [numeric(point?.[0]), -numeric(point?.[1])];

export const occsCurveToPath = (vertices = []) => {
  const points = vertices.map(toOccsSvgPoint);
  if (!points.length) return '';
  const isClosed = points.length > 2 && samePoint2d(points[0], points[points.length - 1]);
  const commands = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`);
  return `${commands.join(' ')}${isClosed ? ' Z' : ''}`;
};

export const occsShapeToPath = (shape = {}) => {
  const outer = shape.outer || shape.boundaryVertices || shape.vertices || [];
  const holes = Array.isArray(shape.holes) ? shape.holes : [];
  return [occsCurveToPath(outer), ...holes.map(hole => occsCurveToPath(hole))]
    .filter(Boolean)
    .join(' ');
};

export const occsViewBoxForCurves = (curves = []) => {
  const points = curves
    .flatMap(curve => [
      ...(curve.boundaryVertices || curve.vertices || []),
      ...(curve.holes || []).flat()
    ])
    .map(toOccsSvgPoint);
  if (!points.length) return '0 0 100 100';

  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = Math.max(width, height, 100) * 0.12;
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
};

export const buildOccsDrawingFromFaceCurves = async (curves = [], overlays = {}) => {
  const dimensionCurves = curves.map((curve) => ({
    ...curve,
    boundaryVertices: curve.labelBoundaryVertices || curve.referenceVertices || curve.originalBoundaryVertices || curve.boundaryVertices || curve.vertices
  }));
  const dimensionDrawing = overlays.includeDimensions === false
    ? null
    : buildOccsDimensionLayerFromFaceCurves(dimensionCurves, overlays);
  const layout = await buildOccsProductionLayout(
    curves.map(curve => ({
      id: curve.id || curve.nodeId || curve.node?.id,
      vertices: curve.boundaryVertices || curve.vertices
    })),
    overlays
  );
  // The face layer is per face: adjacent faces keep their own fill and
  // the fold route separates them. The production union stays on
  // cut.outer.
  const facePaths = curves.map(curve => ({
    d: occsShapeToPath(curve),
    fill: 'layer',
    stroke: 'none',
    opacity: 0.1,
    ...(Array.isArray(curve.holes) && curve.holes.length ? { fillRule: 'evenodd' } : {})
  }));
  const cutOuterPaths = layout.cutOuterPaths.map(vertices => ({
    d: occsCurveToPath(vertices),
    fill: 'none',
    stroke: 'layer'
  }));
  const foldRoutePaths = Array.isArray(overlays.designerFoldEdges) && overlays.designerFoldEdges.length
    ? overlays.designerFoldEdges.map(edge => ({
        d: `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`,
        fill: 'none',
        stroke: 'layer'
      }))
    : layout.foldPaths.map(vertices => ({
        d: occsCurveToPath(vertices),
        fill: 'none',
        stroke: 'layer'
      }));
  const layers = [
    {
      name: occsLayerExportName(OCCS_LAYER_CONTOUR_CASSETTE_FACE),
      standardCode: OCCS_LAYER_CONTOUR_CASSETTE_FACE,
      role: 'face',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: facePaths
    },
    {
      name: occsLayerExportName(OCCS_LAYER_CUT_OUTER),
      standardCode: OCCS_LAYER_CUT_OUTER,
      role: 'cut',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: cutOuterPaths
    }
  ];

  if (foldRoutePaths.length) {
    layers.push({
      name: occsLayerExportName(OCCS_LAYER_FOLD_ROUTE),
      standardCode: OCCS_LAYER_FOLD_ROUTE,
      role: 'fold',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: foldRoutePaths
    });
  }

  if (dimensionDrawing?.layer) {
    layers.push(dimensionDrawing.layer);
  }
  if (Array.isArray(overlays.extraLayers)) {
    layers.push(...overlays.extraLayers.filter(layer => Array.isArray(layer?.paths) && layer.paths.length));
  }

  const overlayViewBoxCurves = Array.isArray(overlays.viewBoxCurves) ? overlays.viewBoxCurves : [];
  const viewBoxCurves = dimensionDrawing?.extentPoints?.length
    ? [...curves, { vertices: dimensionDrawing.extentPoints }, ...overlayViewBoxCurves]
    : [...curves, ...overlayViewBoxCurves];

  return {
    viewBox: occsViewBoxForCurves(viewBoxCurves),
    vertices: curves[0]?.boundaryVertices,
    designerFaces: overlays.designerFaces || [],
    designerFoldEdges: overlays.designerFoldEdges || [],
    designerSections: overlays.designerSections || { handles: [], segments: [] },
    foldedPreview: overlays.foldedPreview || { faces: [], folds: [] },
    designerEdges: overlays.designerEdges || [],
    dimensionAnnotations: dimensionDrawing?.annotations || [],
    layers
  };
};
