import {
  buildCassetteV2TrapezoidVertices,
  cassetteV2TrapezoidReferenceLength
} from './cassetteV2Trapezoid.js';
import { extractDesignerEdges } from './drawingPreview.js';
import {
  OCCS_LAYER_CODE_CASSETTE_MARK,
  OCCS_LAYER_CONTOUR_CASSETTE_FACE,
  OCCS_LAYER_CONTOUR_FLAT_PATTERN,
  OCCS_LAYER_CUT_HOLE,
  OCCS_LAYER_CUT_INNER,
  OCCS_LAYER_CUT_OUTER,
  OCCS_LAYER_FOLD_ROUTE
} from '../../occs/layers.js';
import {
  collectOccsExpressionIdentifiers,
  resolveOccsAngleExpression,
  resolveOccsExpression
} from '../../occs/expressions.js';
import {
  buildOccsDrawingFromFaceCurves,
  occsCurveToPath,
  occsShapeToPath
} from '../../occs/drawing.js';
import { buildOccsProductionLayout } from '../../occs/production-layout.js';
import { buildOccsFaceDimensionEntities } from '../../occs/dimensions.js';
import { buildOccsFoldedPreviewPayload } from '../../occs/folded-3d.js';
import { applyOccsLayerPens, OCCS_LAYER_STANDARDS, occsLayerExportName, occsLayerStandard } from '../../occs/layerStandards.js';
import { differenceCassetteV2FacePolygon } from './cassetteV2Clipper.js';
import {
  OCCS_EDGE_ARRAY_DEFAULTS,
  OCCS_HANGER_PRODUCTION_MODES,
  OCCS_HARDWARE_FAMILIES,
  createOccsHardwareMetadata,
  edgeArrayDefaults,
  expandOccsEdgeArray2d,
  hangerClipCutPolygon,
  hardwareHoleDiameter,
  hardwareDefaultParameters,
  hardwareLabel,
  hardwareWorkpieceType,
  isOccsHardwareWorkpiece,
  OCCS_HOLE_HARDWARE_FAMILIES,
  normalizeHardwareFamily,
  normalizeHangerProductionMode
} from '../../occs/hardware.js';
import { buildCassetteV2FoldedPreview } from './cassetteV2FoldedPreview.js';
import { embedOccsProfileEdge, embedOccsProfilesIntoContour } from '../../occs/profileEmbedding.js';
import {
  createDefaultOccsProfileTemplateData,
  normalizeOccsProfileSketch,
  occProfileSectionChainedVertices,
  occsProfileFromSketch
} from '../../occs/profiles.js';

const BOUNDARY_LAYER = OCCS_LAYER_CONTOUR_FLAT_PATTERN;
const FOLD_ROUTE_LAYER = OCCS_LAYER_FOLD_ROUTE;
const CONSTRUCTION_LAYER = 'construction.nodi';
const DESIGNER_SECTION_LAYER = 'designer.section';
const DEFAULT_CASSETTE_V2_WORKPIECE_ID = 'wp_1';
const DEFAULT_CASSETTE_V2_WORKPIECE_GAP = 160;
const DEFAULT_CASSETTE_V2_WORKPIECE_NODE_WIDTH = 82;
const DEFAULT_CASSETTE_V2_WORKPIECE_NODE_HEIGHT = 30;
const DEFAULT_CASSETTE_V2_MARK_OFFSET = 12;
const CASSETTE_MARK_TEMPLATE = '{{template.name}}\n{{template.id}}\nWP {{workpiece.index}}';

export const OCCS_CASSETTE_FACE_ROLES = Object.freeze([
  'main',
  'visible',
  'rear',
  'return_flange',
  'mounting_flange',
  'hook_flange',
  'lap_flange',
  'hem',
  'closure_flange',
  'joint_baffle',
  'drip_flange',
  'reveal_face',
  'soffit_face',
  'corner_face',
  'rib_face',
  'stiffener_face'
]);

export const DEFAULT_CASSETTE_V2_PARAMETERS = Object.freeze({
  A: '500',
  B: '400',
  R: '35'
});

const DEFAULT_CASSETTE_V2_NUMERIC = Object.freeze({
  defaultLength: 500,
  height: 400,
  startAnchor: 0,
  endAnchor: 1,
  baseStartOffset: 0,
  baseEndOffset: 0,
  topStartOffset: 0,
  topEndOffset: 0
});

export const DEFAULT_CASSETTE_V2_TRAPEZOID = Object.freeze({
  defaultLength: 'A',
  height: 'B',
  startAnchor: 0,
  endAnchor: 1,
  baseStartOffset: '0',
  baseEndOffset: '0',
  topStartOffset: '0',
  topEndOffset: '0'
});

const DEFAULT_CASSETTE_V2_CHILD_TRAPEZOID = Object.freeze({
  ...DEFAULT_CASSETTE_V2_TRAPEZOID,
  defaultLength: 'inherit',
  height: 'R'
});
const DEFAULT_CASSETTE_V2_FOLD_ANGLE = '90';
const DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT = Object.freeze({
  targetSnap: 'center',
  sourceSnap: 'center',
  offsetX: '0',
  offsetY: '0',
  rotation: '0',
  side: 'front'
});
const DEFAULT_CASSETTE_V2_HARDWARE_ARRAY = Object.freeze({ ...OCCS_EDGE_ARRAY_DEFAULTS });
const DEFAULT_CASSETTE_V2_SECTION_PLANES = Object.freeze({
  vertical: { ratio: 0.5 },
  horizontal: { ratio: 0.5 }
});

export const CASSETTE_V2_HARDWARE_FAMILIES = OCCS_HARDWARE_FAMILIES;
export const CASSETTE_V2_HANGER_PRODUCTION_MODES = OCCS_HANGER_PRODUCTION_MODES;

const GRAPH_LABELS = Object.freeze({
  defaultLength: 'defaultLength',
  height: 'height',
  parentEdgeIndex: 'parentEdgeIndex',
  startAnchor: 'startAnchor',
  endAnchor: 'endAnchor',
  baseStartOffset: 'baseStartOffset',
  baseEndOffset: 'baseEndOffset',
  topStartOffset: 'topStartOffset',
  topEndOffset: 'topEndOffset'
});

const numeric = (value, fallback) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const resolveCassetteV2Expression = resolveOccsExpression;
export const resolveCassetteV2AngleExpression = resolveOccsAngleExpression;
export const collectCassetteV2ExpressionIdentifiers = collectOccsExpressionIdentifiers;

const anchor = (value, fallback, parameters = {}) => {
  const next = Math.round(resolveCassetteV2Expression(value, parameters, fallback));
  return next === 1 ? 1 : 0;
};

const createNodiGraphId = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = cryptoApi?.getRandomValues
    ? cryptoApi.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

export const normalizeCassetteV2Trapezoid = (definition = {}, parameters = {}) => {
  const source = definition.trapezoid || definition.parameters || definition;
  return {
    defaultLength: Math.max(1, resolveCassetteV2Expression(source.defaultLength, parameters, DEFAULT_CASSETTE_V2_NUMERIC.defaultLength)),
    height: Math.max(0.1, resolveCassetteV2Expression(source.height, parameters, DEFAULT_CASSETTE_V2_NUMERIC.height)),
    parentEdgeIndex: Math.max(0, Math.round(resolveCassetteV2Expression(source.parentEdgeIndex, parameters, 0))),
    startAnchor: anchor(source.startAnchor, DEFAULT_CASSETTE_V2_NUMERIC.startAnchor, parameters),
    endAnchor: anchor(source.endAnchor, DEFAULT_CASSETTE_V2_NUMERIC.endAnchor, parameters),
    baseStartOffset: resolveCassetteV2Expression(source.baseStartOffset, parameters, DEFAULT_CASSETTE_V2_NUMERIC.baseStartOffset),
    baseEndOffset: resolveCassetteV2Expression(source.baseEndOffset, parameters, DEFAULT_CASSETTE_V2_NUMERIC.baseEndOffset),
    topStartOffset: resolveCassetteV2Expression(source.topStartOffset, parameters, DEFAULT_CASSETTE_V2_NUMERIC.topStartOffset),
    topEndOffset: resolveCassetteV2Expression(source.topEndOffset, parameters, DEFAULT_CASSETTE_V2_NUMERIC.topEndOffset)
  };
};

const createCassetteV2RootNode = (id, workpieceId) => ({
  id,
  workpieceId,
  operation: 'face.trapezoid',
  parentId: null,
  parentEdgeIndex: null,
  attachEdge: 'E0',
  parameters: { ...DEFAULT_CASSETTE_V2_TRAPEZOID }
});

const createCassetteV2ChildNode = (id, workpieceId, parentId, edgeIndex, options = {}) => ({
  id,
  workpieceId,
  operation: 'face.trapezoid',
  parentId,
  parentEdgeIndex: Math.max(0, Math.round(numeric(edgeIndex, 0))),
  attachEdge: 'E0',
  foldAngle: options.foldAngle || DEFAULT_CASSETTE_V2_FOLD_ANGLE,
  role: options.role,
  parameters: { ...DEFAULT_CASSETTE_V2_CHILD_TRAPEZOID, ...(options.parameters || {}) }
});

const clonePlacement = (placement = {}) => JSON.parse(JSON.stringify(placement || {}));

const occurrenceIdForWorkpiece = (workpiece = {}) => workpiece.occurrenceId || workpiece.id;

const isCassetteV2SheetWorkpiece = (workpiece = {}) => (
  !workpiece.type ||
  workpiece.type === 'sheet' ||
  (workpiece.family === 'hanger_clip' && workpiece.hardware?.productionMode === 'sheetPart')
);

const normalizeCassetteV2Hardware = (workpiece = {}) => {
  const family = normalizeHardwareFamily(workpiece.family || workpiece.hardware?.family || 'bolt');
  const productionMode = family === 'hanger_clip'
    ? normalizeHangerProductionMode(workpiece.productionMode || workpiece.hardware?.productionMode || 'integralCut')
    : '';
  const parameters = {
    ...hardwareDefaultParameters(family),
    ...(workpiece.hardware?.parameters || {}),
    ...(workpiece.parameters || {})
  };
  return createOccsHardwareMetadata({ family, productionMode, parameters });
};

// A profile workpiece carries its parametric snapshot instead of sheet
// faces: it owns no trapezoid node and never renders a face of its own.
export const isCassetteV2ProfileWorkpiece = (workpiece = {}) => workpiece.type === 'profile' || Boolean(workpiece.profile);

export const normalizeCassetteV2Profile = (workpiece = {}, scope = {}) => {
  const source = workpiece.profileSnapshot || workpiece.profile || workpiece.data?.occsProfile || {};
  // The authored sketch wins over any evaluated copy riding a cached
  // profile (`occsProfile.sketch` is evaluated numbers; the authored one
  // keeps the expressions parametric instantiation re-evaluates).
  const rawSketch = workpiece.sketch || source.sketch || null;
  // The profile's own table is the authored sketch's table with the
  // workpiece's instance values overriding it — that override is
  // parametric instantiation, and the sketch (expressions included) is
  // the derivation source, the stored section only the last good cache.
  // The cassette's global parameters join ONLY the evaluation scope:
  // instance values may be cassette expressions, but globals never bake
  // into the stored table (they would go stale when the cassette's own
  // parameters change).
  const sketchTable = rawSketch ? normalizeOccsProfileSketch(rawSketch).parameters : {};
  const table = { ...sketchTable, ...(workpiece.parameters || {}) };
  const evaluationScope = { ...table, ...scope };
  const data = createDefaultOccsProfileTemplateData({
    kind: workpiece.profileKind || workpiece.kind || source.kind,
    process: workpiece.process || workpiece.manufacturing?.process || source.process,
    parameters: table,
    ...(rawSketch ? { sketch: { ...rawSketch, parameters: table } } : {})
  });
  const sketch = normalizeOccsProfileSketch(rawSketch ? { ...rawSketch, parameters: table } : data.sketch, data.parameters);
  const deriveFromSketch = rawSketch && sketch.points.length > 0;
  let occsProfile = null;
  if (source.section && source.sweep && !deriveFromSketch) {
    occsProfile = { section: source.section, sweep: source.sweep, sketch };
  } else {
    try {
      occsProfile = occsProfileFromSketch(sketch, { parameters: evaluationScope });
    } catch {
      // A transient invalid instance parameter keeps the last good
      // section; there is nothing to fall back to for sketch-less
      // snapshots, so the default template geometry stands in.
      occsProfile = source.section && source.sweep
        ? { section: source.section, sweep: source.sweep, sketch }
        : occsProfileFromSketch(normalizeOccsProfileSketch({}, evaluationScope), { parameters: evaluationScope });
    }
  }

  return {
    kind: data.kind,
    process: data.process,
    // The workpiece's table is the derived sketch's table with the
    // instance values the workpiece carries on top. An instance table
    // alone left the parametric default's own W/H/R/D table unreachable
    // — the default template's row chips had nothing to render.
    parameters: { ...sketch.parameters, ...table },
    // The stored sketch keeps the clean table — never the scope-merged
    // evaluation copy.
    sketch,
    section: occsProfile.section,
    sweep: occsProfile.sweep
  };
};

const faceIdForWorkpiece = (tree, workpiece, preferredFaceId) => (
  tree.nodes.find(node => node.id === preferredFaceId && node.workpieceId === workpiece?.id)?.id ||
  workpiece?.rootId ||
  tree.rootId
);

const defaultCassetteV2AttachmentPlacement = (targetWorkpiece = {}, targetNode = null) => ({
  relativeTo: {
    occurrence: occurrenceIdForWorkpiece(targetWorkpiece),
    face: targetNode?.id || targetWorkpiece.rootId,
    side: DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side
  },
  origin: [
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY
  ],
  rotation: DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.rotation,
  anchor: DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap,
  targetAnchor: DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap
});

const createCassetteV2WorkpieceJoint = (sourceWorkpiece = {}, targetWorkpiece = {}, targetNode = null, options = {}) => {
  const placement = defaultCassetteV2AttachmentPlacement(targetWorkpiece, targetNode);
  return {
    id: options.id || `joint_${targetWorkpiece.id || 'world'}_${sourceWorkpiece.id}`,
    type: 'mechanical',
    method: 'reference',
    driver: options.driver !== false,
    source: {
      occurrence: occurrenceIdForWorkpiece(sourceWorkpiece),
      face: sourceWorkpiece.rootId
    },
    target: { ...placement.relativeTo },
    placement
  };
};

const normalizeCassetteV2JointDrivers = (tree) => {
  const jointsBySource = new Map();

  tree.joints.forEach((joint, index) => {
    const sourceOccurrence = joint.source?.occurrence;
    if (!sourceOccurrence) return;
    if (!joint.id) joint.id = `joint_${index + 1}`;
    if (!jointsBySource.has(sourceOccurrence)) jointsBySource.set(sourceOccurrence, []);
    jointsBySource.get(sourceOccurrence).push(joint);
  });

  for (const joints of jointsBySource.values()) {
    let hasDriver = false;
    for (const joint of joints) {
      const explicitDriver = joint.driver ?? joint.placement?.driver ?? joint.extensions?.perigram?.driver;
      joint.driver = explicitDriver === undefined
        ? !hasDriver
        : Boolean(explicitDriver);
      if (joint.driver) {
        if (hasDriver) joint.driver = false;
        else hasDriver = true;
      }
      if (joint.placement?.driver !== undefined) delete joint.placement.driver;
    }
    if (!hasDriver && joints[0]) joints[0].driver = true;
  }
};

const syncCassetteV2DriverPlacements = (tree) => {
  const workpieceByOccurrenceId = new Map(tree.workpieces.map(workpiece => [occurrenceIdForWorkpiece(workpiece), workpiece]));
  for (const joint of tree.joints || []) {
    if (joint.driver === false) continue;
    const sourceWorkpiece = workpieceByOccurrenceId.get(joint.source?.occurrence);
    if (!sourceWorkpiece || !joint.placement) continue;
    sourceWorkpiece.placement = clonePlacement(joint.placement);
  }
};

export const createCassetteV2GraphTree = () => ({
  version: '0.4',
  parameters: { ...DEFAULT_CASSETTE_V2_PARAMETERS },
  sections: JSON.parse(JSON.stringify(DEFAULT_CASSETTE_V2_SECTION_PLANES)),
  rootId: 'face_1',
  workpieces: [
    {
      id: DEFAULT_CASSETTE_V2_WORKPIECE_ID,
      name: 'Workpiece 1',
      rootId: 'face_1',
      definitionId: `${DEFAULT_CASSETTE_V2_WORKPIECE_ID}_def`,
      occurrenceId: DEFAULT_CASSETTE_V2_WORKPIECE_ID,
      previewOrigin: [0, 0, 0],
      placement: {
        relativeTo: 'world',
        origin: ['0', '0', '0'],
        rotation: ['0', '0', '0']
      }
    }
  ],
  joints: [],
  nodes: [
    createCassetteV2RootNode('face_1', DEFAULT_CASSETTE_V2_WORKPIECE_ID)
  ]
});

const cloneCassetteV2Tree = (tree) => {
  const nextTree = JSON.parse(JSON.stringify(tree || createCassetteV2GraphTree()));
  nextTree.parameters = {
    ...DEFAULT_CASSETTE_V2_PARAMETERS,
    ...(nextTree.parameters || {})
  };
  nextTree.sections = {
    vertical: {
      ...DEFAULT_CASSETTE_V2_SECTION_PLANES.vertical,
      ...(nextTree.sections?.vertical || {})
    },
    horizontal: {
      ...DEFAULT_CASSETTE_V2_SECTION_PLANES.horizontal,
      ...(nextTree.sections?.horizontal || {})
    }
  };
  nextTree.nodes = Array.isArray(nextTree.nodes) ? nextTree.nodes : [];
  nextTree.rootId ||= nextTree.nodes.find(node => !node.parentId)?.id || 'face_1';
  nextTree.workpieces = Array.isArray(nextTree.workpieces) && nextTree.workpieces.length
    ? nextTree.workpieces
    : [{
        id: DEFAULT_CASSETTE_V2_WORKPIECE_ID,
        name: 'Workpiece 1',
        rootId: nextTree.rootId,
        definitionId: `${DEFAULT_CASSETTE_V2_WORKPIECE_ID}_def`,
        occurrenceId: DEFAULT_CASSETTE_V2_WORKPIECE_ID,
        previewOrigin: [0, 0, 0],
        placement: {
          relativeTo: 'world',
          origin: ['0', '0', '0'],
          rotation: ['0', '0', '0']
        }
      }];

  const workpieceByRootId = new Map(nextTree.workpieces.map(workpiece => [workpiece.rootId, workpiece]));
  for (const node of nextTree.nodes) {
    if (!node.workpieceId && workpieceByRootId.has(node.id)) {
      node.workpieceId = workpieceByRootId.get(node.id).id;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nextTree.nodes) {
      if (node.workpieceId || !node.parentId) continue;
      const parent = nextTree.nodes.find(item => item.id === node.parentId);
      if (parent?.workpieceId) {
        node.workpieceId = parent.workpieceId;
        changed = true;
      }
    }
  }

  const fallbackWorkpieceId = nextTree.workpieces[0]?.id || DEFAULT_CASSETTE_V2_WORKPIECE_ID;
  nextTree.nodes.forEach((node) => {
    node.workpieceId ||= fallbackWorkpieceId;
  });
  const explicitPlacementByWorkpieceId = new Map(nextTree.workpieces.map(workpiece => [workpiece.id, Boolean(workpiece.placement)]));
  nextTree.workpieces.forEach((workpiece, index) => {
    if (isCassetteV2SheetWorkpiece(workpiece)) {
      workpiece.rootId ||= nextTree.nodes.find(node => node.workpieceId === workpiece.id && !node.parentId)?.id || nextTree.rootId;
    } else {
      workpiece.rootId ||= '';
    }
    workpiece.definitionId ||= `${workpiece.id}_def`;
    workpiece.occurrenceId ||= workpiece.id;
    workpiece.name ||= `Workpiece ${index + 1}`;
    if (isOccsHardwareWorkpiece(workpiece) || workpiece.family) {
      workpiece.hardware = normalizeCassetteV2Hardware(workpiece);
      workpiece.family = workpiece.hardware.family;
      workpiece.productionMode = workpiece.hardware.productionMode || '';
      workpiece.parameters = { ...(workpiece.hardware.parameters || {}) };
      workpiece.type ||= hardwareWorkpieceType(workpiece.family, workpiece.productionMode);
    }
    workpiece.previewOrigin ||= [index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP), 0, 0];
    workpiece.placement ||= {
      relativeTo: 'world',
      origin: [String(index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP)), '0', '0'],
      rotation: ['0', '0', '0']
    };
  });
  const workpieceByOccurrenceId = new Map(nextTree.workpieces.map(workpiece => [occurrenceIdForWorkpiece(workpiece), workpiece]));
  nextTree.joints = Array.isArray(nextTree.joints) ? nextTree.joints : [];
  for (const workpiece of nextTree.workpieces.slice(1)) {
    const hasJoint = nextTree.joints.some(joint => joint.source?.occurrence === occurrenceIdForWorkpiece(workpiece));
    if (hasJoint || !explicitPlacementByWorkpieceId.get(workpiece.id)) continue;

    const relativeTo = typeof workpiece.placement?.relativeTo === 'object'
      ? workpiece.placement.relativeTo
      : null;
    if (!relativeTo?.occurrence) continue;
    const targetWorkpiece = workpieceByOccurrenceId.get(relativeTo?.occurrence) || nextTree.workpieces[0];
    const targetNode = nextTree.nodes.find(node => node.id === relativeTo?.face) ||
      nextTree.nodes.find(node => node.id === targetWorkpiece?.rootId) ||
      null;
    const joint = createCassetteV2WorkpieceJoint(workpiece, targetWorkpiece, targetNode);
    joint.placement = {
      ...joint.placement,
      ...clonePlacement(workpiece.placement),
      relativeTo: {
        occurrence: occurrenceIdForWorkpiece(targetWorkpiece),
        face: relativeTo?.face || targetNode?.id || targetWorkpiece?.rootId,
        side: relativeTo?.side || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side
      },
      targetAnchor: workpiece.placement?.targetAnchor || workpiece.placement?.targetSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap,
      anchor: workpiece.placement?.anchor || workpiece.placement?.sourceSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap
    };
    joint.target = { ...joint.placement.relativeTo };
    nextTree.joints.push(joint);
  }
  normalizeCassetteV2JointDrivers(nextTree);
  syncCassetteV2DriverPlacements(nextTree);
  return nextTree;
};

export const getCassetteV2Workpieces = (tree = createCassetteV2GraphTree()) => cloneCassetteV2Tree(tree).workpieces;

const normalizedCassetteV2WorkpieceRelation = (tree, joint, index = 0) => {
  const workpieceByOccurrenceId = new Map(tree.workpieces.map(workpiece => [occurrenceIdForWorkpiece(workpiece), workpiece]));
  const target = joint.target || joint.placement?.relativeTo || {};
  const sourceWorkpiece = workpieceByOccurrenceId.get(joint.source?.occurrence) || null;
  const targetWorkpiece = workpieceByOccurrenceId.get(target.occurrence) || tree.workpieces[0] || null;
  const placement = clonePlacement(joint.placement || {});
  const targetFaceId = target.face || placement.relativeTo?.face || targetWorkpiece?.rootId || tree.rootId;
  const sourceFaceId = joint.source?.face || placement.sourceFace || sourceWorkpiece?.rootId || '';
  const targetSide = target.side || placement.relativeTo?.side || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const origin = Array.isArray(placement.origin) ? placement.origin : [];
  const targetSnap = placement.targetAnchor ||
    placement.targetSnap ||
    target.anchor ||
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap;
  const sourceSnap = placement.anchor ||
    placement.sourceSnap ||
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap;
  const pattern = placement.pattern?.type === 'edgeArray'
    ? edgeArrayDefaults(placement.pattern)
    : null;

  return {
    id: joint.id || `joint_${index + 1}`,
    type: joint.type || 'mechanical',
    method: joint.method || 'reference',
    driver: joint.driver !== false,
    sourceWorkpieceId: sourceWorkpiece?.id || '',
    sourceFaceId,
    targetWorkpieceId: targetWorkpiece?.id || '',
    targetFaceId,
    targetSide,
    targetSnap,
    sourceSnap,
    offsetX: origin[0] ?? placement.offsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
    offsetY: origin[1] ?? placement.offsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY,
    rotation: placement.rotation ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.rotation,
    mirrorX: Boolean(placement.mirrorX ?? placement.mirror?.x),
    mirrorY: Boolean(placement.mirrorY ?? placement.mirror?.y),
    pattern,
    placementMode: pattern ? 'edgeArray' : 'point',
    arrayEdge: pattern?.edge ?? DEFAULT_CASSETTE_V2_HARDWARE_ARRAY.edge,
    arrayMode: pattern?.mode ?? DEFAULT_CASSETTE_V2_HARDWARE_ARRAY.mode,
    // Authored array values are expressions: an empty string or a zero
    // while typing is the author's text, never a missing value — a
    // falsy read here rewrote the field under the caret with the default.
    arrayCount: pattern?.count ?? DEFAULT_CASSETTE_V2_HARDWARE_ARRAY.count,
    arraySpacing: pattern?.spacing ?? DEFAULT_CASSETTE_V2_HARDWARE_ARRAY.spacing,
    source: {
      ...(joint.source || {}),
      occurrence: sourceWorkpiece ? occurrenceIdForWorkpiece(sourceWorkpiece) : joint.source?.occurrence,
      face: sourceFaceId
    },
    target: {
      occurrence: targetWorkpiece ? occurrenceIdForWorkpiece(targetWorkpiece) : target.occurrence,
      face: targetFaceId,
      side: targetSide
    },
    placement: {
      ...placement,
      relativeTo: {
        occurrence: targetWorkpiece ? occurrenceIdForWorkpiece(targetWorkpiece) : target.occurrence,
        face: targetFaceId,
        side: targetSide
      },
      origin: [
        origin[0] ?? placement.offsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
        origin[1] ?? placement.offsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY
      ],
      anchor: sourceSnap,
      targetAnchor: targetSnap,
      ...(pattern ? { pattern } : {})
    }
  };
};

export const getCassetteV2WorkpieceRelations = (tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  return sourceTree.joints.map((joint, index) => normalizedCassetteV2WorkpieceRelation(sourceTree, joint, index));
};

export const buildCassetteV2WorkpieceTopology = (tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const relations = getCassetteV2WorkpieceRelations(sourceTree);
  const driverRelations = relations.filter(relation => relation.driver);
  const childrenByTarget = new Map();
  const incoming = new Set();

  for (const relation of driverRelations) {
    if (!relation.sourceWorkpieceId || !relation.targetWorkpieceId) continue;
    incoming.add(relation.sourceWorkpieceId);
    if (!childrenByTarget.has(relation.targetWorkpieceId)) childrenByTarget.set(relation.targetWorkpieceId, []);
    childrenByTarget.get(relation.targetWorkpieceId).push(relation.sourceWorkpieceId);
  }

  const levels = new Map();
  const roots = sourceTree.workpieces.filter(workpiece => !incoming.has(workpiece.id));
  const assign = (workpieceId, level) => {
    if (levels.has(workpieceId) && levels.get(workpieceId) <= level) return;
    levels.set(workpieceId, level);
    for (const childId of childrenByTarget.get(workpieceId) || []) {
      assign(childId, level + 1);
    }
  };

  for (const workpiece of roots) assign(workpiece.id, 0);
  for (const workpiece of sourceTree.workpieces) {
    if (!levels.has(workpiece.id)) assign(workpiece.id, 0);
  }

  const levelCounts = new Map();
  const nodes = sourceTree.workpieces.map((workpiece) => {
    const level = levels.get(workpiece.id) || 0;
    const index = levelCounts.get(level) || 0;
    levelCounts.set(level, index + 1);
    return {
      id: workpiece.id,
      label: workpiece.id.replace(/^wp_/, ''),
      name: workpiece.name || workpiece.id,
      rootId: workpiece.rootId,
      occurrenceId: occurrenceIdForWorkpiece(workpiece),
      level,
      x: 18 + level * 120,
      y: 18 + index * 52,
      width: DEFAULT_CASSETTE_V2_WORKPIECE_NODE_WIDTH,
      height: DEFAULT_CASSETTE_V2_WORKPIECE_NODE_HEIGHT
    };
  });
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const edges = relations
    .map((relation) => {
      const sourceNode = nodeById.get(relation.targetWorkpieceId);
      const targetNode = nodeById.get(relation.sourceWorkpieceId);
      if (!sourceNode || !targetNode) return null;
      return {
        id: relation.id,
        sourceWorkpieceId: relation.targetWorkpieceId,
        targetWorkpieceId: relation.sourceWorkpieceId,
        targetFaceId: relation.targetFaceId,
        sourceFaceId: relation.sourceFaceId,
        driver: relation.driver,
        label: relation.driver ? relation.targetSnap : 'declared',
        x1: sourceNode.x + sourceNode.width,
        y1: sourceNode.y + sourceNode.height / 2,
        x2: targetNode.x,
        y2: targetNode.y + targetNode.height / 2,
        midX: (sourceNode.x + sourceNode.width + targetNode.x) / 2,
        midY: (sourceNode.y + sourceNode.height / 2 + targetNode.y + targetNode.height / 2) / 2
      };
    })
    .filter(Boolean);

  const width = Math.max(...nodes.map(node => node.x + node.width + 18), 140);
  const height = Math.max(...nodes.map(node => node.y + node.height + 18), 72);
  return { nodes, edges, width, height };
};

export const nextCassetteV2NodeId = (tree) => {
  const used = new Set((tree?.nodes || []).map(node => node.id));
  let index = (tree?.nodes?.length || 0) + 1;
  let id = `face_${index}`;
  while (used.has(id)) {
    index += 1;
    id = `face_${index}`;
  }
  return id;
};

const nextCassetteV2WorkpieceId = (tree) => {
  const used = new Set((tree?.workpieces || []).map(workpiece => workpiece.id));
  let index = (tree?.workpieces?.length || 0) + 1;
  let id = `wp_${index}`;
  while (used.has(id)) {
    index += 1;
    id = `wp_${index}`;
  }
  return id;
};

const nextCassetteV2JointId = (tree, sourceWorkpieceId, targetWorkpieceId) => {
  const used = new Set((tree?.joints || []).map(joint => joint.id).filter(Boolean));
  const base = `joint_${targetWorkpieceId || 'world'}_${sourceWorkpieceId || 'workpiece'}`;
  let index = 1;
  let id = base;
  while (used.has(id)) {
    index += 1;
    id = `${base}_${index}`;
  }
  return id;
};

export const addCassetteV2GraphChild = (tree, parentId, edgeIndex) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const parent = nextTree.nodes.find(node => node.id === parentId);
  if (!parent) throw new Error(`Missing parent face: ${parentId}`);

  const normalizedEdgeIndex = Math.max(0, Math.round(numeric(edgeIndex, 0)));
  const existingChild = nextTree.nodes.find(node => (
    node.parentId === parentId &&
    node.parentEdgeIndex === normalizedEdgeIndex
  ));
  if (existingChild) return { tree: nextTree, nodeId: existingChild.id };

  const id = nextCassetteV2NodeId(nextTree);
  const parentRole = parent.role || (parent.parentId ? 'return_flange' : 'main');
  const childOptions = parentRole === 'return_flange'
    ? {
        role: 'mounting_flange',
        foldAngle: '-90'
      }
    : { role: 'return_flange' };
  nextTree.nodes.push(createCassetteV2ChildNode(id, parent.workpieceId, parentId, normalizedEdgeIndex, childOptions));

  return { tree: nextTree, nodeId: id };
};

export const addCassetteV2Workpiece = (tree, reference = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const id = nextCassetteV2WorkpieceId(nextTree);
  const nodeId = nextCassetteV2NodeId(nextTree);
  const referenceNode = nextTree.nodes.find(node => node.id === reference.referenceNodeId) || null;
  const referenceWorkpiece = nextTree.workpieces.find(workpiece => (
    workpiece.id === (reference.referenceWorkpieceId || referenceNode?.workpieceId)
  )) || nextTree.workpieces[0] || null;
  const index = nextTree.workpieces.length;
  const origin = [
    index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP),
    0,
    0
  ];
  const targetNode = referenceNode || nextTree.nodes.find(node => node.id === referenceWorkpiece?.rootId) || null;
  const sourceWorkpiece = {
    id,
    name: `Workpiece ${index + 1}`,
    rootId: nodeId,
    definitionId: `${id}_def`,
    occurrenceId: id,
    previewOrigin: origin
  };
  const placement = referenceWorkpiece
    ? defaultCassetteV2AttachmentPlacement(referenceWorkpiece, targetNode)
    : {
        relativeTo: 'world',
        origin: ['0', '0', '0'],
        rotation: ['0', '0', '0']
      };

  nextTree.workpieces.push({
    ...sourceWorkpiece,
    placement
  });
  nextTree.nodes.push(createCassetteV2RootNode(nodeId, id));
  if (referenceWorkpiece) {
    nextTree.joints.push(createCassetteV2WorkpieceJoint(sourceWorkpiece, referenceWorkpiece, targetNode, {
      id: nextCassetteV2JointId(nextTree, id, referenceWorkpiece.id),
      driver: true
    }));
  }

  return { tree: nextTree, workpieceId: id, nodeId };
};

export const addCassetteV2HardwareWorkpiece = (tree, reference = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const family = normalizeHardwareFamily(reference.family || 'bolt');
  const productionMode = family === 'hanger_clip'
    ? normalizeHangerProductionMode(reference.productionMode || 'integralCut')
    : '';
  const type = hardwareWorkpieceType(family, productionMode);
  const id = nextCassetteV2WorkpieceId(nextTree);
  const index = nextTree.workpieces.length;
  const referenceNode = nextTree.nodes.find(node => node.id === reference.referenceNodeId) ||
    nextTree.nodes.find(node => node.id === reference.targetFaceId) ||
    null;
  const referenceWorkpiece = nextTree.workpieces.find(workpiece => (
    workpiece.id === (reference.referenceWorkpieceId || reference.targetWorkpieceId || referenceNode?.workpieceId)
  )) || nextTree.workpieces[0] || null;
  const targetNode = referenceNode || nextTree.nodes.find(node => node.id === referenceWorkpiece?.rootId) || null;
  const metadata = createOccsHardwareMetadata({
    family,
    productionMode,
    parameters: reference.parameters || {}
  });
  const isSheetPart = type === 'sheet';
  const nodeId = isSheetPart ? nextCassetteV2NodeId(nextTree) : '';
  const sourceWorkpiece = {
    id,
    name: reference.name || hardwareLabel(family, productionMode),
    type,
    family,
    productionMode,
    hardware: metadata,
    parameters: { ...(metadata.parameters || {}) },
    rootId: nodeId,
    definitionId: `${id}_def`,
    occurrenceId: id,
    previewOrigin: [
      index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP),
      0,
      0
    ]
  };
  const placement = referenceWorkpiece
    ? defaultCassetteV2AttachmentPlacement(referenceWorkpiece, targetNode)
    : {
        relativeTo: 'world',
        origin: ['0', '0', '0'],
        rotation: ['0', '0', '0']
      };
  placement.pattern = edgeArrayDefaults(reference.pattern || DEFAULT_CASSETTE_V2_HARDWARE_ARRAY);

  nextTree.workpieces.push({
    ...sourceWorkpiece,
    placement
  });

  if (isSheetPart) {
    nextTree.nodes.push(createCassetteV2RootNode(nodeId, id));
    const sheetNode = nextTree.nodes.find(node => node.id === nodeId);
    if (sheetNode) {
      sheetNode.role = 'hook_flange';
      sheetNode.parameters = {
        ...sheetNode.parameters,
        defaultLength: metadata.parameters.width || '42',
        height: metadata.parameters.height || '28'
      };
    }
  }

  if (referenceWorkpiece) {
    const joint = createCassetteV2WorkpieceJoint(sourceWorkpiece, referenceWorkpiece, targetNode, {
      id: nextCassetteV2JointId(nextTree, id, referenceWorkpiece.id),
      driver: true
    });
    joint.source.face = nodeId || '';
    joint.placement.pattern = edgeArrayDefaults(reference.pattern || DEFAULT_CASSETTE_V2_HARDWARE_ARRAY);
    nextTree.joints.push(joint);
  }

  return { tree: nextTree, workpieceId: id, nodeId };
};

export const addCassetteV2ProfileWorkpiece = (tree, reference = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const id = nextCassetteV2WorkpieceId(nextTree);
  const index = nextTree.workpieces.length;
  const referenceNode = nextTree.nodes.find(node => node.id === reference.referenceNodeId) ||
    nextTree.nodes.find(node => node.id === reference.targetFaceId) ||
    null;
  const referenceWorkpiece = nextTree.workpieces.find(workpiece => (
    workpiece.id === (reference.referenceWorkpieceId || reference.targetWorkpieceId || referenceNode?.workpieceId)
  )) || nextTree.workpieces[0] || null;
  const targetNode = referenceNode || nextTree.nodes.find(node => node.id === referenceWorkpiece?.rootId) || null;
  const templateData = reference.template?.data || reference.profileTemplate?.data || reference;
  const profile = normalizeCassetteV2Profile({
    type: 'profile',
    profileKind: templateData.kind,
    process: templateData.process,
    parameters: templateData.parameters,
    profile: templateData.occsProfile || templateData.profile,
    sketch: templateData.sketch
  }, treeParameters(nextTree));
  const sourceWorkpiece = {
    id,
    name: reference.name || reference.template?.identity?.name || reference.profileTemplate?.identity?.name || `Profile ${index + 1}`,
    type: 'profile',
    role: profile.kind,
    profileTemplateId: reference.template?._id || reference.profileTemplate?._id || reference.profileTemplateId || '',
    profileSnapshot: profile,
    process: profile.process,
    parameters: { ...profile.parameters },
    rootId: '',
    definitionId: `${id}_def`,
    occurrenceId: id,
    previewOrigin: [
      index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP),
      0,
      0
    ]
  };
  const placement = referenceWorkpiece
    ? defaultCassetteV2AttachmentPlacement(referenceWorkpiece, targetNode)
    : {
        relativeTo: 'world',
        origin: ['0', '0', '0'],
        rotation: ['0', '0', '0']
      };

  nextTree.workpieces.push({
    ...sourceWorkpiece,
    placement
  });

  if (referenceWorkpiece) {
    const joint = createCassetteV2WorkpieceJoint(sourceWorkpiece, referenceWorkpiece, targetNode, {
      id: nextCassetteV2JointId(nextTree, id, referenceWorkpiece.id),
      driver: true
    });
    joint.source.face = '';
    nextTree.joints.push(joint);
  }

  return { tree: nextTree, workpieceId: id, nodeId: '' };
};

export const updateCassetteV2Workpiece = (tree, workpieceId, patch = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const index = nextTree.workpieces.findIndex(workpiece => workpiece.id === workpieceId);
  if (index < 0) return nextTree;
  const current = nextTree.workpieces[index];
  if (isCassetteV2ProfileWorkpiece(current) || patch.type === 'profile' || patch.profile) {
    const profile = normalizeCassetteV2Profile({
      ...current,
      ...patch,
      profile: patch.profile || patch.profileSnapshot || current.profileSnapshot || current.profile,
      parameters: {
        ...(current.parameters || {}),
        ...(patch.parameters || {})
      }
    }, treeParameters(nextTree));
    nextTree.nodes = nextTree.nodes.filter(node => node.workpieceId !== current.id);
    nextTree.joints.forEach((joint) => {
      if (joint.source?.occurrence === occurrenceIdForWorkpiece(current)) {
        joint.source.face = '';
      }
    });
    nextTree.workpieces[index] = {
      ...current,
      ...patch,
      type: 'profile',
      role: patch.role || current.role || profile.kind,
      process: profile.process,
      parameters: profile.parameters,
      profileSnapshot: profile,
      rootId: ''
    };
    delete nextTree.workpieces[index].family;
    delete nextTree.workpieces[index].productionMode;
    delete nextTree.workpieces[index].hardware;
    return nextTree;
  }
  const family = normalizeHardwareFamily(patch.family || current.family || current.hardware?.family || 'bolt');
  const productionMode = family === 'hanger_clip'
    ? normalizeHangerProductionMode(patch.productionMode || current.productionMode || current.hardware?.productionMode || 'integralCut')
    : '';
  const parameters = {
    ...hardwareDefaultParameters(family),
    ...(current.parameters || {}),
    ...(current.hardware?.parameters || {}),
    ...(patch.parameters || {})
  };
  const hardware = createOccsHardwareMetadata({ family, productionMode, parameters });
  const type = patch.type || hardwareWorkpieceType(family, productionMode);
  let rootId = current.rootId || '';
  if (type === 'sheet' && !rootId) {
    rootId = nextCassetteV2NodeId(nextTree);
    nextTree.nodes.push({
      ...createCassetteV2RootNode(rootId, current.id),
      role: 'hook_flange',
      parameters: {
        ...DEFAULT_CASSETTE_V2_TRAPEZOID,
        defaultLength: parameters.width || '42',
        height: parameters.height || '28'
      }
    });
  } else if (type !== 'sheet') {
    const removedNodeIds = new Set(nextTree.nodes.filter(node => node.workpieceId === current.id).map(node => node.id));
    nextTree.nodes = nextTree.nodes.filter(node => node.workpieceId !== current.id);
    nextTree.joints.forEach((joint) => {
      if (joint.source?.occurrence === occurrenceIdForWorkpiece(current) && removedNodeIds.has(joint.source.face)) {
        joint.source.face = '';
      }
    });
    rootId = '';
  }
  nextTree.workpieces[index] = {
    ...current,
    ...patch,
    type,
    family,
    productionMode,
    rootId,
    parameters,
    hardware
  };
  return nextTree;
};

export const addCassetteV2WorkpieceAttachment = (tree, sourceWorkpieceId, reference = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const sourceWorkpiece = nextTree.workpieces.find(workpiece => workpiece.id === sourceWorkpieceId);
  if (!sourceWorkpiece) return { tree: nextTree, relationId: '' };

  const targetWorkpiece = nextTree.workpieces.find(workpiece => workpiece.id === reference.targetWorkpieceId && workpiece.id !== sourceWorkpiece.id) ||
    nextTree.workpieces.find(workpiece => workpiece.id !== sourceWorkpiece.id) ||
    null;
  if (!targetWorkpiece) return { tree: nextTree, relationId: '' };

  const targetNode = nextTree.nodes.find(node => node.id === reference.targetFaceId && node.workpieceId === targetWorkpiece.id) ||
    nextTree.nodes.find(node => node.id === targetWorkpiece.rootId) ||
    null;
  const sourceFaceId = faceIdForWorkpiece(nextTree, sourceWorkpiece, reference.sourceFaceId || sourceWorkpiece.rootId);
  const driver = Boolean(reference.driver);
  const joint = createCassetteV2WorkpieceJoint(sourceWorkpiece, targetWorkpiece, targetNode, {
    id: nextCassetteV2JointId(nextTree, sourceWorkpiece.id, targetWorkpiece.id),
    driver
  });

  joint.source.face = sourceFaceId;
  if (reference.targetSnap) joint.placement.targetAnchor = reference.targetSnap;
  if (reference.sourceSnap) joint.placement.anchor = reference.sourceSnap;
  if (reference.offsetX !== undefined || reference.offsetY !== undefined) {
    joint.placement.origin = [
      reference.offsetX ?? joint.placement.origin?.[0] ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
      reference.offsetY ?? joint.placement.origin?.[1] ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY
    ];
  }
  if (reference.rotation !== undefined) joint.placement.rotation = reference.rotation;
  if (reference.targetSide) {
    joint.target.side = reference.targetSide;
    joint.placement.relativeTo.side = reference.targetSide;
  }

  if (driver) {
    nextTree.joints.forEach((existingJoint) => {
      if (existingJoint.source?.occurrence === occurrenceIdForWorkpiece(sourceWorkpiece)) {
        existingJoint.driver = false;
      }
    });
    sourceWorkpiece.placement = clonePlacement(joint.placement);
  }

  nextTree.joints.push(joint);
  return { tree: nextTree, relationId: joint.id };
};

export const deleteCassetteV2Workpiece = (tree, workpieceId) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const workpiece = nextTree.workpieces.find(item => item.id === workpieceId);
  const rootWorkpieceId = nextTree.workpieces[0]?.id;
  if (!workpiece || workpiece.id === rootWorkpieceId || nextTree.workpieces.length <= 1) {
    return { tree: nextTree, deletedWorkpieceIds: [], selectedWorkpieceId: rootWorkpieceId || '' };
  }

  const relations = getCassetteV2WorkpieceRelations(nextTree);
  const deleteIds = new Set([workpiece.id]);

  const deletedOccurrenceIds = new Set(nextTree.workpieces
    .filter(item => deleteIds.has(item.id))
    .map(occurrenceIdForWorkpiece));
  const sourceRelation = relations.find(relation => relation.sourceWorkpieceId === workpiece.id);
  const inboundRelation = relations.find(relation => relation.targetWorkpieceId === workpiece.id);
  const selectedWorkpieceId = sourceRelation?.targetWorkpieceId || inboundRelation?.sourceWorkpieceId || rootWorkpieceId || '';

  nextTree.workpieces = nextTree.workpieces.filter(item => !deleteIds.has(item.id));
  nextTree.nodes = nextTree.nodes.filter(node => !deleteIds.has(node.workpieceId));
  nextTree.joints = nextTree.joints.filter(joint => (
    !deletedOccurrenceIds.has(joint.source?.occurrence) &&
    !deletedOccurrenceIds.has(joint.target?.occurrence) &&
    !deletedOccurrenceIds.has(joint.placement?.relativeTo?.occurrence)
  ));
  nextTree.workpieces.forEach((item, index) => {
    const relativeTo = item.placement?.relativeTo;
    if (relativeTo?.occurrence && deletedOccurrenceIds.has(relativeTo.occurrence)) {
      item.placement = {
        relativeTo: 'world',
        origin: [String(index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP)), '0', '0'],
        rotation: ['0', '0', '0']
      };
    }
  });
  nextTree.rootId = nextTree.workpieces[0]?.rootId || nextTree.nodes[0]?.id || nextTree.rootId;

  return {
    tree: nextTree,
    deletedWorkpieceIds: [...deleteIds],
    selectedWorkpieceId
  };
};

export const deleteCassetteV2WorkpieceRelation = (tree, relationId) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const relationIndex = nextTree.joints.findIndex(joint => joint.id === relationId);
  if (relationIndex < 0) {
    return { tree: nextTree, deletedRelationId: '', selectedWorkpieceId: '', selectedRelationId: '' };
  }

  const relation = normalizedCassetteV2WorkpieceRelation(nextTree, nextTree.joints[relationIndex], relationIndex);
  const sourceWorkpiece = nextTree.workpieces.find(workpiece => workpiece.id === relation.sourceWorkpieceId);
  nextTree.joints.splice(relationIndex, 1);

  const sourceOccurrence = sourceWorkpiece ? occurrenceIdForWorkpiece(sourceWorkpiece) : '';
  const hasRemainingSourceJoint = Boolean(sourceOccurrence) && nextTree.joints.some(joint => (
    joint.source?.occurrence === sourceOccurrence
  ));
  if (sourceWorkpiece && !hasRemainingSourceJoint) {
    sourceWorkpiece.placement = {
      relativeTo: 'world',
      origin: ['0', '0', '0'],
      rotation: ['0', '0', '0']
    };
  }

  normalizeCassetteV2JointDrivers(nextTree);
  syncCassetteV2DriverPlacements(nextTree);

  const remainingRelations = getCassetteV2WorkpieceRelations(nextTree);
  const selectedRelation = remainingRelations.find(item => item.sourceWorkpieceId === relation.sourceWorkpieceId) ||
    remainingRelations.find(item => item.targetWorkpieceId === relation.sourceWorkpieceId) ||
    null;

  return {
    tree: nextTree,
    deletedRelationId: relation.id,
    selectedWorkpieceId: relation.sourceWorkpieceId || relation.targetWorkpieceId || nextTree.workpieces[0]?.id || '',
    selectedRelationId: selectedRelation?.id || ''
  };
};

export const updateCassetteV2WorkpieceRelation = (tree, relationId, patch = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const relationIndex = nextTree.joints.findIndex(joint => joint.id === relationId);
  if (relationIndex < 0) return nextTree;

  const relation = normalizedCassetteV2WorkpieceRelation(nextTree, nextTree.joints[relationIndex], relationIndex);
  const sourceWorkpiece = nextTree.workpieces.find(workpiece => workpiece.id === relation.sourceWorkpieceId);
  const targetWorkpiece = nextTree.workpieces.find(workpiece => (
    workpiece.id === (patch.targetWorkpieceId || relation.targetWorkpieceId)
  )) || nextTree.workpieces[0];
  const sourceFaceId = isCassetteV2SheetWorkpiece(sourceWorkpiece)
    ? faceIdForWorkpiece(nextTree, sourceWorkpiece, patch.sourceFaceId || relation.sourceFaceId)
    : '';
  const targetFaceId = faceIdForWorkpiece(nextTree, targetWorkpiece, patch.targetFaceId ||
    (patch.targetWorkpieceId ? targetWorkpiece?.rootId : relation.targetFaceId));
  const targetSide = patch.targetSide || relation.targetSide || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const targetSnap = patch.targetSnap || relation.targetSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap;
  const sourceSnap = patch.sourceSnap || relation.sourceSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap;
  const requestedDriver = patch.driver ?? relation.driver;
  const otherDriverExists = nextTree.joints.some((joint, index) => (
    index !== relationIndex &&
    joint.source?.occurrence === occurrenceIdForWorkpiece(sourceWorkpiece) &&
    joint.driver !== false
  ));
  const driver = requestedDriver === false ? otherDriverExists : Boolean(requestedDriver);
  const target = {
    occurrence: occurrenceIdForWorkpiece(targetWorkpiece),
    face: targetFaceId,
    side: targetSide
  };
  const placement = {
    ...relation.placement,
    relativeTo: target,
    origin: [
      patch.offsetX ?? relation.offsetX,
      patch.offsetY ?? relation.offsetY
    ],
    rotation: patch.rotation ?? relation.rotation,
    mirrorX: patch.mirrorX ?? relation.mirrorX,
    mirrorY: patch.mirrorY ?? relation.mirrorY,
    anchor: sourceSnap,
    targetAnchor: targetSnap
  };
  // Any array field in the patch updates the pattern — an array value
  // alone must not be dropped for lacking a repeated placementMode.
  const arrayPatchKeys = ['arrayEdge', 'arrayMode', 'arrayCount', 'arraySpacing'];
  const patchesArray = patch.placementMode === 'edgeArray' || patch.pattern ||
    arrayPatchKeys.some(key => patch[key] !== undefined);
  if (patchesArray) {
    placement.pattern = edgeArrayDefaults(patch.pattern || {
      edge: patch.arrayEdge ?? relation.arrayEdge,
      mode: patch.arrayMode ?? relation.arrayMode,
      count: patch.arrayCount ?? relation.arrayCount,
      spacing: patch.arraySpacing ?? relation.arraySpacing
    });
  } else if (patch.placementMode === 'point') {
    delete placement.pattern;
  }
  const nextJoint = {
    ...nextTree.joints[relationIndex],
    type: patch.type || relation.type,
    method: patch.method ?? relation.method,
    driver,
    source: {
      occurrence: occurrenceIdForWorkpiece(sourceWorkpiece),
      face: sourceFaceId
    },
    target,
    placement
  };

  nextTree.joints.splice(relationIndex, 1, nextJoint);
  if (sourceWorkpiece && driver) {
    nextTree.joints.forEach((joint, index) => {
      if (index !== relationIndex && joint.source?.occurrence === occurrenceIdForWorkpiece(sourceWorkpiece)) {
        joint.driver = false;
      }
    });
    sourceWorkpiece.placement = clonePlacement(placement);
  }
  return nextTree;
};

export const updateCassetteV2GraphNode = (tree, nodeId, patch = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const node = nextTree.nodes.find(item => item.id === nodeId);
  if (!node) return nextTree;
  node.parameters = {
    ...(node.parameters || {}),
    ...patch
  };
  return nextTree;
};

const isGraphTree = (value) => value && Array.isArray(value.nodes) && value.rootId;

const expressionValue = (value, fallback) => {
  if (value === 'inherit') return 'inherit';
  if (value === null || value === undefined || value === '') return fallback;
  return value;
};

const hasShapeExpressionValue = (value) => (
  value !== null &&
  value !== undefined &&
  value !== '' &&
  !(typeof value !== 'string' && numeric(value, 0) === 0) &&
  !(typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) === 0)
);

const treeParameters = (tree = {}) => ({
  ...DEFAULT_CASSETTE_V2_PARAMETERS,
  ...(tree.parameters || {})
});

const nodeParameterScope = (treeOrParameters = {}) => (
  treeOrParameters.nodes ? treeParameters(treeOrParameters) : {
    ...DEFAULT_CASSETTE_V2_PARAMETERS,
    ...(treeOrParameters || {})
  }
);

const foldAngleFromNode = (node) => (
  String(node.foldAngle || DEFAULT_CASSETTE_V2_FOLD_ANGLE)
    .replace(/\s*deg\s*$/i, '')
    .trim() || DEFAULT_CASSETTE_V2_FOLD_ANGLE
);

const displayAngle = (value) => String(value || '')
  .replace(/\s*deg\s*$/i, '')
  .trim();

const faceRoleFromNode = (node) => node.role || (node.parentId ? 'return_flange' : 'main');

const nodeExpressionScope = (node, parameters = {}) => {
  const scope = nodeParameterScope(parameters);
  if (node?.parentId) {
    scope.foldAngle = resolveCassetteV2AngleExpression(foldAngleFromNode(node), scope, 90);
    scope.parentEdgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
  }
  return scope;
};

const resolvedNodeTrapezoid = (node, parameters = {}) => normalizeCassetteV2Trapezoid({
  ...(node.parameters || {}),
  parentEdgeIndex: node.parentId ? node.parentEdgeIndex : node.parameters?.parentEdgeIndex
}, nodeExpressionScope(node, parameters));

const resolvedNodeTrapezoidForGeometry = (node, parameters = {}, parentBoundaryVertices = null) => {
  const shape = {
    ...(node.parameters || {}),
    parentEdgeIndex: node.parentId ? node.parentEdgeIndex : node.parameters?.parentEdgeIndex
  };
  if (node.parentId && shape.defaultLength === 'inherit') {
    const inheritedLength = cassetteV2TrapezoidReferenceLength(parentBoundaryVertices, node.parentEdgeIndex);
    if (Number.isFinite(inheritedLength)) shape.defaultLength = inheritedLength;
  }
  return normalizeCassetteV2Trapezoid(shape, nodeExpressionScope(node, parameters));
};

const rawShapeValue = (node, key) => {
  const fallback = DEFAULT_CASSETTE_V2_TRAPEZOID[key];
  return expressionValue(node.parameters?.[key], fallback);
};

const shapeFromNode = (node) => {
  const shape = {
    type: 'trapezoid',
    baseLength: node.parentId ? 'inherit' : rawShapeValue(node, 'defaultLength'),
    height: rawShapeValue(node, 'height')
  };

  for (const key of ['baseStartOffset', 'baseEndOffset', 'topStartOffset', 'topEndOffset']) {
    const value = rawShapeValue(node, key);
    if (hasShapeExpressionValue(value)) shape[key] = value;
  }

  return shape;
};

const dimensionEntitiesForFaceShape = (faceId, shape) => buildOccsFaceDimensionEntities({
  faceId,
  shape,
  target: faceId
});

const cassetteMarkEntityForWorkpiece = (workpiece, index = 0) => ({
  id: `mark_${workpiece.id}`,
  layer: OCCS_LAYER_CODE_CASSETTE_MARK,
  target: workpiece.rootId,
  geometry: {
    type: 'text',
    anchor: 'bottom_left',
    offset: [DEFAULT_CASSETTE_V2_MARK_OFFSET, DEFAULT_CASSETTE_V2_MARK_OFFSET],
    text: CASSETTE_MARK_TEMPLATE
  },
  value: {
    mode: 'template',
    value: CASSETTE_MARK_TEMPLATE
  },
  extensions: {
    perigram: {
      markKind: 'cassette',
      workpieceIndex: index + 1
    }
  }
});

const dimensionLabelsForNode = (node) => {
  const base = rawShapeValue(node, 'defaultLength');
  return {
    base: base === 'inherit' ? '' : String(base),
    height: String(rawShapeValue(node, 'height'))
  };
};

export const createCassetteV2OccsDocument = (definition = {}, context = {}) => {
  if (isGraphTree(definition)) {
    return createCassetteV2OccsDocumentFromTree(definition, context);
  }

  const trapezoid = normalizeCassetteV2Trapezoid(definition);
  return {
    occs: '0.4-draft',
    documentType: 'template',
    id: 'cassette-v2-trapezoid',
    units: 'mm',
    parameters: {
      A: trapezoid.defaultLength,
      H: trapezoid.height,
      BSO: trapezoid.baseStartOffset,
      BEO: trapezoid.baseEndOffset,
      TSO: trapezoid.topStartOffset,
      TEO: trapezoid.topEndOffset
    },
    definitions: {
      workpieces: [
        {
          id: 'tray_def',
          type: 'sheet',
          role: 'cassette_tray',
          faces: [
            {
              id: 'main',
              role: 'main',
              shape: {
                type: 'trapezoid',
                baseLength: 'A',
                height: 'H',
                baseStartOffset: 'BSO',
                baseEndOffset: 'BEO',
                topStartOffset: 'TSO',
                topEndOffset: 'TEO'
              }
            }
          ],
          folds: [],
          entities: dimensionEntitiesForFaceShape('main', {
            type: 'trapezoid',
            baseLength: 'A',
            height: 'H'
          })
        }
      ],
      libraryParts: []
    },
    cassette: {
      occurrences: [
        {
          id: 'tray',
          ref: 'tray_def',
          placement: {
            relativeTo: 'world',
            origin: ['0', '0', '0'],
            rotation: ['0', '0', '0']
          }
        }
      ],
      joints: []
    },
    extensions: {
      perigram: {
        nodi: {
          graph: 'public/nodi/face.trapezoid.json',
          operation: 'face.trapezoid',
          inputs: {
            parentEdgeIndex: trapezoid.parentEdgeIndex,
            startAnchor: trapezoid.startAnchor,
            endAnchor: trapezoid.endAnchor
          }
        }
      }
    }
  };
};

export const createCassetteV2OccsDocumentFromTree = (tree = createCassetteV2GraphTree(), context = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const nodes = Array.isArray(sourceTree.nodes) ? sourceTree.nodes : [];
  const nodesByWorkpieceId = new Map();
  for (const node of nodes) {
    if (!nodesByWorkpieceId.has(node.workpieceId)) nodesByWorkpieceId.set(node.workpieceId, []);
    nodesByWorkpieceId.get(node.workpieceId).push(node);
  }
  const curves = buildCassetteV2TrapezoidTreeCurves(sourceTree, { mode: 'assembly' });
  const curveByNodeId = new Map(curves.map(curve => [curve.node.id, curve]));
  const productionEntitiesByTarget = new Map();
  for (const entity of hardwareProductionEntitiesForTree(curves, sourceTree)) {
    if (!productionEntitiesByTarget.has(entity.target)) productionEntitiesByTarget.set(entity.target, []);
    productionEntitiesByTarget.get(entity.target).push(entity);
  }

  return {
    occs: '0.4-draft',
    documentType: 'template',
    id: 'cassette-v2-tree',
    units: 'mm',
    parameters: treeParameters(sourceTree),
    definitions: {
      workpieces: sourceTree.workpieces.map(workpiece => {
        const workpieceNodes = nodesByWorkpieceId.get(workpiece.id) || [];
        const workpieceIndex = sourceTree.workpieces.findIndex(item => item.id === workpiece.id);
        if (isCassetteV2ProfileWorkpiece(workpiece)) {
          const profile = normalizeCassetteV2Profile(workpiece, treeParameters(sourceTree));
          return {
            id: workpiece.definitionId || `${workpiece.id}_def`,
            type: 'profile',
            role: workpiece.role || profile.kind,
            parameters: { ...(profile.parameters || {}) },
            profile: {
              section: profile.section,
              sweep: profile.sweep
            },
            manufacturing: {
              process: profile.process
            },
            extensions: {
              perigram: {
                profileTemplateId: workpiece.profileTemplateId || '',
                sketch: profile.sketch
              }
            }
          };
        }
        if (!isCassetteV2SheetWorkpiece(workpiece)) {
          const hardware = normalizeCassetteV2Hardware(workpiece);
          return {
            id: workpiece.definitionId || `${workpiece.id}_def`,
            type: workpiece.type || hardwareWorkpieceType(hardware.family, hardware.productionMode),
            role: hardware.family,
            parameters: { ...(hardware.parameters || {}) },
            hardware,
            ...(workpiece.type === 'solid' ? { solid: { kind: hardware.family } } : {})
          };
        }
        const cassetteMarkEntity = cassetteMarkEntityForWorkpiece(workpiece, workpieceIndex);
        const faces = workpieceNodes.map((node) => {
          const hookCuts = (productionEntitiesByTarget.get(node.id) || [])
            .filter(entity => !entity.booleanOnly && entity.layer === OCCS_LAYER_CUT_INNER && entity.geometry?.type === 'polygon');
          const curve = curveByNodeId.get(node.id);
          const shape = hookCuts.length && curve
            ? {
                type: 'polygon',
                vertices: (curve.boundaryVertices || curve.vertices || []).map(vertex => [
                  String(vertex[0]),
                  String(vertex[1])
                ]),
                holes: hookCuts.map(entity => entity.geometry.vertices.map(vertex => [
                  String(vertex[0]),
                  String(vertex[1])
                ]))
              }
            : shapeFromNode(node);
          return {
            id: node.id,
            role: faceRoleFromNode(node),
            shape
          };
        });
        return {
          id: workpiece.definitionId || `${workpiece.id}_def`,
          type: 'sheet',
          role: workpiece.hardware?.family || (workpiece.id === sourceTree.workpieces[0]?.id ? 'cassette_tray' : 'cassette_part'),
          ...(workpiece.hardware ? {
            hardware: normalizeCassetteV2Hardware(workpiece),
            parameters: { ...(workpiece.parameters || workpiece.hardware?.parameters || {}) }
          } : {}),
          faces,
          folds: workpieceNodes
            .filter(node => node.parentId)
            .map(node => ({
              id: `fold_${node.parentId}_E${node.parentEdgeIndex}_${node.id}`,
              from: `${node.parentId}.E${node.parentEdgeIndex}`,
              to: `${node.id}.${node.attachEdge || 'E0'}`,
              angle: foldAngleFromNode(node),
              method: 'routed',
              layer: FOLD_ROUTE_LAYER
            })),
          entities: [
            ...faces.flatMap(face => dimensionEntitiesForFaceShape(face.id, face.shape)),
            ...faces.flatMap(face => (productionEntitiesByTarget.get(face.id) || []).filter(entity => !entity.booleanOnly).map(entity => ({
              id: entity.id,
              layer: entity.layer,
              target: entity.target,
              geometry: entity.geometry.type === 'circle'
                ? {
                    type: 'circle',
                    diameter: String(entity.geometry.diameter),
                    center: [
                      String(entity.geometry.center[0]),
                      String(entity.geometry.center[1])
                    ]
                  }
                : {
                    type: 'polygon',
                    vertices: entity.geometry.vertices.map(vertex => [
                      String(vertex[0]),
                      String(vertex[1])
                    ])
                  },
              extensions: {
                perigram: {
                  relationId: entity.relationId,
                  hardwareWorkpieceId: entity.hardwareWorkpieceId
                }
              }
            }))),
            {
              ...cassetteMarkEntity,
              geometry: {
                ...cassetteMarkEntity.geometry,
                text: cassetteMarkText(workpiece, workpieceIndex, context)
              }
            }
          ]
        };
      }),
      libraryParts: []
    },
    cassette: {
      occurrences: sourceTree.workpieces.map(workpiece => ({
        id: workpiece.occurrenceId || workpiece.id,
        ref: workpiece.definitionId || `${workpiece.id}_def`,
        placement: workpiece.placement || {
          relativeTo: 'world',
          origin: ['0', '0', '0'],
          rotation: ['0', '0', '0']
        }
      })),
      joints: getCassetteV2WorkpieceRelations(sourceTree).map(relation => ({
        id: relation.id,
        type: relation.type,
        method: relation.method,
        source: relation.source,
        target: relation.target,
        placement: relation.placement
      }))
    },
    extensions: {
      perigram: {
        graphTree: sourceTree
      }
    }
  };
};

const cloneGraph = (graph) => JSON.parse(JSON.stringify(graph));

const findGraphNodeByLabel = (graph, label) => {
  return Object.values(graph?.nodes || {}).find(node => node.label === label);
};

const findGraphNodeByLabelInList = (nodes, label) => nodes.find(node => node.label === label);

const eachGraphParameter = (node, callback) => {
  for (const side of ['input', 'output']) {
    for (const parameter of node[side]?.parameters || []) {
      callback(parameter, side);
    }
  }
};

const stripNumericNodiHintsForBrowserLoader = (graph) => {
  for (const node of Object.values(graph?.nodes || {})) {
    eachGraphParameter(node, (parameter) => {
      if (typeof parameter.hint === 'number') {
        parameter.hint = '';
      }
    });
  }
  return graph;
};

export const setGraphNumberInput = (graph, label, value) => {
  const node = findGraphNodeByLabel(graph, label);
  if (!node) throw new Error(`Missing Nodi input label: ${label}`);

  node.entity ||= {};
  node.entity.data ||= {};
  node.entity.data.value = value;
  return node;
};

export const applyTrapezoidInputsToGraph = (graph, trapezoid) => {
  for (const [key, label] of Object.entries(GRAPH_LABELS)) {
    setGraphNumberInput(graph, label, trapezoid[key]);
  }
};

const setNumberInputInNodes = (nodes, label, value) => {
  const node = findGraphNodeByLabelInList(nodes, label);
  if (!node) throw new Error(`Missing Nodi input label: ${label}`);

  node.entity ||= {};
  node.entity.data ||= {};
  node.entity.data.value = value;
};

const applyNodeInputsToGraphNodes = (nodes, node, parameters = {}) => {
  const trapezoid = resolvedNodeTrapezoid(node, parameters);

  for (const [key, label] of Object.entries(GRAPH_LABELS)) {
    setNumberInputInNodes(nodes, label, trapezoid[key]);
  }
};

const isOutputSink = (parameter) => !Array.isArray(parameter.connections) || parameter.connections.length === 0;

export const findBoundaryOutputRef = (graph) => {
  const nodes = Object.values(graph?.nodes || {});
  const labeledNode = nodes.find(node => ['out.boundary', 'boundary'].includes(node.label));
  const labeledOutput = labeledNode?.output?.parameters?.[0];
  if (labeledNode && labeledOutput) {
    return { nodeId: labeledNode.id, outputId: labeledOutput.id };
  }

  const polylineNode = nodes.find(node => (
    node.name === 'Polyline' &&
    (node.output?.parameters || []).some(parameter => parameter.name === 'resulting polyline' && isOutputSink(parameter))
  ));
  const polylineOutput = polylineNode?.output?.parameters?.find(parameter => (
    parameter.name === 'resulting polyline' && isOutputSink(parameter)
  ));

  return polylineNode && polylineOutput
    ? { nodeId: polylineNode.id, outputId: polylineOutput.id }
    : null;
};

const geometryRefMatches = (identifier, ref) => (
  ref &&
  identifier?.graphNodeSet?.nodeId === ref.nodeId &&
  identifier?.outputId === ref.outputId
);

const toSvgPoint = (point) => {
  const x = numeric(point?.[0], 0);
  const y = numeric(point?.[1], 0);
  return [x, -y];
};

const pointsEqual = (left, right) => (
  Math.abs(numeric(left?.[0], 0) - numeric(right?.[0], 0)) < 0.001 &&
  Math.abs(numeric(left?.[1], 0) - numeric(right?.[1], 0)) < 0.001
);

const withoutClosingVertex = (vertices = []) => {
  if (vertices.length < 2) return vertices;
  return pointsEqual(vertices[0], vertices[vertices.length - 1])
    ? vertices.slice(0, -1)
    : vertices;
};

const curveToPath = (vertices = []) => {
  const svgPoints = vertices.map(toSvgPoint);
  const commands = svgPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`);
  const isClosed = svgPoints.length > 2 && pointsEqual(svgPoints[0], svgPoints[svgPoints.length - 1]);
  return `${commands.join(' ')}${isClosed ? ' Z' : ''}`;
};

const viewBoxForCurves = (curves) => {
  const points = curves.flatMap(curve => curve.vertices || []).map(toSvgPoint);
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

const pointKey = (nodeId, edgeIndex) => `${nodeId}:E${edgeIndex}`;

const edgeIndexFromLabel = (value, fallback = 0) => {
  const match = String(value || '').match(/\d+/);
  return match ? Math.max(0, Math.round(numeric(match[0], fallback))) : fallback;
};

export const getCassetteV2FoldEdges = (tree = createCassetteV2GraphTree()) => {
  const folded = new Map();
  for (const node of tree.nodes || []) {
    if (!node.parentId) continue;
    folded.set(pointKey(node.parentId, node.parentEdgeIndex), node);
    folded.set(pointKey(node.id, edgeIndexFromLabel(node.attachEdge, 0)), node);
  }
  return folded;
};

const mapParameterConnections = (connections = [], parameterIdMap) => (
  connections
    .map(connectionId => parameterIdMap.get(connectionId))
    .filter(Boolean)
);

const cloneOperationGraph = (graph) => {
  const sourceNodes = Object.values(graph?.nodes || {});
  const nodeIdMap = new Map();
  const parameterIdMap = new Map();

  for (const node of sourceNodes) {
    nodeIdMap.set(node.id, createNodiGraphId());
    eachGraphParameter(node, (parameter) => {
      parameterIdMap.set(parameter.id, createNodiGraphId());
    });
  }

  const nodes = sourceNodes.map(sourceNode => {
    const node = cloneGraph(sourceNode);
    node.id = nodeIdMap.get(sourceNode.id);
    eachGraphParameter(node, (parameter) => {
      const sourceParameterId = parameter.id;
      parameter.id = parameterIdMap.get(sourceParameterId);
      parameter.connections = mapParameterConnections(parameter.connections || [], parameterIdMap);
      if (typeof parameter.hint === 'number') {
        parameter.hint = '';
      }
    });
    return node;
  });

  return {
    nodes,
    nodeIdMap,
    parameterIdMap
  };
};

const findOutputRefByLabel = (nodes, label) => {
  const node = findGraphNodeByLabelInList(nodes, label);
  const parameter = node?.output?.parameters?.[0];
  return node && parameter ? { nodeId: node.id, outputId: parameter.id } : null;
};

const findInputRefByLabel = (nodes, label) => {
  const node = findGraphNodeByLabelInList(nodes, label);
  const parameter = node?.input?.parameters?.[0];
  return node && parameter ? { nodeId: node.id, inputId: parameter.id } : null;
};

const findRootBaseOutputRef = (nodes) => {
  const labeledNode = nodes.find(node => ['rootBaseEdge', 'root.baseEdge', 'out.rootBaseEdge'].includes(node.label));
  const labeledOutput = labeledNode?.output?.parameters?.[0];
  if (labeledNode && labeledOutput) return { nodeId: labeledNode.id, outputId: labeledOutput.id };

  const lineNode = nodes.find(node => node.name === 'Line');
  const lineOutput = lineNode?.output?.parameters?.[0];
  return lineNode && lineOutput ? { nodeId: lineNode.id, outputId: lineOutput.id } : null;
};

const indexParameters = (graph) => {
  const parameters = new Map();
  for (const node of Object.values(graph?.nodes || {})) {
    eachGraphParameter(node, (parameter) => parameters.set(parameter.id, parameter));
  }
  return parameters;
};

const replaceInputConnection = (graph, inputId, outputId) => {
  const parameters = indexParameters(graph);
  const input = parameters.get(inputId);
  const output = parameters.get(outputId);
  if (!input || !output) return;

  for (const oldOutputId of input.connections || []) {
    const oldOutput = parameters.get(oldOutputId);
    if (oldOutput) {
      oldOutput.connections = (oldOutput.connections || []).filter(connectionId => connectionId !== inputId);
    }
  }

  input.connections = [outputId];
  output.connections ||= [];
  if (!output.connections.includes(inputId)) {
    output.connections.push(inputId);
  }
};

const toNodiPoint = (point) => ([
  numeric(point?.[0], 0),
  numeric(point?.[1], 0),
  numeric(point?.[2], 0)
]);

const addParentPolylineInputCurve = (graph, vertices = []) => {
  const points = withoutClosingVertex(vertices).map(toNodiPoint);
  if (points.length < 2) throw new Error('Parent boundary must contain at least two vertices');

  const pointOutputs = [];
  const polylineInputId = createNodiGraphId();
  for (const point of points) {
    const nodeId = createNodiGraphId();
    const outputId = createNodiGraphId();
    graph.nodes[nodeId] = {
      id: nodeId,
      name: 'Construct Point',
      label: '',
      input: {
        parameters: [
          { id: createNodiGraphId(), name: 'x', access_type: 'Item', hint: '', connections: [] },
          { id: createNodiGraphId(), name: 'y', access_type: 'Item', hint: '', connections: [] },
          { id: createNodiGraphId(), name: 'z', access_type: 'Item', hint: '', connections: [] }
        ]
      },
      output: {
        parameters: [
          { id: outputId, name: 'point', access_type: 'Item', hint: '', connections: [polylineInputId] }
        ]
      },
      entity: {
        variant: 'ConstructPoint',
        data: { x: point[0], y: point[1], z: point[2] }
      },
      enabled: true,
      visible: false
    };
    pointOutputs.push(outputId);
  }

  const polylineNodeId = createNodiGraphId();
  const polylineOutputId = createNodiGraphId();
  graph.nodes[polylineNodeId] = {
    id: polylineNodeId,
    name: 'Polyline',
    label: 'adapter.parentPolygon',
    input: {
      parameters: [
        {
          id: polylineInputId,
          name: 'vertex points',
          access_type: 'List',
          hint: '',
          connections: [...pointOutputs]
        },
        {
          id: createNodiGraphId(),
          name: 'close polyline',
          access_type: 'Item',
          hint: '',
          connections: []
        }
      ]
    },
    output: {
      parameters: [
        { id: polylineOutputId, name: 'resulting polyline', access_type: 'Item', hint: '', connections: [] }
      ]
    },
    entity: {
      variant: 'Polyline',
      data: { closed: true }
    },
    enabled: true,
    visible: false
  };

  return { nodeId: polylineNodeId, outputId: polylineOutputId };
};

export const buildCassetteV2FaceGraph = (node, templateGraph = {}, parentBoundaryVertices = null, parameters = {}) => {
  const graph = cloneGraph(templateGraph);
  graph.nodes ||= {};
  graph.sub_graphs ||= {};
  applyNodeInputsToGraphNodes(Object.values(graph.nodes), node, nodeParameterScope(parameters));

  const parentPolygonInput = findInputRefByLabel(Object.values(graph.nodes), 'parentPolygon');
  const rootBaseOutput = findRootBaseOutputRef(Object.values(graph.nodes));
  const boundaryOutput = findOutputRefByLabel(Object.values(graph.nodes), 'out.boundary');
  let parentOutput = null;

  if (parentPolygonInput?.inputId) {
    parentOutput = parentBoundaryVertices?.length
      ? addParentPolylineInputCurve(graph, parentBoundaryVertices)
      : rootBaseOutput;

    if (parentOutput?.outputId) {
      replaceInputConnection(graph, parentPolygonInput.inputId, parentOutput.outputId);
    }
  }

  stripNumericNodiHintsForBrowserLoader(graph);
  return {
    graph,
    node,
    parentPolygonInput,
    parentOutput,
    rootBaseOutput,
    boundaryOutput
  };
};

export const composeCassetteV2NodiGraph = (tree = createCassetteV2GraphTree(), templateGraph = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const nodes = Array.isArray(sourceTree.nodes) ? sourceTree.nodes : [];
  const parameters = treeParameters(sourceTree);
  const graph = {
    nodes: {},
    sub_graphs: cloneGraph(templateGraph.sub_graphs || {})
  };
  const faces = [];

  for (const node of nodes) {
    const clone = cloneOperationGraph(templateGraph);
    applyNodeInputsToGraphNodes(clone.nodes, node, parameters);

    for (const graphNode of clone.nodes) {
      graph.nodes[graphNode.id] = graphNode;
    }

    faces.push({
      node,
      parentPolygonInput: findInputRefByLabel(clone.nodes, 'parentPolygon'),
      rootBaseOutput: findRootBaseOutputRef(clone.nodes),
      boundaryOutput: findOutputRefByLabel(clone.nodes, 'out.boundary')
    });
  }

  const faceById = new Map(faces.map(face => [face.node.id, face]));
  for (const face of faces) {
    if (!face.node.parentId) {
      if (face.rootBaseOutput?.outputId && face.parentPolygonInput?.inputId) {
        replaceInputConnection(graph, face.parentPolygonInput.inputId, face.rootBaseOutput.outputId);
      }
      continue;
    }

    const parentFace = faceById.get(face.node.parentId);
    if (!parentFace?.boundaryOutput?.outputId || !face.parentPolygonInput?.inputId) continue;
    replaceInputConnection(graph, face.parentPolygonInput.inputId, parentFace.boundaryOutput.outputId);
  }

  return { graph, faces };
};

const designerEdgesForBoundary = (nodeId, vertices = [], foldedEdges = new Map(), terminalEdges = new Set()) => {
  const boundaryVertices = withoutClosingVertex(vertices);
  return boundaryVertices
    .map((vertex, edgeIndex) => {
      if (foldedEdges.has(pointKey(nodeId, edgeIndex))) return null;
      // A profile-arranged edge is terminal: the profile consumes it,
      // the face ends here — no + affordance, nothing attaches.
      if (terminalEdges.has(`${nodeId}:${edgeIndex}`)) return null;

      const next = boundaryVertices[(edgeIndex + 1) % boundaryVertices.length];
      const [x1, y1] = toSvgPoint(vertex);
      const [x2, y2] = toSvgPoint(next);
      const length = Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));

      return {
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        length,
        nodeId,
        edgeIndex,
        label: '+'
      };
    })
    .filter(Boolean);
};

const designerFoldEdgesForTree = (curves = [], tree = createCassetteV2GraphTree()) => {
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  return (tree.nodes || [])
    .filter(node => node.parentId)
    .map((node) => {
      const parentCurve = curveById.get(node.parentId);
      const parentVertices = withoutClosingVertex(
        parentCurve?.referenceVertices ||
        parentCurve?.originalBoundaryVertices ||
        parentCurve?.boundaryVertices ||
        parentCurve?.vertices ||
        []
      );
      const edgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
      const vertex = parentVertices[edgeIndex];
      const next = parentVertices[(edgeIndex + 1) % parentVertices.length];
      if (!vertex || !next) return null;

      const [x1, y1] = toSvgPoint(vertex);
      const [x2, y2] = toSvgPoint(next);
      const angle = displayAngle(foldAngleFromNode(node));
      return {
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        nodeId: node.parentId,
        edgeIndex,
        foldNodeId: node.id,
        workpieceId: node.workpieceId,
        angle,
        label: angle
      };
    })
    .filter(Boolean);
};

const designerAssemblyLayerOpacity = (workpieceId, contextWorkpieceId) => (
  !contextWorkpieceId || workpieceId === contextWorkpieceId ? 1 : 0.28
);

const designerAssemblyFillOpacity = (workpieceId, contextWorkpieceId) => (
  !contextWorkpieceId || workpieceId === contextWorkpieceId ? 0.1 : 0.035
);

const groupedCurvesByWorkpiece = (curves = []) => {
  const groups = new Map();
  for (const curve of curves) {
    const workpieceId = curve.node?.workpieceId || '';
    if (!groups.has(workpieceId)) groups.set(workpieceId, []);
    groups.get(workpieceId).push(curve);
  }
  return groups;
};

const designerAssemblyLayersForCurves = async (curves = [], extraLayers = [], options = {}) => {
  const contextWorkpieceId = options.contextWorkpieceId || '';
  const facePaths = [];
  const cutPaths = [];
  const foldPaths = [];

  for (const [workpieceId, groupCurves] of groupedCurvesByWorkpiece(curves)) {
    const layout = await buildOccsProductionLayout(
      groupCurves.map(curve => ({
        id: curve.id || curve.nodeId || curve.node?.id,
        vertices: curve.boundaryVertices || curve.vertices
      })),
      options
    );
    const opacity = designerAssemblyLayerOpacity(workpieceId, contextWorkpieceId);
    facePaths.push(...layout.cutOuterPaths.map(vertices => ({
      d: occsCurveToPath(vertices),
      fill: 'layer',
      stroke: 'none',
      opacity: designerAssemblyFillOpacity(workpieceId, contextWorkpieceId),
      workpieceId
    })));
    cutPaths.push(...layout.cutOuterPaths.map(vertices => ({
      d: occsCurveToPath(vertices),
      fill: 'none',
      stroke: 'layer',
      opacity,
      workpieceId
    })));
    foldPaths.push(...layout.foldPaths.map(vertices => ({
      d: occsCurveToPath(vertices),
      fill: 'none',
      stroke: 'layer',
      opacity,
      workpieceId
    })));
  }
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
      paths: cutPaths
    }
  ];

  if (foldPaths.length) {
    layers.push({
      name: occsLayerExportName(OCCS_LAYER_FOLD_ROUTE),
      standardCode: OCCS_LAYER_FOLD_ROUTE,
      role: 'fold',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: foldPaths
    });
  }
  for (const layer of extraLayers) {
    if (Array.isArray(layer?.paths) && layer.paths.length) layers.push(layer);
  }
  return layers;
};

const markerFromPoint = (point = [0, 0], data = {}) => {
  const [x, y] = toSvgPoint(point);
  return {
    ...data,
    x,
    y
  };
};

const designerAttachmentMarkersForTree = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const contextWorkpieceId = options.contextWorkpieceId || '';
  const selectedRelationId = options.selectedRelationId || '';
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  return getCassetteV2WorkpieceRelations(tree)
    .filter(relation => (
      !contextWorkpieceId ||
      relation.sourceWorkpieceId === contextWorkpieceId ||
      relation.targetWorkpieceId === contextWorkpieceId
    ))
    .flatMap((relation) => {
      const sourceCurve = curveById.get(relation.sourceFaceId);
      const targetCurve = curveById.get(relation.targetFaceId);
      const active = !selectedRelationId || selectedRelationId === relation.id;
      const markers = [];
      if (targetCurve) {
        markers.push(markerFromPoint(faceSnapPoint(targetCurve.boundaryVertices || targetCurve.vertices, relation.targetSnap), {
          id: `${relation.id}:target`,
          relationId: relation.id,
          workpieceId: relation.targetWorkpieceId,
          faceId: relation.targetFaceId,
          role: 'target',
          snap: relation.targetSnap,
          label: 'T',
          active
        }));
      }
      if (sourceCurve) {
        markers.push(markerFromPoint(faceSnapPoint(sourceCurve.boundaryVertices || sourceCurve.vertices, relation.sourceSnap), {
          id: `${relation.id}:source`,
          relationId: relation.id,
          workpieceId: relation.sourceWorkpieceId,
          faceId: relation.sourceFaceId,
          role: 'source',
          snap: relation.sourceSnap,
          label: 'S',
          active
        }));
      }
      return markers;
    });
};

const relationHardwareWorkpiece = (tree, relation) => (
  tree.workpieces.find(workpiece => workpiece.id === relation.sourceWorkpieceId && (
    isOccsHardwareWorkpiece(workpiece) || workpiece.family
  )) || null
);

const relationProfileWorkpiece = (tree, relation) => (
  tree.workpieces.find(workpiece => workpiece.id === relation.sourceWorkpieceId && isCassetteV2ProfileWorkpiece(workpiece)) || null
);

const hardwarePointsForRelation = (curve, relation, parameters = {}) => {
  const vertices = curve?.boundaryVertices || curve?.vertices || [];
  if (relation.pattern?.type === 'edgeArray') {
    return expandOccsEdgeArray2d({
      vertices,
      pattern: relation.pattern,
      origin: [relation.offsetX, relation.offsetY],
      binding: relation.targetSnap,
      resolve: (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback)
    }).map(point => [point.x, point.y, 0]);
  }
  const snap = faceSnapPoint(vertices, relation.targetSnap);
  return [[
    numeric(snap?.[0], 0) + resolveCassetteV2Expression(relation.offsetX, parameters, 0),
    numeric(snap?.[1], 0) + resolveCassetteV2Expression(relation.offsetY, parameters, 0),
    0
  ]];
};

const designerHardwareMarkersForTree = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  return getCassetteV2WorkpieceRelations(sourceTree)
    .flatMap((relation) => {
      const hardware = relationHardwareWorkpiece(sourceTree, relation);
      if (!hardware) return [];
      if (options.contextWorkpieceId && ![relation.sourceWorkpieceId, relation.targetWorkpieceId].includes(options.contextWorkpieceId)) {
        return [];
      }
      const targetCurve = curveById.get(relation.targetFaceId);
      if (!targetCurve) return [];
      return hardwarePointsForRelation(targetCurve, relation, parameters).map((point, index) => markerFromPoint(point, {
        id: `${relation.id}:hardware:${index}`,
        relationId: relation.id,
        workpieceId: relation.sourceWorkpieceId,
        faceId: relation.targetFaceId,
        role: 'hardware',
        snap: relation.targetSnap,
        label: String(hardware.family || hardware.hardware?.family || 'H').slice(0, 1).toUpperCase(),
        active: !options.selectedRelationId || options.selectedRelationId === relation.id
      }));
    });
};

const hardwareSchematicLayer = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const markers = designerHardwareMarkersForTree(curves, tree, options);
  return {
    name: occsLayerExportName(OCCS_LAYER_CODE_CASSETTE_MARK),
    standardCode: OCCS_LAYER_CODE_CASSETTE_MARK,
    role: 'hardware',
    color: 'currentColor',
    weight: 1,
    dasharray: 'none',
    paths: markers.map(marker => ({
      kind: 'text',
      x: marker.x,
      y: marker.y,
      text: marker.label,
      fill: 'layer',
      fontSize: 12,
      textAnchor: 'middle',
      dominantBaseline: 'middle',
      workpieceId: marker.workpieceId,
      relationId: marker.relationId,
      markKind: 'hardware'
    }))
  };
};

// Projects a point onto a closed polygon's nearest edge: returns the
// inserted vertex and the edge index it splits. Null when degenerate.
const projectOnContour = (vertices = [], point = [0, 0]) => {
  const count = vertices.length;
  if (count < 2) return null;
  let best = null;
  for (let index = 0; index < count; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % count];
    const ax = numeric(a?.[0], 0);
    const ay = numeric(a?.[1], 0);
    const bx = numeric(b?.[0], 0);
    const by = numeric(b?.[1], 0);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSquared))
      : 0;
    const projected = [ax + dx * t, ay + dy * t, 0];
    const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1]);
    if (!best || distance < best.distance) {
      best = { distance, projected, insertAt: (index + 1) % (count + 1) };
    }
  }
  return best ? { point: best.projected, insertAt: best.insertAt } : null;
};

// Splits a closed contour at two break points into the two open chains
// between them (A→B and B→A along the contour). Null when the projection
// is degenerate.
const splitContourAtBreaks = (vertices = [], first = [0, 0], second = [0, 0]) => {
  const ring = withoutClosingVertex(vertices).map(vertex => (
    [numeric(vertex?.[0], 0), numeric(vertex?.[1], 0), 0]
  ));
  if (ring.length < 3) return null;
  const a = projectOnContour(ring, first);
  const b = projectOnContour(ring, second);
  if (!a || !b) return null;
  let split = [...ring];
  for (const cut of [a, b].sort((left, right) => right.insertAt - left.insertAt)) {
    if (cut.insertAt >= split.length) split.push(cut.point);
    else split.splice(cut.insertAt, 0, cut.point);
  }
  const indexA = split.findIndex(vertex => vertex === a.point);
  const indexB = split.findIndex(vertex => vertex === b.point);
  if (indexA < 0 || indexB < 0 || indexA === indexB) return null;
  const forward = indexA < indexB
    ? split.slice(indexA, indexB + 1)
    : [...split.slice(indexA), ...split.slice(0, indexB + 1)];
  const backward = indexA < indexB
    ? [...split.slice(indexB), ...split.slice(0, indexA + 1)]
    : split.slice(indexB, indexA + 1);
  return [forward, backward];
};

// The open-profile edge embeddings for a tree (owner law, 2026-10-15):
// every open profile attached through a relation places by its array
// settings alone — the profile's start and end anchors lie ON the bound
// host edge — and the whole edge is replaced by the composite chain
// (host start, straight runs, copy chains, host end). The pure geometry
// lives in occs/profileEmbedding.js; the designer section layer draws
// the copies and the composite, and the evaluated production data
// splices the composite into the host contour.
export const profileEdgeEmbeddingsForTree = (curves = [], tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const results = [];
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    const targetCurve = curveById.get(relation.targetFaceId);
    if (!targetCurve) continue;
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const open = profile.section?.open || profile.section?.type === 'polyline';
    if (!open) continue;
    const contour = targetCurve.originalBoundaryVertices
      || targetCurve.referenceVertices
      || targetCurve.boundaryVertices
      || targetCurve.vertices;
    results.push({
      relationId: relation.id,
      profileWorkpieceId: relation.sourceWorkpieceId,
      targetWorkpieceId: relation.targetWorkpieceId,
      targetFaceId: relation.targetFaceId,
      placement: {
        offsetX: relation.offsetX,
        targetSnap: relation.targetSnap,
        mirrorX: relation.mirrorX,
        mirrorY: relation.mirrorY,
        pattern: relation.pattern
      },
      embedding: embedOccsProfileEdge({
        section: profile.section,
        vertices: contour,
        relation,
        resolve: (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback)
      })
    });
  }
  return results;
};

// Owner law (2026-10-15, profiles are terminal): an edge carrying an
// arranged profile is the end of the face — the profile consumes the
// edge, nothing grows from it and nothing attaches to it. Keyed
// `${faceId}:${edgeIndex}` over every edge-array profile relation; an
// open profile without an explicit pattern embeds on E0 (the embedding
// default) and terminates that edge too.
export const profileTerminalEdgesForTree = (tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const terminal = new Set();
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    let edge = relation.pattern?.type === 'edgeArray' ? relation.pattern.edge : null;
    if (!edge) {
      const profile = normalizeCassetteV2Profile(workpiece, parameters);
      const open = profile.section?.open || profile.section?.type === 'polyline';
      if (!open) continue; // closed profiles place by point without a pattern
      edge = 'E0';
    }
    const match = String(edge).match(/\d+/);
    if (!match) continue;
    terminal.add(`${relation.targetFaceId}:${Math.max(0, Math.round(numeric(match[0], 0)))}`);
  }
  return terminal;
};

// Closed profile sections arranged on a face produce their production
// effect (owner law 2026-10-15): the array settings (or the point
// placement) place the section copies and each copy cuts the host face
// where it intersects — the same boolean pipeline and the same
// cut.inner layer the integral-cut hanger clips ride. Sections that
// fall entirely outside the face stay boolean-only operands.
export const profileCutEntitiesForTree = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const entities = [];
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    if (options.contextWorkpieceId && ![relation.sourceWorkpieceId, relation.targetWorkpieceId].includes(options.contextWorkpieceId)) {
      continue;
    }
    const targetCurve = curveById.get(relation.targetFaceId);
    if (!targetCurve) continue;
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const open = profile.section?.open || profile.section?.type === 'polyline';
    if (open) continue; // open profiles consume the edge through the contour embedding
    hardwarePointsForRelation(targetCurve, relation, parameters).forEach((point, index) => {
      const vertices = profileCutPolygon(workpiece, point, relation, parameters);
      if (!vertices) return;
      entities.push({
        id: `${relation.id}:profile_cut:${index}`,
        layer: OCCS_LAYER_CUT_INNER,
        target: relation.targetFaceId,
        workpieceId: relation.targetWorkpieceId,
        profileWorkpieceId: relation.sourceWorkpieceId,
        relationId: relation.id,
        geometry: { type: 'polygon', vertices },
        booleanOperation: true,
        booleanOnly: !polygonInsideFace(
          vertices,
          targetCurve.originalBoundaryVertices || targetCurve.referenceVertices || targetCurve.boundaryVertices || targetCurve.vertices
        )
      });
    });
  }
  return entities;
};

const circlePathAt = (point = [0, 0], diameter = 5) => {
  const radius = Math.max(0.1, Number(diameter) / 2 || 2.5);
  const [cx, cy] = toSvgPoint(point);
  return [
    `M ${cx - radius} ${cy}`,
    `A ${radius} ${radius} 0 1 0 ${cx + radius} ${cy}`,
    `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`,
    'Z'
  ].join(' ');
};

const pointInPolygon = (point = [0, 0], polygon = []) => {
  const vertices = withoutClosingVertex(polygon);
  if (vertices.length < 3) return false;
  const x = numeric(point?.[0], 0);
  const y = numeric(point?.[1], 0);
  let inside = false;

  for (let index = 0, previousIndex = vertices.length - 1; index < vertices.length; previousIndex = index, index += 1) {
    const current = vertices[index];
    const previous = vertices[previousIndex];
    const xi = numeric(current?.[0], 0);
    const yi = numeric(current?.[1], 0);
    const xj = numeric(previous?.[0], 0);
    const yj = numeric(previous?.[1], 0);
    const crosses = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi);
    if (crosses) inside = !inside;
  }

  return inside;
};

const polygonInsideFace = (polygon = [], face = []) => {
  const faceVertices = withoutClosingVertex(face);
  return withoutClosingVertex(polygon).every(point => pointInPolygon(point, faceVertices));
};

const mirroredProfileVertex = (vertex = [], relation = {}) => [
  numeric(vertex?.[0], 0) * (relation.mirrorX ? -1 : 1),
  numeric(vertex?.[1], 0) * (relation.mirrorY ? -1 : 1)
];

const profileCutPolygon = (workpiece = {}, point = [0, 0, 0], relation = {}, scope = {}) => {
  if (!workpiece.profileSnapshot && !workpiece.profile) return null;
  const profile = normalizeCassetteV2Profile(workpiece, scope);
  const section = Array.isArray(profile.section?.vertices) ? profile.section : null;
  if (!section) return null;
  // The cut follows the drawable chain — authored fillet corners
  // resolved to their arc points.
  const vertices = occProfileSectionChainedVertices(section);
  if (vertices.length < 3) return null;
  // An anchored profile cuts anchor-relative: the anchor vertex lands on
  // the placement point. Mirrors apply before the relation's rotation,
  // the same order every profile placement uses.
  const anchor = profile.section?.anchor;
  const rotation = resolveCassetteV2AngleExpression(relation.rotation || '0', scope, 0);
  return vertices.map((vertex) => {
    const local = anchor
      ? [numeric(vertex?.[0], 0) - numeric(anchor[0], 0), numeric(vertex?.[1], 0) - numeric(anchor[1], 0)]
      : [numeric(vertex?.[0], 0), numeric(vertex?.[1], 0)];
    const placed = rotation
      ? rotate2d(mirroredProfileVertex(local, relation), rotation)
      : mirroredProfileVertex(local, relation);
    return [
      numeric(point?.[0], 0) + placed[0],
      numeric(point?.[1], 0) + placed[1],
      0
    ];
  });
};

const hardwareProductionEntitiesForTree = (curves = [], tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  return getCassetteV2WorkpieceRelations(sourceTree)
    .flatMap((relation) => {
      const workpiece = relationHardwareWorkpiece(sourceTree, relation);
      if (!workpiece) return [];
      const hardware = normalizeCassetteV2Hardware(workpiece);
      const targetCurve = curveById.get(relation.targetFaceId);
      if (!targetCurve) return [];
      const points = hardwarePointsForRelation(targetCurve, relation, parameters);
      if (hardware.family === 'hanger_clip' && hardware.productionMode === 'integralCut') {
        return points.map((point, index) => ({
          id: `${relation.id}:hook_cut:${index}`,
          layer: OCCS_LAYER_CUT_INNER,
          target: relation.targetFaceId,
          workpieceId: relation.targetWorkpieceId,
          hardwareWorkpieceId: relation.sourceWorkpieceId,
          relationId: relation.id,
          geometry: {
            type: 'polygon',
            vertices: profileCutPolygon(workpiece, point, relation, parameters) || hangerClipCutPolygon(hardware.parameters, point)
          }
        })).map((entity) => ({
          ...entity,
          booleanOperation: true,
          booleanOnly: !polygonInsideFace(
            entity.geometry.vertices,
            targetCurve.originalBoundaryVertices || targetCurve.referenceVertices || targetCurve.boundaryVertices || targetCurve.vertices
          )
        }));
      }
      if (OCCS_HOLE_HARDWARE_FAMILIES.includes(hardware.family)) {
        return points.map((point, index) => ({
          id: `${relation.id}:hole:${index}`,
          layer: OCCS_LAYER_CUT_HOLE,
          target: relation.targetFaceId,
          workpieceId: relation.targetWorkpieceId,
          hardwareWorkpieceId: relation.sourceWorkpieceId,
          relationId: relation.id,
          geometry: {
            type: 'circle',
            center: point,
            diameter: hardwareHoleDiameter(hardware)
          }
        }));
      }
      return [];
    });
};

const hardwareProductionLayers = (entities = []) => {
  const pathsForLayer = (layer) => entities
    .filter(entity => entity.layer === layer && !entity.booleanOnly)
    .map(entity => ({
      d: entity.geometry.type === 'circle'
        ? circlePathAt(entity.geometry.center, entity.geometry.diameter)
        : occsCurveToPath(entity.geometry.vertices),
      fill: 'none',
      stroke: 'layer',
      workpieceId: entity.workpieceId,
      hardwareWorkpieceId: entity.hardwareWorkpieceId,
      relationId: entity.relationId,
      productionEntityId: entity.id
    }));
  const layers = [];
  const innerPaths = pathsForLayer(OCCS_LAYER_CUT_INNER);
  const holePaths = pathsForLayer(OCCS_LAYER_CUT_HOLE);
  if (innerPaths.length) {
    layers.push({
      name: occsLayerExportName(OCCS_LAYER_CUT_INNER),
      standardCode: OCCS_LAYER_CUT_INNER,
      role: 'cut',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: innerPaths
    });
  }
  if (holePaths.length) {
    layers.push({
      name: occsLayerExportName(OCCS_LAYER_CUT_HOLE),
      standardCode: OCCS_LAYER_CUT_HOLE,
      role: 'cut',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: holePaths
    });
  }
  return layers;
};

const hookCutEntitiesByTarget = (entities = []) => {
  const byTarget = new Map();
  for (const entity of entities) {
    if (!entity.booleanOperation && entity.layer !== OCCS_LAYER_CUT_INNER) continue;
    if (entity.geometry?.type !== 'polygon') continue;
    if (!byTarget.has(entity.target)) byTarget.set(entity.target, []);
    byTarget.get(entity.target).push(entity);
  }
  return byTarget;
};

const applyHardwareBooleanDifferences = async (curves = [], productionEntities = []) => {
  const cutsByTarget = hookCutEntitiesByTarget(productionEntities);
  if (!cutsByTarget.size) return curves;

  return Promise.all(curves.map(async (curve) => {
    const cuts = cutsByTarget.get(curve.node?.id);
    if (!cuts?.length) return curve;
    const difference = await differenceCassetteV2FacePolygon(
      curve.boundaryVertices || curve.vertices,
      cuts.map(entity => entity.geometry.vertices)
    );
    if (!difference.outer?.length) return curve;
    return {
      ...curve,
      originalBoundaryVertices: curve.originalBoundaryVertices || curve.boundaryVertices || curve.vertices,
      referenceVertices: curve.referenceVertices || curve.boundaryVertices || curve.vertices,
      boundaryVertices: difference.outer,
      vertices: difference.outer,
      holes: difference.holes,
      shapeType: 'polygon'
    };
  }));
};

const centroidForVertices = (vertices = []) => {
  const points = withoutClosingVertex(vertices);
  if (!points.length) return { x: 0, y: 0 };
  const total = points.reduce((acc, point) => ({
    x: acc.x + numeric(point?.[0], 0),
    y: acc.y + numeric(point?.[1], 0)
  }), { x: 0, y: 0 });
  const center = {
    x: total.x / points.length,
    y: total.y / points.length
  };
  const [svgX, svgY] = toSvgPoint([center.x, center.y]);
  return { x: svgX, y: svgY };
};

const offsetControlsForNode = (node, vertices = []) => {
  const points = withoutClosingVertex(vertices).map(toSvgPoint);
  const controls = [
    { key: 'baseStartOffset', pointIndex: 0 },
    { key: 'baseEndOffset', pointIndex: 1 },
    { key: 'topEndOffset', pointIndex: 2 },
    { key: 'topStartOffset', pointIndex: 3 }
  ];

  return controls
    .map((control) => {
      const point = points[control.pointIndex];
      if (!point) return null;
      return {
        ...control,
        nodeId: node.id,
        value: expressionValue(node.parameters?.[control.key], DEFAULT_CASSETTE_V2_TRAPEZOID[control.key]),
        x: point[0],
        y: point[1]
      };
    })
    .filter(Boolean);
};

const dimensionControlsForNode = (node, vertices = []) => {
  const points = withoutClosingVertex(vertices).map(toSvgPoint);
  const controls = [];
  if (points[0] && points[1] && node.parameters?.defaultLength !== 'inherit') {
    controls.push({
      key: 'defaultLength',
      nodeId: node.id,
      value: expressionValue(node.parameters?.defaultLength, DEFAULT_CASSETTE_V2_TRAPEZOID.defaultLength),
      x: (points[0][0] + points[1][0]) / 2,
      y: (points[0][1] + points[1][1]) / 2 + 24
    });
  }
  if (points[1] && points[2]) {
    controls.push({
      key: 'height',
      nodeId: node.id,
      value: expressionValue(node.parameters?.height, DEFAULT_CASSETTE_V2_TRAPEZOID.height),
      x: (points[1][0] + points[2][0]) / 2 + 24,
      y: (points[1][1] + points[2][1]) / 2
    });
  }
  return controls;
};

const clampRatio = (value, fallback = 0.5) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.min(1, numericValue));
};

const curveBounds = (curves = []) => {
  const points = curves
    .flatMap(curve => curve.boundaryVertices || curve.vertices || [])
    .filter(Boolean);
  if (!points.length) return null;
  const xs = points.map(point => numeric(point?.[0], 0));
  const ys = points.map(point => numeric(point?.[1], 0));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
};

const cassetteMarkText = (workpiece = {}, index = 0, context = {}) => {
  const templateName = String(context.templateName || context.name || 'Cassette template').trim() || 'Cassette template';
  const templateId = String(context.templateId || context.id || 'draft').trim() || 'draft';
  const workpieceNumber = Number.isFinite(Number(context.workpieceIndex))
    ? Number(context.workpieceIndex)
    : index + 1;
  return `${templateName}\n${templateId}\nWP ${workpieceNumber}`;
};

const mainCurveForWorkpiece = (curves = [], workpiece = {}) => (
  curves.find(curve => curve.node?.id === workpiece.rootId) ||
  curves.find(curve => curve.node?.workpieceId === workpiece.id && faceRoleFromNode(curve.node) === 'main') ||
  curves.find(curve => curve.node?.workpieceId === workpiece.id) ||
  null
);

const cassetteMarkPointForCurve = (curve = null) => {
  if (!curve) return null;
  const points = withoutClosingVertex(curve.boundaryVertices || curve.vertices || []);
  if (!points.length) return null;
  const xs = points.map(point => numeric(point?.[0], 0));
  const ys = points.map(point => numeric(point?.[1], 0));
  return [
    Math.min(...xs) + DEFAULT_CASSETTE_V2_MARK_OFFSET,
    Math.min(...ys) + DEFAULT_CASSETTE_V2_MARK_OFFSET,
    0
  ];
};

export const buildCassetteV2CassetteMarkLayerData = (curves = [], tree = createCassetteV2GraphTree(), context = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  return sourceTree.workpieces
    .map((workpiece, index) => {
      const curve = mainCurveForWorkpiece(curves, workpiece);
      const point = cassetteMarkPointForCurve(curve);
      if (!point) return null;
      return {
        id: `mark_${workpiece.id}`,
        layer: OCCS_LAYER_CODE_CASSETTE_MARK,
        role: 'mark',
        markKind: 'cassette',
        workpieceId: workpiece.id,
        workpieceDefinitionId: workpiece.definitionId || `${workpiece.id}_def`,
        occurrenceId: occurrenceIdForWorkpiece(workpiece),
        target: curve.node?.id || workpiece.rootId,
        geometry: {
          type: 'text',
          point: [point[0], point[1]],
          text: cassetteMarkText(workpiece, index, context),
          fontSize: numeric(context.fontSize, 12),
          textAnchor: 'start',
          dominantBaseline: 'hanging'
        },
        handles: [`${workpiece.id}:M1`]
      };
    })
    .filter(Boolean);
};

export const buildCassetteV2CassetteMarkLayer = (curves = [], tree = createCassetteV2GraphTree(), context = {}) => {
  const marks = buildCassetteV2CassetteMarkLayerData(curves, tree, context);
  return {
    name: occsLayerExportName(OCCS_LAYER_CODE_CASSETTE_MARK),
    standardCode: OCCS_LAYER_CODE_CASSETTE_MARK,
    role: 'mark',
    color: 'currentColor',
    weight: 1,
    dasharray: 'none',
    paths: marks.map(mark => {
      const [x, y] = toSvgPoint([mark.geometry.point[0], mark.geometry.point[1], 0]);
      return {
        kind: 'text',
        x,
        y,
        text: mark.geometry.text,
        fill: 'layer',
        fontSize: mark.geometry.fontSize,
        textAnchor: mark.geometry.textAnchor,
        dominantBaseline: mark.geometry.dominantBaseline,
        workpieceId: mark.workpieceId,
        markKind: mark.markKind
      };
    })
  };
};

const sectionPlaneRatio = (tree, orientation) => clampRatio(
  tree?.sections?.[orientation]?.ratio,
  DEFAULT_CASSETTE_V2_SECTION_PLANES[orientation]?.ratio ?? 0.5
);

const sectionPath = (points = []) => {
  if (points.length < 2) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ');
};

const dedupe3dPoints = (points = [], tolerance = 0.001) => {
  const next = [];
  for (const point of points) {
    const exists = next.some(item => (
      Math.abs(item[0] - point[0]) <= tolerance &&
      Math.abs(item[1] - point[1]) <= tolerance &&
      Math.abs(item[2] - point[2]) <= tolerance
    ));
    if (!exists) next.push(point);
  }
  return next;
};

const facePlaneIntersections = (points = [], axisIndex = 0, value = 0) => {
  const vertices = withoutClosingVertex(points);
  if (vertices.length < 2) return [];
  const intersections = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const startDistance = numeric(start?.[axisIndex], 0) - value;
    const endDistance = numeric(end?.[axisIndex], 0) - value;
    if (Math.abs(startDistance) <= 0.001) intersections.push(start);
    if (startDistance * endDistance < 0) {
      const t = Math.abs(startDistance) / (Math.abs(startDistance) + Math.abs(endDistance));
      intersections.push([
        numeric(start?.[0], 0) + (numeric(end?.[0], 0) - numeric(start?.[0], 0)) * t,
        numeric(start?.[1], 0) + (numeric(end?.[1], 0) - numeric(start?.[1], 0)) * t,
        numeric(start?.[2], 0) + (numeric(end?.[2], 0) - numeric(start?.[2], 0)) * t
      ]);
    }
  }
  return dedupe3dPoints(intersections);
};

const designerSectionsForTree = (curves = [], foldedPreview = {}, tree = createCassetteV2GraphTree()) => {
  const layer = {
    name: DESIGNER_SECTION_LAYER,
    standardCode: null,
    role: 'section',
    color: 'currentColor',
    weight: 1,
    dasharray: 'none',
    paths: []
  };
  const bounds = curveBounds(curves);
  if (!bounds) return { handles: [], segments: [], layer, viewBoxCurves: [] };

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const gap = Math.max(48, Math.min(96, Math.max(width, height) * 0.12));
  const verticalValue = bounds.minX + width * sectionPlaneRatio(tree, 'vertical');
  const horizontalValue = bounds.minY + height * sectionPlaneRatio(tree, 'horizontal');
  const minSvgY = -bounds.maxY;
  const maxSvgY = -bounds.minY;
  const sectionPreview = buildCassetteV2FoldedPreview(foldedPreview);
  const faces = Array.isArray(sectionPreview.faces) ? sectionPreview.faces : [];
  const segments = [];
  const viewBoxPoints = [];

  const addSegment = (orientation, svgPoints) => {
    if (svgPoints.length < 2) return;
    const segment = {
      orientation,
      d: sectionPath(svgPoints),
      points: svgPoints
    };
    segments.push(segment);
    layer.paths.push({
      d: segment.d,
      fill: 'none',
      stroke: 'layer',
      sectionKind: orientation
    });
    viewBoxPoints.push(...svgPoints);
  };

  for (const face of faces) {
    const points = face.points || [];
    const verticalHits = facePlaneIntersections(points, 0, verticalValue);
    if (verticalHits.length >= 2) {
      const sorted = verticalHits
        .slice()
        .sort((left, right) => (left[1] - right[1]) || (left[2] - right[2]));
      addSegment('vertical', [
        [bounds.minX - gap - sorted[0][2], -sorted[0][1]],
        [bounds.minX - gap - sorted[sorted.length - 1][2], -sorted[sorted.length - 1][1]]
      ]);
    }

    const horizontalHits = facePlaneIntersections(points, 1, horizontalValue);
    if (horizontalHits.length >= 2) {
      const sorted = horizontalHits
        .slice()
        .sort((left, right) => (left[0] - right[0]) || (left[2] - right[2]));
      addSegment('horizontal', [
        [sorted[0][0], minSvgY - gap - sorted[0][2]],
        [sorted[sorted.length - 1][0], minSvgY - gap - sorted[sorted.length - 1][2]]
      ]);
    }
  }

  const handles = [
    {
      orientation: 'vertical',
      value: verticalValue,
      minValue: bounds.minX,
      maxValue: bounds.maxX,
      x1: verticalValue,
      y1: minSvgY,
      x2: verticalValue,
      y2: maxSvgY
    },
    {
      orientation: 'horizontal',
      value: horizontalValue,
      minValue: bounds.minY,
      maxValue: bounds.maxY,
      x1: bounds.minX,
      y1: -horizontalValue,
      x2: bounds.maxX,
      y2: -horizontalValue
    }
  ];

  for (const handle of handles) {
    viewBoxPoints.push([handle.x1, handle.y1], [handle.x2, handle.y2]);
    layer.paths.push({
      d: `M ${handle.x1} ${handle.y1} L ${handle.x2} ${handle.y2}`,
      fill: 'none',
      stroke: 'layer',
      sectionKind: `${handle.orientation}-plane`
    });
  }

  return {
    layerName: DESIGNER_SECTION_LAYER,
    standardCode: null,
    handles,
    segments,
    layer,
    viewBoxCurves: viewBoxPoints.length
      ? [{ vertices: viewBoxPoints.map(point => [point[0], -point[1], 0]) }]
      : []
  };
};

const mergeCassetteMarkLayers = (...layers) => {
  const paths = layers.flatMap(layer => Array.isArray(layer?.paths) ? layer.paths : []);
  return {
    name: occsLayerExportName(OCCS_LAYER_CODE_CASSETTE_MARK),
    standardCode: OCCS_LAYER_CODE_CASSETTE_MARK,
    role: 'mark',
    color: 'currentColor',
    weight: 1,
    dasharray: 'none',
    paths
  };
};

const foldedPreviewProductionEntitiesForTree = (curves = [], tree = createCassetteV2GraphTree()) => (
  hardwareProductionEntitiesForTree(curves, tree)
    .filter(entity => !entity.booleanOnly)
    .map(entity => ({
      id: entity.id,
      layer: entity.layer,
      targetFaceId: entity.target,
      workpieceId: entity.workpieceId,
      relationId: entity.relationId,
      geometry: entity.geometry
    }))
);

const foldedPreviewBodiesForTree = (tree = createCassetteV2GraphTree(), parameters = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  return getCassetteV2WorkpieceRelations(sourceTree)
    .map((relation) => {
      // Profiles modify face geometry — they carry no geometry of their
      // own and never ride the body channel (owner law 2026-10-15);
      // their effect lives in the modified folded faces.
      if (relationProfileWorkpiece(sourceTree, relation)) return null;
      const workpiece = relationHardwareWorkpiece(sourceTree, relation);
      if (!workpiece) return null;
      const hardware = normalizeCassetteV2Hardware(workpiece);
      return {
        id: `${relation.id}:${workpiece.id}`,
        workpieceId: workpiece.id,
        relationId: relation.id,
        targetWorkpieceId: relation.targetWorkpieceId,
        targetFaceId: relation.targetFaceId,
        targetSnap: relation.targetSnap,
        targetSide: relation.targetSide,
        offsetX: resolveCassetteV2Expression(relation.offsetX, parameters, 0),
        offsetY: resolveCassetteV2Expression(relation.offsetY, parameters, 0),
        rotation: resolveCassetteV2AngleExpression(relation.rotation, parameters, 0),
        mirrorX: Boolean(relation.mirrorX),
        mirrorY: Boolean(relation.mirrorY),
        pattern: relation.pattern ? {
          ...relation.pattern,
          mode: relation.pattern.mode || 'count',
          count: resolveCassetteV2Expression(relation.pattern.count, parameters, 1),
          spacing: resolveCassetteV2Expression(relation.pattern.spacing, parameters, 0)
        } : null,
        family: hardware.family,
        productionMode: hardware.productionMode || '',
        parameters: Object.fromEntries(Object.entries(hardware.parameters || {}).map(([key, value]) => [
          key,
          Number.isFinite(Number(value)) ? Number(value) : value
        ]))
      };
    })
    .filter(Boolean);
};

const foldedPreviewForTree = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const parameters = treeParameters(tree);
  const faces = curves.map(curve => ({
    nodeId: curve.node.id,
    workpieceId: curve.node.workpieceId,
    // The authored boundary is the fold reference (edge indexes stay
    // stable under the profile-modified vertices).
    referenceVertices: curve.referenceVertices
      || curve.originalBoundaryVertices
      || curve.labelBoundaryVertices
      || curve.boundaryVertices
      || curve.vertices,
    vertices: curve.boundaryVertices || curve.vertices,
    holes: curve.holes || []
  }));
  const folds = (tree.nodes || [])
    .filter(node => node.parentId)
    .map(node => ({
      parentId: node.parentId,
      childId: node.id,
      parentEdgeIndex: Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0))),
      childEdgeIndex: edgeIndexFromLabel(node.attachEdge, 0),
      childAttachEdge: node.attachEdge || 'E0',
      angle: resolveCassetteV2AngleExpression(foldAngleFromNode(node), parameters, 90)
    }));
  const joints = options.includeJoints
    ? getCassetteV2WorkpieceRelations(tree)
      .filter(relation => !relationProfileWorkpiece(tree, relation))
      .map(relation => ({
        id: relation.id,
        sourceWorkpieceId: relation.sourceWorkpieceId,
        sourceFaceId: relation.sourceFaceId,
        sourceSnap: relation.sourceSnap,
        targetWorkpieceId: relation.targetWorkpieceId,
        targetFaceId: relation.targetFaceId,
        targetSnap: relation.targetSnap,
        targetSide: relation.targetSide,
        offsetX: resolveCassetteV2Expression(relation.offsetX, parameters, 0),
        offsetY: resolveCassetteV2Expression(relation.offsetY, parameters, 0),
        rotation: resolveCassetteV2AngleExpression(relation.rotation, parameters, 0),
        driver: relation.driver,
        pattern: relation.pattern
      }))
    : [];
  const bodies = foldedPreviewBodiesForTree(tree, parameters);
  const cutouts = foldedPreviewProductionEntitiesForTree(curves, tree);

  return buildOccsFoldedPreviewPayload({ faces, folds, joints, bodies, cutouts });
};

const buildLayoutDrawingFromCurves = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const foldedEdges = getCassetteV2FoldEdges(tree);
  // Profiles modify face geometry (owner law 2026-10-15): the open
  // profile chain splices into the boundary, closed sections and
  // hardware subtract — every consumer of the face, 2D drawing and
  // folded 3D alike, sees the SAME modified geometry.
  const spliceProfileEmbeddings = (sourceCurves, embeddingErrors) => {
    const embeddingsByFace = new Map();
    for (const item of profileEdgeEmbeddingsForTree(sourceCurves, tree)) {
      if (!item.embedding.ok) {
        embeddingErrors.push({ relationId: item.relationId, reason: item.embedding.reason });
        continue;
      }
      if (!embeddingsByFace.has(item.targetFaceId)) embeddingsByFace.set(item.targetFaceId, []);
      embeddingsByFace.get(item.targetFaceId).push(item.embedding);
    }
    return sourceCurves.map((curve) => {
      const faceEmbeddings = embeddingsByFace.get(curve.node.id) || [];
      if (!faceEmbeddings.length) return curve;
      const source = curve.originalBoundaryVertices
        || curve.referenceVertices
        || curve.boundaryVertices
        || curve.vertices;
      const { contour, errors } = embedOccsProfilesIntoContour(source, faceEmbeddings);
      if (errors.length) {
        errors.forEach(reason => embeddingErrors.push({ relationId: '', reason }));
        return curve;
      }
      return {
        ...curve,
        // The authored boundary stays the interaction model (labels, edge
        // indexes, dimension controls); the drawn geometry follows the
        // stitched contour.
        labelBoundaryVertices: curve.labelBoundaryVertices
          || curve.referenceVertices
          || curve.originalBoundaryVertices
          || curve.boundaryVertices
          || curve.vertices,
        boundaryVertices: contour,
        vertices: contour
      };
    });
  };
  const profileEmbeddingErrors = [];
  const embeddedCurves = spliceProfileEmbeddings(curves, profileEmbeddingErrors);
  const terminalEdges = profileTerminalEdgesForTree(tree);
  const productionEntities = [
    ...hardwareProductionEntitiesForTree(curves, tree),
    ...profileCutEntitiesForTree(curves, tree)
  ];
  const shapedCurves = await applyHardwareBooleanDifferences(embeddedCurves, productionEntities);
  // The folded 3D rides the local (untransformed) curves in assembly
  // mode: their modification pass runs in the same space — local
  // embedding, local cut entities — so the folded faces carry the
  // stitched boundary and the cuts exactly as the 2D drawing does.
  let foldedPreviewCurves = shapedCurves;
  if (options.foldedPreviewCurves) {
    const localEmbedded = spliceProfileEmbeddings(options.foldedPreviewCurves, []);
    const localEntities = [
      ...hardwareProductionEntitiesForTree(options.foldedPreviewCurves, tree),
      ...profileCutEntitiesForTree(options.foldedPreviewCurves, tree)
    ];
    foldedPreviewCurves = await applyHardwareBooleanDifferences(localEmbedded, localEntities);
  }
  const drawingCurves = shapedCurves.map(curve => {
    const labelBoundaryVertices = curve.labelBoundaryVertices
      || curve.referenceVertices
      || curve.originalBoundaryVertices
      || curve.boundaryVertices
      || curve.vertices;

    return {
      ...curve,
      labelBoundaryVertices
    };
  });
  const designerEdges = drawingCurves.flatMap(curve => (
    designerEdgesForBoundary(curve.node.id, curve.labelBoundaryVertices, foldedEdges, terminalEdges)
  ));
  const designerFoldEdges = designerFoldEdgesForTree(shapedCurves, tree);
  const foldedPreview = foldedPreviewForTree(foldedPreviewCurves, tree, { includeJoints: options.includeFoldedPreviewJoints });
  const designerSections = designerSectionsForTree(shapedCurves, foldedPreview, tree);
  const hardwareLayers = hardwareProductionLayers(productionEntities);
  const cassetteMarkLayer = buildCassetteV2CassetteMarkLayer(shapedCurves, tree, options.cassetteMarkContext || {});
  const hardwareLayer = hardwareSchematicLayer(shapedCurves, tree, {
    contextWorkpieceId: options.contextWorkpieceId,
    selectedRelationId: options.selectedRelationId
  });
  const markLayer = mergeCassetteMarkLayers(cassetteMarkLayer, hardwareLayer);
  const designerAttachmentMarkers = designerAttachmentMarkersForTree(shapedCurves, tree, {
    contextWorkpieceId: options.contextWorkpieceId,
    selectedRelationId: options.selectedRelationId
  }).concat(designerHardwareMarkersForTree(shapedCurves, tree, {
    contextWorkpieceId: options.contextWorkpieceId,
    selectedRelationId: options.selectedRelationId
  }));
  const designerFaces = drawingCurves.map(curve => {
    const labelBoundary = curve.labelBoundaryVertices || curve.boundaryVertices || curve.vertices;
    return {
      nodeId: curve.node.id,
      workpieceId: curve.node.workpieceId,
      d: occsShapeToPath(curve),
      label: curve.node.id,
      role: faceRoleFromNode(curve.node),
      parentId: curve.node.parentId || null,
      center: centroidForVertices(labelBoundary),
      dimensionControls: dimensionControlsForNode(curve.node, labelBoundary),
      offsetControls: offsetControlsForNode(curve.node, labelBoundary)
    };
  });

  const drawing = await buildOccsDrawingFromFaceCurves(drawingCurves, {
    designerFaces,
    designerFoldEdges,
    designerSections,
    foldedPreview,
    designerEdges,
    extraLayers: [...hardwareLayers, designerSections.layer, markLayer],
    viewBoxCurves: designerSections.viewBoxCurves,
    includeDimensions: options.includeDimensions
  });
  if (options.contextWorkpieceId) {
    const assemblyLayers = await designerAssemblyLayersForCurves(shapedCurves, [designerSections.layer, markLayer], {
      contextWorkpieceId: options.contextWorkpieceId
    });
    drawing.layers = assemblyLayers.concat(hardwareLayers);
  }
  drawing.designerAttachmentMarkers = designerAttachmentMarkers;
  drawing.profileEmbeddingErrors = profileEmbeddingErrors;
  // The plugin's layer standards bake the base pens here — every drawing
  // this renderer emits is styled; org-authored standards still override
  // host-side (shadow-by-code over the host transport).
  return applyOccsLayerPens(drawing);
};

export const buildCassetteV2Drawing = (result, engine, graph, definition = {}) => {
  const boundaryRef = findBoundaryOutputRef(graph);
  const curves = [];

  for (const identifier of result?.geometryIdentifiers || []) {
    const interop = engine.findGeometryInteropById(identifier);
    if (interop?.variant !== 'Curve' || !interop.data?.vertices?.length) continue;
    curves.push({
      identifier,
      vertices: interop.data.vertices,
      isBoundary: geometryRefMatches(identifier, boundaryRef)
    });
  }

  if (!curves.length) return null;

  const boundary = curves.find(curve => curve.isBoundary) || curves[curves.length - 1];
  const boundaryVertices = withoutClosingVertex(boundary.vertices);
  const constructionPaths = curves
    .filter(curve => curve !== boundary)
    .map(curve => ({
      d: curveToPath(curve.vertices),
      fill: 'none',
      stroke: 'layer',
      opacity: 0.35
    }));
  const boundaryPath = curveToPath(boundary.vertices);
  const layers = [];

  if (constructionPaths.length) {
    layers.push({
      name: CONSTRUCTION_LAYER,
      role: 'construction',
      color: 'currentColor',
      weight: 0.5,
      dasharray: '5,5',
      paths: constructionPaths
    });
  }

  layers.push({
    name: occsLayerExportName(BOUNDARY_LAYER),
    standardCode: BOUNDARY_LAYER,
    role: 'boundary',
    color: 'currentColor',
    weight: 1,
    dasharray: 'none',
    paths: [{
      d: boundaryPath,
      fill: 'layer',
      stroke: 'layer',
      opacity: 0.08
    }]
  });

  return {
    viewBox: viewBoxForCurves(curves),
    layers,
    vertices: boundaryVertices,
    designerEdges: extractDesignerEdges(boundaryVertices, normalizeCassetteV2Trapezoid(definition))
  };
};

const findEvaluatedCurve = (result, engine, ref) => {
  const identifier = (result?.geometryIdentifiers || []).find(item => geometryRefMatches(item, ref));
  if (!identifier) return null;

  const interop = engine.findGeometryInteropById(identifier);
  if (interop?.variant !== 'Curve' || !interop.data?.vertices?.length) return null;

  return {
    identifier,
    vertices: interop.data.vertices
  };
};

export const buildCassetteV2ComposedDrawing = async (result, engine, composition, tree = createCassetteV2GraphTree()) => {
  const curves = [];

  for (const face of composition?.faces || []) {
    const curve = findEvaluatedCurve(result, engine, face.boundaryOutput);
    if (!curve) continue;
    curves.push({
      ...curve,
      node: face.node,
      boundaryVertices: withoutClosingVertex(curve.vertices),
      dimensionLabels: dimensionLabelsForNode(face.node)
    });
  }

  if (!curves.length) return null;
  return buildLayoutDrawingFromCurves(curves, tree);
};

export const buildCassetteV2IncrementalDrawing = async (faceEntries = [], tree = createCassetteV2GraphTree()) => {
  const curves = faceEntries
    .filter(entry => entry?.boundaryVertices?.length)
    .map(entry => ({
      node: entry.node,
      vertices: entry.boundaryVertices,
      boundaryVertices: withoutClosingVertex(entry.boundaryVertices),
      dimensionLabels: entry.dimensionLabels || dimensionLabelsForNode(entry.node)
    }));

  if (!curves.length) return null;
  return buildLayoutDrawingFromCurves(curves, tree);
};

const orderedTreeNodes = (tree = createCassetteV2GraphTree()) => {
  const pending = new Map((tree.nodes || []).map(node => [node.id, node]));
  const ordered = [];
  const ready = new Set();

  while (pending.size > 0) {
    let moved = false;
    for (const [nodeId, node] of pending) {
      if (node.parentId && !ready.has(node.parentId)) continue;
      ordered.push(node);
      ready.add(nodeId);
      pending.delete(nodeId);
      moved = true;
    }
    if (!moved) break;
  }

  return ordered;
};

const rotateAndTranslateVertices = (vertices = [], transform = {}) => {
  const radians = numeric(transform.rotation, 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const origin = transform.origin || [0, 0, 0];
  return vertices.map((point) => {
    const x = numeric(point?.[0], 0);
    const y = numeric(point?.[1], 0);
    return [
      x * cos - y * sin + numeric(origin?.[0], 0),
      x * sin + y * cos + numeric(origin?.[1], 0),
      numeric(point?.[2], 0) + numeric(origin?.[2], 0)
    ];
  });
};

const rotate2d = (point = [0, 0], angleDegrees = 0) => {
  const radians = numeric(angleDegrees, 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = numeric(point?.[0], 0);
  const y = numeric(point?.[1], 0);
  return [x * cos - y * sin, x * sin + y * cos];
};

const faceSnapPoint = (vertices = [], snap = 'center') => {
  const points = withoutClosingVertex(vertices);
  if (!points.length) return [0, 0];
  const xs = points.map(point => numeric(point?.[0], 0));
  const ys = points.map(point => numeric(point?.[1], 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const value = String(snap || 'center');

  if (value === 'origin' || value === 'start') return [numeric(points[0]?.[0], 0), numeric(points[0]?.[1], 0)];
  if (value === 'end') return [numeric(points[1]?.[0], 0), numeric(points[1]?.[1], 0)];
  if (value === 'top_left') return [minX, maxY];
  if (value === 'top_right') return [maxX, maxY];
  if (value === 'bottom_left') return [minX, minY];
  if (value === 'bottom_right') return [maxX, minY];
  return [(minX + maxX) / 2, (minY + maxY) / 2];
};

const buildCassetteV2LocalTrapezoidTreeCurves = (sourceTree) => {
  const parameters = treeParameters(sourceTree);
  const entryById = new Map();
  const curves = [];

  for (const node of orderedTreeNodes(sourceTree)) {
    const parentEntry = node.parentId ? entryById.get(node.parentId) : null;
    if (node.parentId && !parentEntry) continue;

    const trapezoid = resolvedNodeTrapezoidForGeometry(node, parameters, parentEntry?.boundaryVertices || null);
    let vertices = buildCassetteV2TrapezoidVertices(trapezoid, {
      parentVertices: parentEntry?.boundaryVertices || null,
      parentEdgeIndex: node.parentId ? node.parentEdgeIndex : trapezoid.parentEdgeIndex
    });
    const entry = {
      node,
      vertices,
      boundaryVertices: withoutClosingVertex(vertices),
      trapezoid,
      dimensionLabels: dimensionLabelsForNode(node)
    };

    entryById.set(node.id, entry);
    curves.push(entry);
  }

  return curves;
};

const transformCurve = (curve, transform = {}) => {
  const vertices = rotateAndTranslateVertices(curve.vertices, transform);
  return {
    ...curve,
    vertices,
    boundaryVertices: withoutClosingVertex(vertices)
  };
};

const buildCassetteV2AssemblyTransforms = (sourceTree, localCurves) => {
  const parameters = treeParameters(sourceTree);
  const relations = getCassetteV2WorkpieceRelations(sourceTree).filter(relation => relation.driver);
  const workpieceById = new Map(sourceTree.workpieces.map(workpiece => [workpiece.id, workpiece]));
  const localCurveByNodeId = new Map(localCurves.map(curve => [curve.node.id, curve]));
  const transforms = new Map();
  const sourceWorkpieceIds = new Set(relations.map(relation => relation.sourceWorkpieceId).filter(Boolean));

  for (const workpiece of sourceTree.workpieces) {
    if (!sourceWorkpieceIds.has(workpiece.id)) {
      transforms.set(workpiece.id, { origin: [0, 0, 0], rotation: 0 });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const relation of relations) {
      if (!relation.sourceWorkpieceId || transforms.has(relation.sourceWorkpieceId)) continue;
      const targetTransform = transforms.get(relation.targetWorkpieceId);
      if (!targetTransform) continue;

      const targetWorkpiece = workpieceById.get(relation.targetWorkpieceId);
      const targetFaceId = relation.targetFaceId || targetWorkpiece?.rootId;
      const targetCurve = localCurveByNodeId.get(targetFaceId);
      if (!targetCurve) continue;

      const sourceWorkpiece = workpieceById.get(relation.sourceWorkpieceId);
      const sourceFaceId = relation.sourceFaceId || sourceWorkpiece?.rootId;
      const sourceCurve = localCurveByNodeId.get(sourceFaceId);
      if (!sourceCurve) continue;

      const targetPointLocal = faceSnapPoint(targetCurve.vertices, relation.targetSnap);
      const targetPointRotated = rotate2d(targetPointLocal, targetTransform.rotation);
      const offsetRotated = rotate2d([
        resolveCassetteV2Expression(relation.offsetX, parameters, 0),
        resolveCassetteV2Expression(relation.offsetY, parameters, 0)
      ], targetTransform.rotation);
      const rotation = numeric(targetTransform.rotation, 0) + resolveCassetteV2AngleExpression(relation.rotation, parameters, 0);
      const sourceSnapRotated = rotate2d(faceSnapPoint(sourceCurve.vertices, relation.sourceSnap), rotation);

      transforms.set(relation.sourceWorkpieceId, {
        origin: [
          numeric(targetTransform.origin?.[0], 0) + targetPointRotated[0] + offsetRotated[0] - sourceSnapRotated[0],
          numeric(targetTransform.origin?.[1], 0) + targetPointRotated[1] + offsetRotated[1] - sourceSnapRotated[1],
          0
        ],
        rotation
      });
      changed = true;
    }
  }

  for (const workpiece of sourceTree.workpieces) {
    if (!transforms.has(workpiece.id)) transforms.set(workpiece.id, { origin: [0, 0, 0], rotation: 0 });
  }
  return transforms;
};

export const buildCassetteV2TrapezoidTreeCurves = (tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const mode = options.mode || 'layout';
  const localCurves = buildCassetteV2LocalTrapezoidTreeCurves(sourceTree);
  const selectedWorkpieceId = options.workpieceId || sourceTree.workpieces[0]?.id || DEFAULT_CASSETTE_V2_WORKPIECE_ID;

  if (mode === 'workpiece') {
    return localCurves
      .filter(curve => curve.node.workpieceId === selectedWorkpieceId)
      .map(curve => transformCurve(curve, { origin: [0, 0, 0], rotation: 0 }));
  }

  if (mode === 'assembly') {
    const transforms = buildCassetteV2AssemblyTransforms(sourceTree, localCurves);
    return localCurves.map(curve => transformCurve(curve, transforms.get(curve.node.workpieceId)));
  }

  const workpieceById = new Map(sourceTree.workpieces.map(workpiece => [workpiece.id, workpiece]));
  return localCurves.map(curve => transformCurve(curve, {
    origin: workpieceById.get(curve.node.workpieceId)?.previewOrigin || [0, 0, 0],
    rotation: 0
  }));
};

export const renderCassetteV2TreeToDrawing = async (tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const localCurves = buildCassetteV2LocalTrapezoidTreeCurves(sourceTree);
  const assemblyTransforms = options.mode === 'assembly'
    ? buildCassetteV2AssemblyTransforms(sourceTree, localCurves)
    : null;
  const curves = assemblyTransforms
    ? localCurves.map(curve => transformCurve(curve, assemblyTransforms.get(curve.node.workpieceId)))
    : buildCassetteV2TrapezoidTreeCurves(sourceTree, options);
  if (!curves.length) return null;
  return buildLayoutDrawingFromCurves(curves, sourceTree, {
    foldedPreviewCurves: options.mode === 'assembly' ? localCurves : curves,
    includeFoldedPreviewJoints: options.mode === 'assembly',
    contextWorkpieceId: options.mode === 'assembly' ? options.contextWorkpieceId : '',
    selectedRelationId: options.selectedRelationId,
    includeDimensions: options.mode === 'assembly' ? false : undefined,
    cassetteMarkContext: options.cassetteMarkContext || {}
  });
};

export const renderCassetteV2ToDrawing = async (definition = {}) => {
  if (isGraphTree(definition)) return renderCassetteV2TreeToDrawing(definition);

  const parameters = nodeParameterScope(definition.globalParameters || definition.documentParameters || {});
  const trapezoid = normalizeCassetteV2Trapezoid(definition, parameters);
  const node = {
    id: 'face_1',
    operation: 'face.trapezoid',
    parentId: null,
    parentEdgeIndex: null,
    attachEdge: 'E0',
    parameters: { ...DEFAULT_CASSETTE_V2_TRAPEZOID, ...(definition.parameters || definition.trapezoid || definition) }
  };
  const vertices = buildCassetteV2TrapezoidVertices(trapezoid);
  return buildLayoutDrawingFromCurves([{
    node,
    vertices,
    boundaryVertices: withoutClosingVertex(vertices),
    trapezoid,
    dimensionLabels: dimensionLabelsForNode(node)
  }], {
    version: '0.2',
    rootId: node.id,
    parameters,
    nodes: [node]
  });
};

// The designer layer panel's rows: the FULL standards registry — every
// layer of the old standard, present in the drawing or not — followed by
// the drawing's non-standard layers (designer-only helpers). Presence
// gates the visibility toggle; names are the registry production export
// names, codes stay language-neutral identifiers.
export const cassetteV2LayerPanelRows = (drawing = {}) => {
  const layers = Array.isArray(drawing?.layers) ? drawing.layers : [];
  const byCode = new Map();
  const rest = [];
  for (const layer of layers) {
    if (layer.standardCode && occsLayerStandard(layer.standardCode)) byCode.set(layer.standardCode, layer);
    else rest.push(layer);
  }
  const rows = OCCS_LAYER_STANDARDS.map(standard => ({
    key: standard.code,
    name: occsLayerExportName(standard.code),
    code: standard.code,
    tablePen: standard.pen,
    production: Boolean(standard.production),
    present: byCode.has(standard.code),
    layer: byCode.get(standard.code) || null
  }));
  for (const layer of rest) {
    rows.push({
      key: layer.name,
      name: layer.name,
      code: '',
      tablePen: null,
      production: false,
      present: true,
      layer
    });
  }
  return rows;
};
