import {
  buildCassetteV2TrapezoidVertices,
  cassetteV2FaceAttachmentFrame,
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
  OCCS_LAYER_DIMENSION_CASSETTE,
  OCCS_LAYER_FOLD_ROUTE
} from '../../occs/layers.js';
import {
  collectOccsExpressionIdentifiers,
  resolveOccsAngleExpression,
  resolveOccsExpression,
  rewriteOccsExpressionIdentifiers
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
import { foldCassetteV2Region } from './cassetteV2Clipper.js';
import {
  OCCS_HANGER_PRODUCTION_MODES,
  OCCS_HARDWARE_FAMILIES,
  createOccsHardwareMetadata,
  hangerClipCutPolygon,
  hardwareCopyBounds,
  hardwareHoleDiameter,
  hardwareDefaultParameters,
  hardwareLabel,
  hardwareWorkpieceType,
  isOccsHardwareWorkpiece,
  OCCS_HOLE_HARDWARE_FAMILIES,
  normalizeHardwareFamily,
  normalizeHangerProductionMode
} from '../../occs/hardware.js';
import {
  OCCS_EDGE_ARRAY_DEFAULTS,
  arrayDefaults,
  expandFeatureArray,
  expandOccsEdgeArray2d,
  mergeArrayDefinition,
  normalizeArrayDefinition,
  pointInPolygon,
  resolveArrayDefinition,
  rewriteArrayExpressions
} from '../../occs/patterns.js';
import { buildCassetteV2FoldedPreview } from './cassetteV2FoldedPreview.js';
import { buildProfileAnnotations, OCCS_DIM_STYLE } from './profileAnnotations.js';
import { collectDxfEntities, svgPathToPolylines } from '../../vendor/dxf-writer.js';
import { embedOccsProfileEdge, embedOccsProfilesIntoContour } from '../../occs/profileEmbedding.js';
import {
  buildOccsProfileFromEvaluatedSketch,
  createDefaultOccsProfileTemplateData,
  createEmptyOccsProfileSketch,
  deriveOccsProfileSketch,
  evaluateOccsProfileSketch,
  normalizeOccsProfileSketch,
  occsProfileFromSketch,
  resolveOccsProfileSectionOperations,
  rewriteOccsProfileSketchExpressions
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
  edgeStart: '0',
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
export const rewriteCassetteV2ExpressionIdentifiers = rewriteOccsExpressionIdentifiers;

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
    edgeStart: Math.max(0, resolveCassetteV2Expression(source.edgeStart, parameters, 0)),
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

// A face authored as a parametric shape carries the profile sketch model
// on its node; the trapezoid parameters remain for the plain authoring
// path.
export const isCassetteV2SketchFace = (node = {}) => Array.isArray(node?.sketch?.shapes);

// A face sketch stores the same two parameter tables as a profile
// workpiece: the authored rows inside its sketch and the placement's
// overrides beside it. The derived table is the evaluation scope.
// A placement override is a cassette-level expression: names the cassette
// defines win over same-named sketch rows, and a field naming its own key
// reads that outer value instead of recursing into the authored row.
const resolveInstanceParameters = (sketch = {}, instance = {}, scope = {}) => {
  const entries = Object.entries(instance || {});
  if (!entries.length) return {};
  const fallback = { ...(sketch.parameters || {}), ...(scope || {}) };
  const resolved = {};
  for (const [key, value] of entries) {
    try {
      resolved[key] = resolveOccsExpression(value, { ...fallback, ...resolved });
    } catch {
      resolved[key] = value;
    }
  }
  return resolved;
};

export const normalizeCassetteV2Face = (source = {}, scope = {}) => {
  const rawSketch = source?.sketch || source;
  const sketchSource = rawSketch && (
    Array.isArray(rawSketch.shapes) || Array.isArray(rawSketch.points) || Array.isArray(rawSketch.holes)
  )
    ? rawSketch
    : createEmptyOccsProfileSketch();
  const sketch = normalizeOccsProfileSketch(sketchSource);
  const authoredKeys = new Set(Object.keys(sketch.parameters || {}));
  const instance = Object.fromEntries(
    Object.entries(source?.sketch ? (source.instance || {}) : {}).filter(([key]) => (
      authoredKeys.has(key) || !Object.prototype.hasOwnProperty.call(scope || {}, key)
    ))
  );
  const derivedSketch = deriveOccsProfileSketch(
    sketch,
    resolveInstanceParameters(sketch, instance, scope)
  );
  let parameters = { ...derivedSketch.parameters };
  try {
    parameters = evaluateOccsProfileSketch(derivedSketch, scope).parameters;
  } catch {
    // A transient invalid value keeps the stored derived table for field hints.
  }
  return {
    sketch,
    instance,
    parameters,
    derivedSketch
  };
};

// The authored sketch sits in `profileSnapshot.sketch`; a workpiece-level
// `sketch` is the fallback. A cached `occsProfile.sketch` holds evaluated
// numbers, so it comes last.
export const cassetteV2ProfileSketch = (workpiece = {}) => (
  workpiece?.profileSnapshot?.sketch
  || workpiece?.sketch
  || workpiece?.profile?.sketch
  || workpiece?.data?.occsProfile?.sketch
  || null
);

// A profile workpiece stores two parameter tables (workers/facade/SPEC.md
// — two parameter tables): the authored table inside its sketch and the
// instance table beside it. The derived table — authored rows with the
// instance values on top — is the evaluation scope; the authored sketch
// stays the stored truth.
export const normalizeCassetteV2Profile = (workpiece = {}, scope = {}) => {
  const source = workpiece.profileSnapshot || workpiece.profile || workpiece.data?.occsProfile || {};
  const rawSketch = cassetteV2ProfileSketch(workpiece);
  const data = createDefaultOccsProfileTemplateData({
    kind: workpiece.profileKind || workpiece.kind || source.kind,
    process: workpiece.process || workpiece.manufacturing?.process || source.process,
    ...(rawSketch ? { sketch: rawSketch } : {})
  });
  const sketch = normalizeOccsProfileSketch(data.sketch);
  // A cassette global with no authored profile row is read from the
  // surrounding scope, never stored as a profile override row. A row the
  // sketch authors may shadow a same-named global and keeps its override.
  const authoredKeys = new Set(Object.keys(sketch.parameters || {}));
  const instance = Object.fromEntries(
    Object.entries(source.instance || {}).filter(([key]) => (
      authoredKeys.has(key) || !Object.prototype.hasOwnProperty.call(scope || {}, key)
    ))
  );
  // Instance expressions resolve in the cassette scope first; the derived
  // table then carries those values over the authored rows for geometry.
  // The stored tables keep their raw expressions.
  const derivedSketch = deriveOccsProfileSketch(
    sketch,
    resolveInstanceParameters(sketch, instance, scope)
  );
  const derivedKeys = Object.keys(derivedSketch.parameters);
  const deriveFromSketch = sketch.shapes.length > 0;
  let derivedTable = derivedSketch.parameters;
  let occsProfile = null;
  if (source.section && source.sweep && !deriveFromSketch) {
    occsProfile = { section: source.section, sweep: source.sweep, sketch };
  } else {
    try {
      occsProfile = occsProfileFromSketch(derivedSketch, { parameters: scope });
      derivedTable = Object.fromEntries(
        derivedKeys.map(key => [key, occsProfile.sketch.parameters[key]])
      );
    } catch {
      // A transient invalid instance parameter keeps the last good
      // section; there is nothing to fall back to for sketch-less
      // snapshots, so the default template geometry stands in.
      occsProfile = source.section && source.sweep
        ? { section: source.section, sweep: source.sweep, sketch }
        : occsProfileFromSketch(normalizeOccsProfileSketch({}, scope), { parameters: scope });
    }
  }

  return {
    kind: data.kind,
    process: data.process,
    // The evaluated derived table; the authored table rides the sketch and
    // the overrides ride `instance`.
    parameters: derivedTable,
    instance: { ...instance },
    sketch,
    section: occsProfile.section,
    sweep: occsProfile.sweep
  };
};

// The stored snapshot: authored truth and the instance table. The derived
// table is the read-side projection.
const cassetteV2ProfileSnapshot = (profile = {}) => ({
  kind: profile.kind,
  process: profile.process,
  instance: profile.instance,
  sketch: profile.sketch,
  section: profile.section,
  sweep: profile.sweep
});

const faceIdForWorkpiece = (tree, workpiece, preferredFaceId) => (
  tree.nodes.find(node => node.id === preferredFaceId && node.workpieceId === workpiece?.id)?.id ||
  workpiece?.rootId ||
  ''
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
  // A stale occurrence keeps the binding honest: the relation lists
  // unplaced instead of silently hopping to another workpiece's face.
  const targetWorkpiece = workpieceByOccurrenceId.get(target.occurrence) || null;
  const placement = clonePlacement(joint.placement || {});
  const targetFaceId = target.face || placement.relativeTo?.face || targetWorkpiece?.rootId || '';
  const sourceFaceId = joint.source?.face || placement.sourceFace || sourceWorkpiece?.rootId || '';
  const targetSide = target.side || placement.relativeTo?.side || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const sourceSide = joint.source?.side || placement.sourceSide || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const origin = Array.isArray(placement.origin) ? placement.origin : [];
  const sourceOrigin = Array.isArray(placement.sourceOrigin) ? placement.sourceOrigin : [];
  const targetSnap = placement.targetAnchor ||
    placement.targetSnap ||
    target.anchor ||
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap;
  const sourceSnap = placement.anchor ||
    placement.sourceSnap ||
    DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap;
  const pattern = normalizeArrayDefinition(placement.pattern, {
    edgeMargin: origin[0] ?? placement.offsetX,
    normalOffset: origin[1] ?? placement.offsetY,
    binding: targetSnap,
    rotation: placement.rotation,
    mirrorX: placement.mirrorX ?? placement.mirror?.x,
    mirrorY: placement.mirrorY ?? placement.mirror?.y
  });

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
    sourceSide,
    targetSnap,
    sourceSnap,
    offsetX: origin[0] ?? placement.offsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
    offsetY: origin[1] ?? placement.offsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY,
    sourceOffsetX: sourceOrigin[0] ?? placement.sourceOffsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
    sourceOffsetY: sourceOrigin[1] ?? placement.sourceOffsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY,
    rotation: placement.rotation ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.rotation,
    mirrorX: Boolean(placement.mirrorX ?? placement.mirror?.x),
    mirrorY: Boolean(placement.mirrorY ?? placement.mirror?.y),
    pattern,
    placementMode: pattern ? (pattern.space === 'face' ? 'faceArray' : 'edgeArray') : 'point',
    source: {
      ...(joint.source || {}),
      occurrence: sourceWorkpiece ? occurrenceIdForWorkpiece(sourceWorkpiece) : joint.source?.occurrence,
      face: sourceFaceId,
      side: sourceSide
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
      sourceSide,
      sourceOrigin: [
        sourceOrigin[0] ?? placement.sourceOffsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
        sourceOrigin[1] ?? placement.sourceOffsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY
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

const mergeEdgeIntervals = (intervals = []) => {
  const sorted = intervals
    .filter(interval => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end + 0.001) merged.push({ ...interval });
    else last.end = Math.max(last.end, interval.end);
  }
  return merged;
};

export const cassetteV2FreeEdgeShards = ({ edgeLength = 0, occupied = [] } = {}) => {
  let cursor = 0;
  const shards = [];
  for (const interval of mergeEdgeIntervals(occupied)) {
    const start = Math.max(0, Math.min(edgeLength, interval.start));
    const end = Math.max(start, Math.min(edgeLength, interval.end));
    if (start - cursor > 0.001) shards.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (edgeLength - cursor > 0.001) shards.push({ start: cursor, end: edgeLength });
  return shards;
};

const faceEdgeIntervalsForChildren = (tree, parentId, edgeIndex, edgeLength) => {
  const parameters = treeParameters(tree);
  return (tree.nodes || [])
    .filter(node => node.parentId === parentId && node.parentEdgeIndex === edgeIndex)
    .map((node) => {
      const start = Math.max(0, resolveCassetteV2Expression(
        node.parameters?.edgeStart,
        nodeExpressionScope(node, parameters),
        0
      ));
      const rawWidth = node.parameters?.defaultLength;
      const width = rawWidth === 'inherit' || rawWidth === undefined
        ? Math.max(0, edgeLength - start)
        : Math.max(0, resolveCassetteV2Expression(rawWidth, nodeExpressionScope(node, parameters), edgeLength - start));
      return { start, end: start + width };
    });
};

export const addCassetteV2GraphChild = (tree, parentId, edgeIndex, options = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const parent = nextTree.nodes.find(node => node.id === parentId);
  if (!parent) throw new Error(`Missing parent face: ${parentId}`);

  const normalizedEdgeIndex = Math.max(0, Math.round(numeric(edgeIndex, 0)));
  const existingChild = nextTree.nodes.find(node => (
    node.parentId === parentId &&
    node.parentEdgeIndex === normalizedEdgeIndex
  ));
  // A caller without the host edge length keeps the single-child
  // contract; the designer passes the edge length and allocates a free
  // shard.
  if (existingChild && !Number.isFinite(Number(options.edgeLength))) {
    return { tree: nextTree, nodeId: existingChild.id };
  }

  const id = nextCassetteV2NodeId(nextTree);
  const parentRole = parent.role || (parent.parentId ? 'return_flange' : 'main');
  const childOptions = parentRole === 'return_flange'
    ? {
        role: 'mounting_flange',
        foldAngle: '-90'
      }
    : { role: 'return_flange' };
  const edgeLength = Number(options.edgeLength);
  if (Number.isFinite(edgeLength) && edgeLength > 0) {
    const occupied = mergeEdgeIntervals(faceEdgeIntervalsForChildren(nextTree, parentId, normalizedEdgeIndex, edgeLength));
    const shards = cassetteV2FreeEdgeShards({ edgeLength, occupied });
    const requestedStart = Number(options.shardStart);
    const requestedEnd = Number(options.shardEnd);
    const requestedSpan = Number.isFinite(requestedStart) && Number.isFinite(requestedEnd)
      && requestedEnd > requestedStart;
    const overlapsOccupied = requestedSpan && occupied.some(interval => (
      requestedStart < interval.end - 0.001 && requestedEnd > interval.start + 0.001
    ));
    if (overlapsOccupied) return { tree: nextTree, nodeId: '', refused: 'edge-occupied' };
    const requestedFits = requestedSpan
      && requestedStart >= -0.001
      && requestedEnd <= edgeLength + 0.001;
    const shard = requestedFits
      ? { start: Math.max(0, requestedStart), end: Math.min(edgeLength, requestedEnd) }
      : Number.isFinite(requestedStart)
        ? shards.find(candidate => Math.abs(candidate.start - requestedStart) < 0.5) || shards[0]
        : shards[0];
    if (!shard) return { tree: nextTree, nodeId: '', refused: 'edge-full' };
    const fullShard = shard.start <= 0.001 && shard.end >= edgeLength - 0.001;
    childOptions.parameters = {
      edgeStart: String(Math.round(shard.start * 1000) / 1000),
      ...(fullShard ? {} : { defaultLength: String(Math.round((shard.end - shard.start) * 1000) / 1000) })
    };
  }
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
  placement.pattern = normalizeArrayDefinition(reference.pattern) || arrayDefaults(DEFAULT_CASSETTE_V2_HARDWARE_ARRAY);

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
    joint.placement.pattern = normalizeArrayDefinition(reference.pattern) || arrayDefaults(DEFAULT_CASSETTE_V2_HARDWARE_ARRAY);
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
    profile: {
      ...(templateData.occsProfile || templateData.profile || {}),
      instance: { ...(templateData.instance || {}) }
    },
    sketch: templateData.sketch
  }, treeParameters(nextTree));
  const snapshot = cassetteV2ProfileSnapshot(profile);
  const sourceWorkpiece = {
    id,
    name: reference.name || reference.template?.identity?.name || reference.profileTemplate?.identity?.name || `Profile ${index + 1}`,
    type: 'profile',
    role: profile.kind,
    profileTemplateId: reference.template?._id || reference.profileTemplate?._id || reference.profileTemplateId || '',
    profileSnapshot: snapshot,
    process: profile.process,
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
  const pattern = normalizeArrayDefinition(reference.pattern) || arrayDefaults(DEFAULT_CASSETTE_V2_HARDWARE_ARRAY);

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
    // Profiles attach through the edge-array contract by default (owner
    // law 2026-10-17, same default as hardware): the attachment editor
    // opens with the edge chooser live, never a bare point placement.
    joint.placement.pattern = pattern;
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
    const currentSnapshot = current.profileSnapshot || current.profile || {};
    const patchSnapshot = patch.profileSnapshot || patch.profile || null;
    const profile = normalizeCassetteV2Profile({
      ...current,
      ...patch,
      type: 'profile',
      profileSnapshot: {
        ...currentSnapshot,
        ...(patchSnapshot || {}),
        instance: {
          ...(currentSnapshot.instance || {}),
          ...(patchSnapshot?.instance || {}),
          ...(patch.instance || {})
        }
      }
    }, treeParameters(nextTree));
    const snapshot = cassetteV2ProfileSnapshot(profile);
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
      profileSnapshot: snapshot,
      rootId: ''
    };
    delete nextTree.workpieces[index].parameters;
    delete nextTree.workpieces[index].family;
    delete nextTree.workpieces[index].productionMode;
    delete nextTree.workpieces[index].hardware;
    delete nextTree.workpieces[index].sketch;
    delete nextTree.workpieces[index].profile;
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
  )) || null;
  const sourceFaceId = isCassetteV2SheetWorkpiece(sourceWorkpiece)
    ? faceIdForWorkpiece(nextTree, sourceWorkpiece, patch.sourceFaceId || relation.sourceFaceId)
    : '';
  const targetFaceId = faceIdForWorkpiece(nextTree, targetWorkpiece, patch.targetFaceId ||
    (patch.targetWorkpieceId ? targetWorkpiece?.rootId : relation.targetFaceId));
  const targetSide = patch.targetSide || relation.targetSide || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const sourceSide = patch.sourceSide || relation.sourceSide || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
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
    sourceSide,
    sourceOrigin: [
      patch.sourceOffsetX ?? relation.sourceOffsetX ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetX,
      patch.sourceOffsetY ?? relation.sourceOffsetY ?? DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.offsetY
    ],
    rotation: patch.rotation ?? relation.rotation,
    mirrorX: patch.mirrorX ?? relation.mirrorX,
    mirrorY: patch.mirrorY ?? relation.mirrorY,
    anchor: sourceSnap,
    targetAnchor: targetSnap
  };
  // Flat array keys are the previous authoring surface; they normalize
  // into the same canonical definition the nested pattern patch writes.
  const legacyArrayPatch = {};
  if (patch.arrayEdge !== undefined) legacyArrayPatch.edge = patch.arrayEdge;
  if (patch.arrayMode !== undefined) legacyArrayPatch.x = { mode: patch.arrayMode === 'spacing' ? 'gap' : 'count' };
  if (patch.arrayCount !== undefined) legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), count: patch.arrayCount };
  if (patch.arraySpacing !== undefined) legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), gap: patch.arraySpacing };
  if (patch.arrayLayout !== undefined) {
    legacyArrayPatch.space = 'face';
    legacyArrayPatch.kind = patch.arrayLayout === 'polar' ? 'radial' : 'grid';
    legacyArrayPatch.stagger = { enabled: patch.arrayLayout === 'hex' };
  }
  if (patch.arrayCountX !== undefined) legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), count: patch.arrayCountX };
  if (patch.arrayStepX !== undefined) legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), step: patch.arrayStepX };
  if (patch.arrayCountY !== undefined) legacyArrayPatch.y = { count: patch.arrayCountY };
  if (patch.arrayStepY !== undefined) legacyArrayPatch.y = { ...(legacyArrayPatch.y || {}), step: patch.arrayStepY };
  if (patch.arrayPaddingX !== undefined) legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), start: patch.arrayPaddingX, end: patch.arrayPaddingX };
  if (patch.arrayPaddingY !== undefined) legacyArrayPatch.y = { ...(legacyArrayPatch.y || {}), start: patch.arrayPaddingY, end: patch.arrayPaddingY };
  if (patch.arrayPolarCount !== undefined) legacyArrayPatch.polar = { count: patch.arrayPolarCount };
  if (patch.arrayRadius !== undefined) legacyArrayPatch.polar = { ...(legacyArrayPatch.polar || {}), radius: patch.arrayRadius };
  if (patch.arrayStartAngle !== undefined) legacyArrayPatch.polar = { ...(legacyArrayPatch.polar || {}), startAngle: patch.arrayStartAngle };
  if (patch.arraySweep !== undefined) legacyArrayPatch.polar = { ...(legacyArrayPatch.polar || {}), sweep: patch.arraySweep };
  if (patch.arrayRotate !== undefined) {
    legacyArrayPatch.item = { orientation: patch.arrayRotate ? 'radial' : 'fixed' };
  }
  const edgePlacement = patch.placementMode !== 'point' && (
    patch.placementMode === 'edgeArray' ||
    (!patch.placementMode && relation.pattern?.space === 'edge')
  );
  if (edgePlacement) {
    if (patch.offsetX !== undefined) {
      legacyArrayPatch.x = { ...(legacyArrayPatch.x || {}), start: patch.offsetX, end: patch.offsetX };
    }
    if (patch.offsetY !== undefined) legacyArrayPatch.normal = patch.offsetY;
    if (patch.targetSnap !== undefined) legacyArrayPatch.binding = patch.targetSnap;
    if (patch.rotation !== undefined) {
      legacyArrayPatch.item = { ...(legacyArrayPatch.item || {}), rotation: patch.rotation };
    }
    if (patch.mirrorX !== undefined || patch.mirrorY !== undefined) {
      legacyArrayPatch.item = {
        ...(legacyArrayPatch.item || {}),
        ...(patch.mirrorX !== undefined ? { mirrorX: patch.mirrorX } : {}),
        ...(patch.mirrorY !== undefined ? { mirrorY: patch.mirrorY } : {})
      };
    }
  }
  const arrayPatchKeys = Object.keys(legacyArrayPatch);
  const incomingPattern = patch.pattern?.type
    ? normalizeArrayDefinition(patch.pattern, {
        edgeMargin: patch.offsetX ?? relation.offsetX,
        normalOffset: patch.offsetY ?? relation.offsetY,
        binding: patch.targetSnap ?? relation.targetSnap,
        rotation: patch.rotation ?? relation.rotation,
        mirrorX: patch.mirrorX ?? relation.mirrorX,
        mirrorY: patch.mirrorY ?? relation.mirrorY
      })
    : patch.pattern;
  const patchesArray = patch.placementMode === 'edgeArray' || patch.placementMode === 'faceArray' ||
    incomingPattern || arrayPatchKeys.length > 0;
  if (patchesArray) {
    const targetSpace = incomingPattern?.space || legacyArrayPatch.space ||
      (patch.placementMode === 'faceArray' ? 'face'
        : patch.placementMode === 'edgeArray' ? 'edge'
          : relation.pattern?.space || 'edge');
    const targetKind = targetSpace === 'edge'
      ? 'linear'
      : incomingPattern?.kind || legacyArrayPatch.kind ||
        (relation.pattern?.space === 'face' ? relation.pattern.kind : 'grid');
    const base = relation.pattern && relation.pattern.space === targetSpace && relation.pattern.kind === targetKind
      ? relation.pattern
      : arrayDefaults({ space: targetSpace, kind: targetKind });
    placement.pattern = mergeArrayDefinition(base, {
      ...legacyArrayPatch,
      ...(incomingPattern || {}),
      space: targetSpace,
      kind: targetKind
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
      face: sourceFaceId,
      side: sourceSide
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

// The face sketch is authored truth on the node; clearing it returns the
// face to its trapezoid parameters and drops the placement overrides with
// the table they shadow.
export const updateCassetteV2FaceSketch = (tree, nodeId, sketch = null) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const node = nextTree.nodes.find(item => item.id === nodeId);
  if (!node) return nextTree;
  if (sketch) node.sketch = normalizeOccsProfileSketch(sketch);
  else {
    delete node.sketch;
    delete node.instance;
  }
  return nextTree;
};

// A placed face's instance table holds the overrides its authored rows
// accept; scope-named rows stay in the cassette's table.
export const updateCassetteV2FaceInstance = (tree, nodeId, instance = {}) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const node = nextTree.nodes.find(item => item.id === nodeId);
  if (!node) return nextTree;
  const scope = treeParameters(nextTree);
  const authoredKeys = new Set(Object.keys(node.sketch?.parameters || {}));
  const next = Object.fromEntries(
    Object.entries(instance || {}).filter(([key, value]) => (
      value !== undefined &&
      (authoredKeys.has(key) || !Object.prototype.hasOwnProperty.call(scope, key))
    ))
  );
  if (Object.keys(next).length) node.instance = next;
  else delete node.instance;
  return nextTree;
};

// Renames a cassette global in place: the key moves in the tree's table
// and every expression referencing it rewrites as whole identifiers —
// node parameters and fold angles (the deg suffix survives), workpiece
// instance values, profile sketches (a sketch field referencing the
// global rebinds; a sketch's own same-named parameter is its local and
// stays), and joint placements with their array values. Invalid or
// colliding names refuse (the row re-renders with the old name).
export const renameCassetteV2TreeParameter = (tree = createCassetteV2GraphTree(), from = '', to = '') => {
  const source = String(from || '').trim();
  const next = String(to || '').trim();
  if (!source || !next || source === next) return tree;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) return tree;
  const parameters = tree.parameters || {};
  if (!Object.prototype.hasOwnProperty.call(parameters, source)) return tree;
  if (Object.prototype.hasOwnProperty.call(parameters, next)) return tree;

  const renames = { [source]: next };
  const rewrite = (value) => rewriteCassetteV2ExpressionIdentifiers(value, renames);
  const rewriteAngle = (value) => {
    const match = typeof value === 'string' ? value.match(/^(.*?)(\s*deg)$/i) : null;
    return match ? `${rewrite(match[1])}${match[2]}` : rewrite(value);
  };
  const rewriteSketch = (sketch) => (
    sketch && typeof sketch === 'object' && !Object.prototype.hasOwnProperty.call(sketch.parameters || {}, source)
      ? rewriteOccsProfileSketchExpressions(sketch, renames)
      : sketch
  );

  const nextTree = cloneCassetteV2Tree(tree);
  nextTree.parameters = Object.fromEntries(
    Object.entries(nextTree.parameters || {}).map(([key, value]) => [key === source ? next : key, rewrite(value)])
  );
  nextTree.nodes = nextTree.nodes.map(node => {
    const localSource = Object.prototype.hasOwnProperty.call(node.sketch?.parameters || {}, source);
    return {
      ...node,
      ...(node.foldAngle !== undefined ? { foldAngle: rewriteAngle(node.foldAngle) } : {}),
      ...(node.sketch ? { sketch: rewriteSketch(node.sketch) } : {}),
      ...(node.instance ? {
        instance: Object.fromEntries(
          Object.entries(node.instance).map(([key, value]) => [
            key === source && !localSource ? next : key,
            rewrite(value)
          ])
        )
      } : {}),
      parameters: Object.fromEntries(
        Object.entries(node.parameters || {}).map(([key, value]) => [key, rewriteAngle(value)])
      )
    };
  });
  nextTree.workpieces = nextTree.workpieces.map(workpiece => {
    const snapshotSketch = workpiece.profileSnapshot?.sketch || workpiece.sketch;
    // A profile-local row shadows the global and keeps its name.
    const localSource = Object.prototype.hasOwnProperty.call(snapshotSketch?.parameters || {}, source);
    return {
      ...workpiece,
      parameters: Object.fromEntries(
        Object.entries(workpiece.parameters || {}).map(([key, value]) => [key, rewrite(value)])
      ),
      ...(workpiece.sketch ? { sketch: rewriteSketch(workpiece.sketch) } : {}),
      ...(workpiece.profileSnapshot ? {
        profileSnapshot: {
          ...workpiece.profileSnapshot,
          ...(workpiece.profileSnapshot.instance ? {
            instance: Object.fromEntries(
              Object.entries(workpiece.profileSnapshot.instance).map(([key, value]) => [
                key === source && !localSource ? next : key,
                rewrite(value)
              ])
            )
          } : {}),
          ...(workpiece.profileSnapshot.sketch ? { sketch: rewriteSketch(workpiece.profileSnapshot.sketch) } : {})
        }
      } : {})
    };
  });
  nextTree.joints = nextTree.joints.map(joint => {
    const placement = joint.placement || {};
    const pattern = placement.pattern;
    return {
      ...joint,
      placement: {
        ...placement,
        ...(Array.isArray(placement.origin) ? { origin: placement.origin.map(rewrite) } : {}),
        ...(placement.rotation !== undefined ? { rotation: rewriteAngle(placement.rotation) } : {}),
        ...(pattern ? { pattern: rewriteArrayExpressions(pattern, rewrite) } : {})
      }
    };
  });
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
    const edgeLength = cassetteV2TrapezoidReferenceLength(parentBoundaryVertices, node.parentEdgeIndex);
    const edgeStart = resolveCassetteV2Expression(shape.edgeStart, nodeExpressionScope(node, parameters), 0);
    if (Number.isFinite(edgeLength)) shape.defaultLength = Math.max(1, edgeLength - edgeStart);
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

export const createCassetteV2OccsDocument = async (definition = {}, context = {}) => {
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

export const createCassetteV2OccsDocumentFromTree = async (tree = createCassetteV2GraphTree(), context = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const nodes = Array.isArray(sourceTree.nodes) ? sourceTree.nodes : [];
  const nodesByWorkpieceId = new Map();
  for (const node of nodes) {
    if (!nodesByWorkpieceId.has(node.workpieceId)) nodesByWorkpieceId.set(node.workpieceId, []);
    nodesByWorkpieceId.get(node.workpieceId).push(node);
  }
  const rawCurves = await buildCassetteV2TreeCurves(sourceTree, { mode: 'assembly' });
  const productionEntitiesByTarget = new Map();
  const collectEntities = async entities => {
    for (const entity of await entities) {
      if (!productionEntitiesByTarget.has(entity.target)) productionEntitiesByTarget.set(entity.target, []);
      productionEntitiesByTarget.get(entity.target).push(entity);
    }
  };
  const arrayErrors = [];
  await collectEntities(profileCutEntitiesForTree(rawCurves, sourceTree, { errors: arrayErrors }));
  await collectEntities(faceSketchCutEntitiesForTree(rawCurves));
  await collectEntities(hardwareProductionEntitiesForTree(rawCurves, sourceTree, { errors: arrayErrors }));
  if (arrayErrors.length) {
    throw new Error(`Array placement is invalid (${arrayErrors.map(error => error.reason).join('; ')})`);
  }
  // Face shapes ride the region fold: the result's outer ring and
  // hole rings are the document's derived geometry.
  const curves = await applyHardwareBooleanDifferences(
    rawCurves,
    Array.from(productionEntitiesByTarget.values()).flat()
  );
  const curveByNodeId = new Map(curves.map(curve => [curve.node.id, curve]));

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
            // The document workpiece carries the instance table; its
            // authored truth rides the sketch extension.
            parameters: { ...(profile.instance || {}) },
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
          const curve = curveByNodeId.get(node.id);
          const hasEdgePlacement = node.parentId && (
            !['', '0', 0].includes(node.parameters?.edgeStart)
            || node.parameters?.defaultLength !== 'inherit'
          );
          const hasBooleanResult = curve && (
            hasEdgePlacement || (curve.holes || []).length > 0 || curve.shapeType === 'polygon'
          );
          const shape = hasBooleanResult
            ? {
                type: 'polygon',
                vertices: (curve.boundaryVertices || curve.vertices || []).map(vertex => [
                  String(vertex[0]),
                  String(vertex[1])
                ]),
                holes: (curve.holes || []).map(ring => ring.map(vertex => [
                  String(vertex[0]),
                  String(vertex[1])
                ]))
              }
            : shapeFromNode(node);
          return {
            id: node.id,
            role: faceRoleFromNode(node),
            shape,
            ...(isCassetteV2SketchFace(node) ? {
              extensions: { perigram: { sketch: normalizeOccsProfileSketch(node.sketch) } }
            } : {})
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
            ...faces.flatMap(face => (productionEntitiesByTarget.get(face.id) || [])
              .filter(entity => entity.booleanOperation !== 'subtract' || productionEntityCutRings(entity).every(
                ring => polygonInsideFace(ring, curveByNodeId.get(entity.target)?.boundaryVertices || [])
              )).flatMap(entity => (
              entity.geometry.type === 'circle'
                ? [{
                    id: entity.id,
                    layer: entity.layer,
                    target: entity.target,
                    ...(entity.booleanOperation ? { booleanOperation: entity.booleanOperation } : {}),
                    geometry: {
                      type: 'circle',
                      diameter: String(entity.geometry.diameter),
                      center: [
                        String(entity.geometry.center[0]),
                        String(entity.geometry.center[1])
                      ]
                    },
                    extensions: {
                      perigram: {
                        relationId: entity.relationId,
                        hardwareWorkpieceId: entity.hardwareWorkpieceId
                      }
                    }
                  }]
                : productionEntityCutRings(entity).map(ring => ({
                    id: entity.id,
                    layer: entity.layer,
                    target: entity.target,
                    ...(entity.booleanOperation ? { booleanOperation: entity.booleanOperation } : {}),
                    geometry: {
                      type: 'polygon',
                      vertices: ring.map(vertex => [
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
                  }))
            ))),
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

const pointAlong = (from, to, ratio) => [
  numeric(from?.[0], 0) + (numeric(to?.[0], 0) - numeric(from?.[0], 0)) * ratio,
  numeric(from?.[1], 0) + (numeric(to?.[1], 0) - numeric(from?.[1], 0)) * ratio,
  0
];

const designerEdgesForBoundary = (nodeId, vertices = [], tree = createCassetteV2GraphTree()) => {
  const boundaryVertices = withoutClosingVertex(vertices);
  const node = (tree.nodes || []).find(item => item.id === nodeId);
  const attachEdgeIndex = node?.parentId ? edgeIndexFromLabel(node.attachEdge, 0) : null;
  return boundaryVertices.flatMap((vertex, edgeIndex) => {
    // The face's own base edge is its connection to the parent panel;
    // sibling faces share the parent edge, not this child's base.
    if (edgeIndex === attachEdgeIndex) return [];
    const next = boundaryVertices[(edgeIndex + 1) % boundaryVertices.length];
    const edgeLength = Math.hypot(
      numeric(next?.[0], 0) - numeric(vertex?.[0], 0),
      numeric(next?.[1], 0) - numeric(vertex?.[1], 0)
    );
    if (edgeLength <= 0.001) return [];
    const occupied = mergeEdgeIntervals(faceEdgeIntervalsForChildren(tree, nodeId, edgeIndex, edgeLength));
    const shards = cassetteV2FreeEdgeShards({ edgeLength, occupied });
    return shards.map((shard) => {
      const [x1, y1] = toSvgPoint(pointAlong(vertex, next, shard.start / edgeLength));
      const [x2, y2] = toSvgPoint(pointAlong(vertex, next, shard.end / edgeLength));
      return {
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
        length: Math.round(shard.end - shard.start),
        edgeLength: Math.round(edgeLength * 1000) / 1000,
        shardStart: Math.round(shard.start * 1000) / 1000,
        shardEnd: Math.round(shard.end * 1000) / 1000,
        nodeId,
        edgeIndex,
        label: '+'
      };
    });
  });
};

const designerFoldEdgesForTree = (curves = [], tree = createCassetteV2GraphTree()) => {
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const parameters = treeParameters(tree);
  return (tree.nodes || [])
    .filter(node => node.parentId)
    .map((node) => {
      const parentCurve = curveById.get(node.parentId);
      const parentVertices = withoutClosingVertex(rawFaceVertices(parentCurve));
      const edgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
      const vertex = parentVertices[edgeIndex];
      const next = parentVertices[(edgeIndex + 1) % parentVertices.length];
      if (!vertex || !next) return null;
      const edgeLength = Math.hypot(
        numeric(next[0], 0) - numeric(vertex[0], 0),
        numeric(next[1], 0) - numeric(vertex[1], 0)
      );
      if (edgeLength <= 0.001) return null;

      // The fold runs on the child's owned interval of the host edge:
      // multiple faces share one edge, each hinges on its own span.
      const scope = nodeExpressionScope(node, parameters);
      const start = Math.max(0, Math.min(edgeLength, resolveCassetteV2Expression(node.parameters?.edgeStart, scope, 0)));
      const rawWidth = node.parameters?.defaultLength;
      const end = rawWidth === 'inherit' || rawWidth === undefined
        ? edgeLength
        : Math.max(start, Math.min(edgeLength, start + resolveCassetteV2Expression(rawWidth, scope, edgeLength - start)));
      const foldStart = pointAlong(vertex, next, start / edgeLength);
      const foldEnd = pointAlong(vertex, next, end / edgeLength);
      const [x1, y1] = toSvgPoint(foldStart);
      const [x2, y2] = toSvgPoint(foldEnd);
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
    facePaths.push(...groupCurves.map(curve => ({
      d: occsShapeToPath(curve),
      fill: 'layer',
      stroke: 'none',
      opacity: designerAssemblyFillOpacity(workpieceId, contextWorkpieceId),
      workpieceId,
      ...(Array.isArray(curve.holes) && curve.holes.length ? { fillRule: 'evenodd' } : {})
    })));
    cutPaths.push(...layout.cutOuterPaths.map(vertices => ({
      d: occsCurveToPath(vertices),
      fill: 'none',
      stroke: 'layer',
      opacity,
      workpieceId
    })));
    const authoredFolds = (options.foldEdges || [])
      .filter(edge => !edge.workpieceId || edge.workpieceId === workpieceId);
    foldPaths.push(...(authoredFolds.length
      ? authoredFolds.map(edge => ({
          d: `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`,
          fill: 'none',
          stroke: 'layer',
          opacity,
          workpieceId
        }))
      : layout.foldPaths.map(vertices => ({
          d: occsCurveToPath(vertices),
          fill: 'none',
          stroke: 'layer',
          opacity,
          workpieceId
        }))));
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
        markers.push(markerFromPoint(faceSnapPoint(rawFaceVertices(targetCurve), relation.targetSnap), {
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
        markers.push(markerFromPoint(faceSnapPoint(rawFaceVertices(sourceCurve), relation.sourceSnap), {
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

const placedPoint = (point, rotation = 0, key = '') => {
  const placed = [point.x, point.y, 0];
  placed.rotation = rotation;
  placed.key = key;
  placed.along = point.along;
  return placed;
};

const hardwarePointsForRelation = (
  curve,
  relation,
  parameters = {},
  copyLength = 0,
  copyBounds = null,
  errors = null
) => {
  const vertices = rawFaceVertices(curve);
  const resolve = (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback);
  if (relation.pattern) {
    const result = expandFeatureArray({
      vertices,
      pattern: relation.pattern,
      copyLength,
      copyMin: relation.pattern.space === 'edge' && copyLength > 0 && copyBounds ? -copyBounds.maxY : 0,
      copyBounds,
      resolve
    });
    if (!result.ok) {
      if (errors) errors.push(result.reason);
      return [];
    }
    return result.copies.map(copy => placedPoint(copy, copy.rotation, copy.key));
  }
  const snap = faceSnapPoint(vertices, relation.targetSnap);
  return [[
    numeric(snap?.[0], 0) + resolve(relation.offsetX, 0),
    numeric(snap?.[1], 0) + resolve(relation.offsetY, 0),
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
      return hardwarePointsForRelation(targetCurve, relation, parameters, 0, hardwareCopyBounds(hardware)).map((point, index) => markerFromPoint(point, {
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
  const foldRefusals = profileFoldEdgeRefusalsForTree(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const results = [];
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    if (foldRefusals.has(relation.id)) continue; // fold edge: refused
    const targetCurve = curveById.get(relation.targetFaceId);
    if (!targetCurve) continue;
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const open = profile.section?.open || profile.section?.type === 'polyline';
    if (!open) continue;
    if (relation.pattern?.space === 'face') {
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
        embedding: {
          ok: false,
          reason: 'open profiles place only on an edge',
          relationId: relation.id,
          profileWorkpieceId: relation.sourceWorkpieceId
        }
      });
      continue;
    }
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
      embedding: {
        ...embedOccsProfileEdge({
          section: profile.section,
          vertices: contour,
          relation,
          resolve: (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback)
        }),
        relationId: relation.id,
        profileWorkpieceId: relation.sourceWorkpieceId
      }
    });
  }
  return results;
};

const profileArrangementEdgeIndex = (relation, workpiece, parameters) => {
  if (relation.pattern?.space === 'edge') return edgeIndexFromLabel(relation.pattern.edge, 0);
  if (relation.pattern?.space === 'face') return null;
  const profile = normalizeCassetteV2Profile(workpiece, parameters);
  const open = profile.section?.open || profile.section?.type === 'polyline';
  return open ? 0 : null; // closed profiles without a pattern place by point
};

// An open profile rewrites the host edge contour, so it arranges only on
// an edge without a fold. Closed profiles cut the host through the bend
// line and leave the authored fold route intact. Keyed relation id ->
// target face id; the drawing surfaces refusals through
// profileEmbeddingErrors.
export const profileFoldEdgeRefusalsForTree = (tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const folds = getCassetteV2FoldEdges(sourceTree);
  const refusals = new Map();
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const open = profile.section?.open || profile.section?.type === 'polyline';
    if (!open) continue;
    const edgeIndex = profileArrangementEdgeIndex(relation, workpiece, parameters);
    if (edgeIndex === null) continue;
    if (folds.has(`${relation.targetFaceId}:E${edgeIndex}`)) refusals.set(relation.id, relation.targetFaceId);
  }
  return refusals;
};

// The edges of a face a profile may arrange on, as E labels: every
// authored edge less the folds (a child face bends there).
export const cassetteV2AttachableProfileEdgesForTree = (
  tree = createCassetteV2GraphTree(),
  faceId = '',
  // Folds are prohibited for everyone; edge sharing is allocated at
  // placement time. Sketch faces carry their own edge count; trapezoids
  // have four.
  { edgeCountByFaceId = {} } = {}
) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const folds = getCassetteV2FoldEdges(sourceTree);
  const edgeCount = Number.isInteger(edgeCountByFaceId?.[faceId]) && edgeCountByFaceId[faceId] > 0
    ? edgeCountByFaceId[faceId]
    : 4;
  return Array.from({ length: edgeCount }, (_, edgeIndex) => edgeIndex)
    .filter(edgeIndex => !folds.has(`${faceId}:E${edgeIndex}`))
    .map(edgeIndex => `E${edgeIndex}`);
};

const mirroredCopyBounds = (bounds, item = {}) => {
  if (!bounds) return null;
  const xs = item.mirrorX ? [-bounds.maxX, -bounds.minX] : [bounds.minX, bounds.maxX];
  const ys = item.mirrorY ? [-bounds.maxY, -bounds.minY] : [bounds.minY, bounds.maxY];
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
};

const profileSectionBounds = (operations = []) => {
  const xs = [];
  const ys = [];
  for (const operation of operations || []) {
    for (const ring of operation.polygons || []) {
      for (const vertex of ring || []) {
        const x = Number(vertex?.[0]);
        const y = Number(vertex?.[1]);
        if (Number.isFinite(x)) xs.push(x);
        if (Number.isFinite(y)) ys.push(y);
      }
    }
  }
  if (!xs.length || !ys.length) return null;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
};

// Closed profile sections arranged on a face produce their production
// effect (owner law 2026-10-15): the array settings (or the point
// placement) place the boolean steps and each copy's steps apply to the
// host face — the same boolean pipeline and the same cut.inner layer
// the integral-cut hanger clips ride.
export const profileCutEntitiesForTree = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const foldRefusals = profileFoldEdgeRefusalsForTree(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const entities = [];
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationProfileWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    if (foldRefusals.has(relation.id)) continue; // fold edge: refused
    if (options.contextWorkpieceId && ![relation.sourceWorkpieceId, relation.targetWorkpieceId].includes(options.contextWorkpieceId)) {
      continue;
    }
    const targetCurve = curveById.get(relation.targetFaceId);
    if (!targetCurve) continue;
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const open = profile.section?.open || profile.section?.type === 'polyline';
    if (open) continue; // open profiles splice the contour through the edge embedding
    // Array spacing is the gap between adjacent copies' footprints:
    // the pitch each copy consumes is its own extent along the edge
    // (the section's local Y span — the axis law maps +Y onto the
    // edge) plus the authored spacing, so zero butts copies together.
    const sectionOperations = resolveOccsProfileSectionOperations(profile.section || {});
    const sectionBounds = mirroredCopyBounds(
      profileSectionBounds(sectionOperations || []),
      relation.pattern?.item
    );
    const edgeExtent = sectionBounds ? sectionBounds.maxY - sectionBounds.minY : 0;
    const patternEdgeIndex = profileArrangementEdgeIndex(relation, workpiece, parameters);
    const arrayErrors = [];
    const points = hardwarePointsForRelation(targetCurve, relation, parameters, edgeExtent, sectionBounds, arrayErrors);
    if (arrayErrors.length) {
      const reason = arrayErrors[0];
      if (options.strict) throw new Error(`Profile array placement is invalid (${reason})`);
      if (options.errors) options.errors.push({ relationId: relation.id, reason });
      continue;
    }
    for (let index = 0; index < points.length; index += 1) {
      const pointRotation = Number(points[index]?.rotation) || 0;
      const copyRelation = relation.pattern
        ? {
            ...relation,
            rotation: pointRotation,
            mirrorX: Boolean(relation.pattern.item?.mirrorX),
            mirrorY: Boolean(relation.pattern.item?.mirrorY)
          }
        : relation;
      const operations = await profileOperationPolygons(profile, points[index], copyRelation, targetCurve, parameters);
      if (!operations) continue;
      // Add steps reshape the face contour only; a subtract step
      // renders as an inner cut while it sits fully inside the face.
      operations.forEach((operation, operationIndex) => {
        entities.push({
          id: `${relation.id}:profile_${operation.op}:${points[index]?.key ?? index}:${operationIndex}`,
          layer: OCCS_LAYER_CUT_INNER,
          target: relation.targetFaceId,
          workpieceId: relation.targetWorkpieceId,
          profileWorkpieceId: relation.sourceWorkpieceId,
          relationId: relation.id,
          edgeIndex: patternEdgeIndex,
          geometry: { type: 'polygons', polygons: operation.polygons },
          booleanOperation: operation.op
        });
      });
    }
  }
  return entities;
};

// A sketch face's material region cuts its parent face where the two
// overlap, the same boolean pass a closed profile applies to its host.
// The rings ride the face's shard frame, so the cut lands where the
// editor showed it against the parent ghost.
export const faceSketchCutEntitiesForTree = (curves = []) => {
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const entities = [];
  for (const curve of curves) {
    const node = curve.node;
    if (!node?.parentId || !isCassetteV2SketchFace(node)) continue;
    const rings = curve.faceCutPolygons || [];
    if (!rings.length) continue;
    const parentCurve = curveById.get(node.parentId);
    rings.forEach((ring, index) => {
      entities.push({
        id: `${node.id}:face_cut:${index}`,
        layer: OCCS_LAYER_CUT_INNER,
        target: node.parentId,
        workpieceId: parentCurve?.node?.workpieceId || node.workpieceId,
        faceShapeNodeId: node.id,
        geometry: { type: 'polygon', vertices: ring },
        booleanOperation: 'subtract'
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

const polygonInsideFace = (polygon = [], face = []) => {
  const faceVertices = withoutClosingVertex(face);
  return withoutClosingVertex(polygon).every(point => pointInPolygon(point, faceVertices));
};

const mirroredProfileVertex = (vertex = [], relation = {}) => [
  numeric(vertex?.[0], 0) * (relation.mirrorX ? -1 : 1),
  numeric(vertex?.[1], 0) * (relation.mirrorY ? -1 : 1)
];

// Axis placement (owner law 2026-10-18): the profile's zero axis lands
// on the attachment edge — +X maps onto the edge's inward normal, +Y
// onto the edge direction — with the material half toward the host
// face. Mirrors apply before the relation's rotation; a point placement
// (no edge array) rotates by the relation's rotation alone in the face
// frame.
const profileAxisRotationDegrees = (relation = {}, targetCurve = null) => {
  if (relation.pattern?.space !== 'edge' || !targetCurve) return 0;
  const edgeIndex = edgeIndexFromLabel(relation.pattern.edge, 0);
  const contour = withoutClosingVertex(rawFaceVertices(targetCurve))
    .map(vertex => [numeric(vertex?.[0], 0), numeric(vertex?.[1], 0)]);
  if (contour.length < 3) return 0;
  const start = contour[edgeIndex % contour.length];
  const end = contour[(edgeIndex + 1) % contour.length];
  const edge = [end[0] - start[0], end[1] - start[1]];
  const length = Math.hypot(edge[0], edge[1]);
  if (length <= 1e-6) return 0;
  const centroid = contour
    .reduce((sum, vertex) => [sum[0] + vertex[0], sum[1] + vertex[1]], [0, 0])
    .map(value => value / contour.length);
  const inward = [-(edge[1] / length), edge[0] / length];
  if (inward[0] * (centroid[0] - start[0]) + inward[1] * (centroid[1] - start[1]) < 0) {
    inward[0] = -inward[0];
    inward[1] = -inward[1];
  }
  // +X (the material half) onto the inward normal: the axis rotation is
  // the normal's angle — the profile's own +X sits at 0°.
  return (Math.atan2(inward[1], inward[0]) * 180) / Math.PI;
};

const placeProfileRing = (ring = [], point = [0, 0, 0], relation = {}, axisRotation = 0, scope = {}) => {
  const rotation = axisRotation
    + resolveCassetteV2AngleExpression(relation.rotation || '0', scope, 0);
  return ring.map((vertex) => {
    const local = mirroredProfileVertex(vertex, relation);
    const placed = rotation
      ? rotate2d(local, rotation)
      : local;
    return [
      numeric(point?.[0], 0) + placed[0],
      numeric(point?.[1], 0) + placed[1],
      0
    ];
  });
};

// The placed boolean steps of a closed profile: add rings unite into
// the host face, subtract rings cut from it — placed by the axis law at
// the given point. Polyline sections carry no steps.
const profileOperationPolygons = (profile, point = [0, 0, 0], relation = {}, targetCurve = null, scope = {}) => {
  const section = profile?.section;
  if (!section || section.type === 'polyline') return null;
  const operations = resolveOccsProfileSectionOperations(section);
  if (!operations) return null;
  const axisRotation = profileAxisRotationDegrees(relation, targetCurve);
  const placed = operations
    .map(operation => ({
      op: operation.op,
      polygons: operation.polygons
        .filter(ring => ring.length >= 3)
        .map(ring => placeProfileRing(ring, point, relation, axisRotation, scope))
    }))
    .filter(operation => operation.polygons.length);
  return placed.length ? placed : null;
};

const rotatePolygonAround = (vertices = [], center = [0, 0], angle = 0) => vertices.map((vertex) => {
  const local = [numeric(vertex?.[0], 0) - numeric(center?.[0], 0), numeric(vertex?.[1], 0) - numeric(center?.[1], 0)];
  const rotated = rotate2d(local, angle);
  return [numeric(center?.[0], 0) + rotated[0], numeric(center?.[1], 0) + rotated[1], numeric(vertex?.[2], 0)];
});

const hardwareProductionEntitiesForTree = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const entities = [];
  for (const relation of getCassetteV2WorkpieceRelations(sourceTree)) {
    const workpiece = relationHardwareWorkpiece(sourceTree, relation);
    if (!workpiece) continue;
    const hardware = normalizeCassetteV2Hardware(workpiece);
    const targetCurve = curveById.get(relation.targetFaceId);
    if (!targetCurve) continue;
    const arrayErrors = [];
    const points = hardwarePointsForRelation(
      targetCurve,
      relation,
      parameters,
      0,
      hardwareCopyBounds(hardware),
      arrayErrors
    );
    if (arrayErrors.length) {
      const reason = arrayErrors[0];
      if (options.strict) throw new Error(`Hardware array placement is invalid (${reason})`);
      if (options.errors) options.errors.push({ relationId: relation.id, reason });
      continue;
    }
    if (hardware.family === 'hanger_clip' && hardware.productionMode === 'integralCut') {
      const profile = workpiece.profileSnapshot || workpiece.profile
        ? normalizeCassetteV2Profile(workpiece, parameters)
        : null;
      for (let index = 0; index < points.length; index += 1) {
        const pointRotation = Number(points[index]?.rotation) || 0;
        const copyRelation = relation.pattern
          ? {
              ...relation,
              rotation: pointRotation,
              mirrorX: Boolean(relation.pattern.item?.mirrorX),
              mirrorY: Boolean(relation.pattern.item?.mirrorY)
            }
          : relation;
        const profileOperations = profile
          ? await profileOperationPolygons(profile, points[index], copyRelation, targetCurve, parameters)
          : null;
        if (profileOperations) {
          profileOperations.forEach((operation, operationIndex) => {
            entities.push({
              id: `${relation.id}:hook_${operation.op}:${points[index]?.key ?? index}:${operationIndex}`,
              layer: OCCS_LAYER_CUT_INNER,
              target: relation.targetFaceId,
              workpieceId: relation.targetWorkpieceId,
              hardwareWorkpieceId: relation.sourceWorkpieceId,
              relationId: relation.id,
              geometry: { type: 'polygons', polygons: operation.polygons },
              booleanOperation: operation.op
            });
          });
          continue;
        }
        const geometry = {
          type: 'polygon',
          vertices: rotatePolygonAround(
            hangerClipCutPolygon(hardware.parameters, points[index]),
            points[index],
            pointRotation
          )
        };
        entities.push({
          id: `${relation.id}:hook_cut:${points[index]?.key ?? index}`,
          layer: OCCS_LAYER_CUT_INNER,
          target: relation.targetFaceId,
          workpieceId: relation.targetWorkpieceId,
          hardwareWorkpieceId: relation.sourceWorkpieceId,
          relationId: relation.id,
          geometry,
          booleanOperation: 'subtract'
        });
      }
    }
    if (OCCS_HOLE_HARDWARE_FAMILIES.includes(hardware.family)) {
      points.forEach((point, index) => {
        entities.push({
          id: `${relation.id}:hole:${points[index]?.key ?? index}`,
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
        });
      });
    }
  }
  return entities;
};

// The boolean result's hole rings — the inner cut geometry every
// output carries (owner law 2026-10-19: the production entity stream
// rides the region fold; operand primitives are the recipe, the
// folded region is the product). A ring attributes to the relation
// of the operand it swallows (selection metadata; merged rings stamp
// the first contributor).
const ringCentroid = (ring = []) => {
  const points = withoutClosingVertex(ring);
  if (!points.length) return null;
  const total = points.reduce((acc, point) => [acc[0] + numeric(point?.[0], 0), acc[1] + numeric(point?.[1], 0)], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
};

export const resultInnerCutEntities = (curves = [], operandEntities = []) => curves.flatMap(curve => {
  const operands = operandEntities
    .filter(entity => entity.target === curve.node?.id && entity.booleanOperation !== 'add')
    .map(entity => ({
      relationId: entity.relationId,
      profileWorkpieceId: entity.profileWorkpieceId,
      hardwareWorkpieceId: entity.hardwareWorkpieceId,
      centroids: productionEntityCutRings(entity).map(ringCentroid)
    }));
  return (curve.holes || [])
    .filter(ring => withoutClosingVertex(ring).length >= 3)
    .map((ring, index) => {
      const contributor = operands.find(candidate => (
        candidate.centroids.some(centroid => centroid && pointInPolygon(centroid, ring))
      ));
      return {
        id: `${curve.node?.id || 'face'}:IH${index}`,
        layer: OCCS_LAYER_CUT_INNER,
        target: curve.node?.id,
        workpieceId: curve.node?.workpieceId,
        relationId: contributor?.relationId,
        profileWorkpieceId: contributor?.profileWorkpieceId,
        hardwareWorkpieceId: contributor?.hardwareWorkpieceId,
        geometry: { type: 'polygon', vertices: ring }
      };
    });
});

const cutLayerFor = (code, entities = []) => {
  const paths = entities.map(entity => ({
    d: entity.geometry.type === 'circle'
      ? circlePathAt(entity.geometry.center, entity.geometry.diameter)
      : productionEntityCutRings(entity).map(occsCurveToPath).join(' '),
    fill: 'none',
    stroke: 'layer',
    workpieceId: entity.workpieceId,
    hardwareWorkpieceId: entity.hardwareWorkpieceId,
    relationId: entity.relationId,
    productionEntityId: entity.id
  }));
  return paths.length
    ? [{
        name: occsLayerExportName(code),
        standardCode: code,
        role: 'cut',
        color: 'currentColor',
        weight: 1,
        dasharray: 'none',
        paths
      }]
    : [];
};

const hardwareProductionLayers = (entities = [], curves = []) => [
  ...cutLayerFor(OCCS_LAYER_CUT_INNER, resultInnerCutEntities(curves, entities)),
  ...cutLayerFor(
    OCCS_LAYER_CUT_HOLE,
    entities.filter(entity => entity.layer === OCCS_LAYER_CUT_HOLE)
  )
];

const hookCutEntitiesByTarget = (entities = []) => {
  const byTarget = new Map();
  for (const entity of entities) {
    if (!entity.booleanOperation && entity.layer !== OCCS_LAYER_CUT_INNER) continue;
    if (entity.geometry?.type !== 'polygon' && entity.geometry?.type !== 'polygons') continue;
    if (!byTarget.has(entity.target)) byTarget.set(entity.target, []);
    byTarget.get(entity.target).push(entity);
  }
  return byTarget;
};

// A cut entity's operand rings: a polygons entity carries many, a
// polygon entity one.
const productionEntityCutRings = (entity = {}) => (
  entity.geometry?.type === 'polygons'
    ? entity.geometry.polygons
    : entity.geometry?.type === 'polygon'
      ? [entity.geometry.vertices]
      : []
);

// The boolean steps a target face's entities carry, in entity order —
// the authored CSG sequence (owner direction 2026-10-19: a later add
// refills an earlier cut).
export const cassetteV2BooleanOperationsForEntities = (entities = []) => entities
  .map(entity => ({
    op: entity.booleanOperation === 'add' ? 'add' : 'subtract',
    polygons: productionEntityCutRings(entity)
  }))
  .filter(operation => operation.polygons.length);

// The face boolean pass: adds unite into the face region, subtracts cut
// from it. The face is the largest ring of the fold (rings sort by
// area), so material islanded off the face stays off its contour.
const applyHardwareBooleanDifferences = async (curves = [], productionEntities = []) => {
  const cutsByTarget = hookCutEntitiesByTarget(productionEntities);
  if (!cutsByTarget.size) return curves;

  return Promise.all(curves.map(async (curve) => {
    const operations = cassetteV2BooleanOperationsForEntities(cutsByTarget.get(curve.node?.id) || []);
    if (!operations.length) return curve;
    const baseBoundary = curve.boundaryVertices || curve.vertices;
    const region = await foldCassetteV2Region(
      { polygons: [baseBoundary], holes: curve.holes || [] },
      operations
    );
    const outer = region.polygons[0];
    if (!outer?.length) return curve;
    return {
      ...curve,
      originalBoundaryVertices: curve.originalBoundaryVertices || baseBoundary,
      referenceVertices: curve.referenceVertices || baseBoundary,
      boundaryVertices: outer,
      vertices: outer,
      holes: region.holes,
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

const dimensionControlsForNode = (node, vertices = []) => {
  if (isCassetteV2SketchFace(node)) return [];
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

const foldedPreviewProductionEntitiesForTree = async (curves = [], tree = createCassetteV2GraphTree()) => {
  // The curves arrive folded — their holes are the boolean result.
  const operandEntities = [
    ...(await profileCutEntitiesForTree(curves, tree)),
    ...faceSketchCutEntitiesForTree(curves),
    ...(await hardwareProductionEntitiesForTree(curves, tree))
  ];
  return [
    ...resultInnerCutEntities(curves, operandEntities).map(entity => ({
      id: entity.id,
      layer: entity.layer,
      targetFaceId: entity.target,
      workpieceId: entity.workpieceId,
      relationId: entity.relationId,
      geometry: entity.geometry
    })),
    ...operandEntities
      .filter(entity => entity.layer === OCCS_LAYER_CUT_HOLE)
      .map(entity => ({
        id: entity.id,
        layer: entity.layer,
        targetFaceId: entity.target,
        workpieceId: entity.workpieceId,
        relationId: entity.relationId,
        geometry: entity.geometry
      }))
  ];
};

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
        pattern: relation.pattern ? resolveArrayDefinition(
          relation.pattern,
          (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback),
          (value, fallback = 0) => resolveCassetteV2AngleExpression(value, parameters, fallback)
        ) : null,
        copyBounds: hardwareCopyBounds(hardware),
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

const foldedPreviewForTree = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
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
  const curveById = new Map(curves.map(curve => [curve.node.id, curve]));
  const folds = (tree.nodes || [])
    .filter(node => node.parentId)
    .map((node) => {
      const parentCurve = curveById.get(node.parentId);
      const parentVertices = withoutClosingVertex(rawFaceVertices(parentCurve));
      const edgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
      const vertex = parentVertices[edgeIndex];
      const next = parentVertices[(edgeIndex + 1) % parentVertices.length];
      let childFoldStart = null;
      let childFoldEnd = null;
      if (vertex && next) {
        const edgeLength = Math.hypot(
          numeric(next[0], 0) - numeric(vertex[0], 0),
          numeric(next[1], 0) - numeric(vertex[1], 0)
        );
        if (edgeLength > 0.001) {
          const scope = nodeExpressionScope(node, parameters);
          const start = Math.max(0, Math.min(edgeLength, resolveCassetteV2Expression(node.parameters?.edgeStart, scope, 0)));
          const rawWidth = node.parameters?.defaultLength;
          const end = rawWidth === 'inherit' || rawWidth === undefined
            ? edgeLength
            : Math.max(start, Math.min(edgeLength, start + resolveCassetteV2Expression(rawWidth, scope, edgeLength - start)));
          childFoldStart = pointAlong(vertex, next, start / edgeLength);
          childFoldEnd = pointAlong(vertex, next, end / edgeLength);
        }
      }
      return {
        parentId: node.parentId,
        childId: node.id,
        parentEdgeIndex: edgeIndex,
        childEdgeIndex: edgeIndexFromLabel(node.attachEdge, 0),
        childAttachEdge: node.attachEdge || 'E0',
        childFoldStart,
        childFoldEnd,
        angle: resolveCassetteV2AngleExpression(foldAngleFromNode(node), parameters, 90)
      };
    });
  const joints = options.includeJoints
    ? getCassetteV2WorkpieceRelations(tree)
      .filter(relation => !relationProfileWorkpiece(tree, relation))
      .map(relation => ({
        id: relation.id,
        sourceWorkpieceId: relation.sourceWorkpieceId,
        sourceFaceId: relation.sourceFaceId,
        sourceSnap: relation.sourceSnap,
        sourceSide: relation.sourceSide,
        targetWorkpieceId: relation.targetWorkpieceId,
        targetFaceId: relation.targetFaceId,
        targetSnap: relation.targetSnap,
        targetSide: relation.targetSide,
        offsetX: resolveCassetteV2Expression(relation.offsetX, parameters, 0),
        offsetY: resolveCassetteV2Expression(relation.offsetY, parameters, 0),
        sourceOffsetX: resolveCassetteV2Expression(relation.sourceOffsetX, parameters, 0),
        sourceOffsetY: resolveCassetteV2Expression(relation.sourceOffsetY, parameters, 0),
        rotation: resolveCassetteV2AngleExpression(relation.rotation, parameters, 0),
        driver: relation.driver,
        pattern: relation.pattern
      }))
    : [];
  const bodies = foldedPreviewBodiesForTree(tree, parameters);
  const cutouts = await foldedPreviewProductionEntitiesForTree(curves, tree);

  return buildOccsFoldedPreviewPayload({ faces, folds, joints, bodies, cutouts });
};

const dimensionLabelValue = (value) => {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const nearestEdgeProjection = (vertices = [], point = [0, 0]) => {
  let best = null;
  for (let index = 0; index < vertices.length; index += 1) {
    const [ax, ay] = vertices[index];
    const [bx, by] = vertices[(index + 1) % vertices.length];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSquared))
      : 0;
    const x = ax + dx * t;
    const y = ay + dy * t;
    const distance = Math.hypot(x - point[0], y - point[1]);
    if (!best || distance < best.distance) {
      best = { index, along: t * Math.sqrt(lengthSquared), distance };
    }
  }
  return best;
};

const appendCassetteDimensionAnnotations = (drawing, annotations = []) => {
  if (!annotations.length) return;
  drawing.dimensionAnnotations = [...(drawing.dimensionAnnotations || []), ...annotations];
  if (!drawing.layers.some(layer => layer.role === 'dimension' || layer.standardCode === OCCS_LAYER_DIMENSION_CASSETTE)) {
    drawing.layers.push({
      name: occsLayerExportName(OCCS_LAYER_DIMENSION_CASSETTE),
      standardCode: OCCS_LAYER_DIMENSION_CASSETTE,
      role: 'dimension',
      color: 'currentColor',
      weight: 1,
      dasharray: 'none',
      paths: []
    });
  }
};

// The selected face/profile inner dimensions in assembly coordinates:
// the same shape dimensions its editor draws, placed at the target.
const selectionDimensionAnnotations = async (tree = createCassetteV2GraphTree(), options = {}) => {
  const parameters = treeParameters(tree);
  let sketch = null;
  let evaluated = null;
  let frame = null;
  let selectionType = '';
  let targetId = '';
  if (options.selectedRelationId) {
    const relation = getCassetteV2WorkpieceRelations(tree)
      .find(item => item.id === options.selectedRelationId);
    const workpiece = tree.workpieces.find(item => item.id === relation?.sourceWorkpieceId);
    if (!relation || !workpiece) return [];
    const profile = normalizeCassetteV2Profile(workpiece, parameters);
    const derived = deriveOccsProfileSketch(
      profile.sketch,
      resolveInstanceParameters(profile.sketch, profile.instance, parameters)
    );
    evaluated = evaluateOccsProfileSketch(derived, parameters);
    sketch = profile.sketch;
    selectionType = 'profileShape';
    targetId = workpiece.id;
    frame = await cassetteV2SketchFrame(tree, { mode: 'profile', id: workpiece.id });
  } else if (options.selectedFaceId) {
    const node = tree.nodes.find(item => item.id === options.selectedFaceId);
    if (!node || !isCassetteV2SketchFace(node)) return [];
    const face = normalizeCassetteV2Face(node, parameters);
    evaluated = evaluateOccsProfileSketch(face.derivedSketch, parameters);
    sketch = face.sketch;
    selectionType = 'faceShape';
    targetId = node.id;
    frame = await cassetteV2SketchFrame(tree, { mode: 'face', id: node.id });
  }
  if (!evaluated || !frame) return [];
  const { dimensions } = buildProfileAnnotations({ evaluated, authored: sketch });
  const toWorld = (point) => {
    const mirroredX = frame.mirrorX ? -numeric(point?.x, 0) : numeric(point?.x, 0);
    const mirroredY = frame.mirrorY ? -numeric(point?.y, 0) : numeric(point?.y, 0);
    const anchorX = Array.isArray(frame.anchor) ? numeric(frame.anchor[0], 0) : 0;
    const anchorY = Array.isArray(frame.anchor) ? numeric(frame.anchor[1], 0) : 0;
    const radians = numeric(frame.rotation, 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = mirroredX - anchorX;
    const dy = mirroredY - anchorY;
    return {
      x: numeric(frame.origin?.[0], 0) + dx * cos - dy * sin,
      y: numeric(frame.origin?.[1], 0) + dx * sin + dy * cos
    };
  };
  return dimensions.map((dimension) => {
    const p1 = dimension.p1 ? toWorld(dimension.p1) : null;
    const p2 = dimension.p2 ? toWorld(dimension.p2) : null;
    const loc = dimension.loc ? toWorld(dimension.loc) : null;
    const center = dimension.c ? toWorld(dimension.c) : null;
    return {
      kind: dimension.kind,
      from: p1 ? [p1.x, p1.y] : null,
      to: p2 ? [p2.x, p2.y] : null,
      loc: loc ? [loc.x, loc.y] : null,
      ...(center ? { center: [center.x, center.y] } : {}),
      rot: p1 && p2 && dimension.kind === 'linear'
        ? Math.atan2(p2.y - p1.y, p2.x - p1.x)
        : dimension.rot,
      text: dimension.text,
      key: dimension.annotationKey,
      nodeId: targetId,
      selectionType,
      targetId,
      shapeId: dimension.profile?.shapeId,
      shapeIds: dimension.profile?.shapeIds || (dimension.profile?.shapeId ? [dimension.profile.shapeId] : []),
      fieldKey: dimension.profile?.fieldKey,
      dimensionKind: 'inner',
      style: dimension.st
    };
  });
};

// A selected profile's placement dimensions run along its parent edge:
// the edge ends and the profile basis point chain the measured offsets.
const placementDimensionAnnotations = (curves = [], tree = createCassetteV2GraphTree(), relationId = '') => {
  if (!relationId) return [];
  const relation = getCassetteV2WorkpieceRelations(tree)
    .find(item => item.id === relationId && item.targetFaceId);
  if (!relation) return [];
  const targetCurve = curves.find(curve => curve.node.id === relation.targetFaceId);
  const workpiece = tree.workpieces.find(item => item.id === relation.sourceWorkpieceId);
  if (!targetCurve || !workpiece) return [];
  const parameters = treeParameters(tree);
  const profile = normalizeCassetteV2Profile(workpiece, parameters);
  const open = profile.section?.open || profile.section?.type === 'polyline';
  const vertices = withoutClosingVertex(rawFaceVertices(targetCurve))
    .map(vertex => [numeric(vertex?.[0], 0), numeric(vertex?.[1], 0)]);
  if (vertices.length < 2) return [];
  const sectionOperations = resolveOccsProfileSectionOperations(profile.section || {});
  const sectionBounds = mirroredCopyBounds(profileSectionBounds(sectionOperations || []), relation.pattern?.item);
  const edgeExtent = sectionBounds ? sectionBounds.maxY - sectionBounds.minY : 0;
  let edgeIndex = 0;
  let alongs = [];
  if (relation.pattern?.space === 'edge') {
    edgeIndex = edgeIndexFromLabel(relation.pattern.edge, 0);
    const layout = expandOccsEdgeArray2d({
      vertices: rawFaceVertices(targetCurve),
      pattern: relation.pattern,
      binding: relation.pattern.binding,
      copyLength: edgeExtent,
      copyMin: sectionBounds ? -sectionBounds.maxY : 0,
      resolve: (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback)
    });
    alongs = layout.ok ? layout.points.map(point => point.along) : [];
  } else {
    let basis = null;
    if (open) {
      const embedding = profileEdgeEmbeddingsForTree(curves, tree)
        .find(item => item.relationId === relation.id && item.embedding?.ok);
      basis = embedding?.embedding?.frame?.origin || null;
    } else {
      basis = hardwarePointsForRelation(targetCurve, relation, parameters, edgeExtent, sectionBounds)[0] || null;
    }
    if (!basis) return [];
    const projection = nearestEdgeProjection(vertices, [numeric(basis[0], 0), numeric(basis[1], 0)]);
    if (!projection) return [];
    edgeIndex = projection.index;
    alongs = [projection.along];
  }
  const start = vertices[edgeIndex];
  const end = vertices[(edgeIndex + 1) % vertices.length];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const edgeLength = Math.hypot(dx, dy);
  if (!(edgeLength > 0.001)) return [];
  const axisX = dx / edgeLength;
  const axisY = dy / edgeLength;
  const centroid = centroidForVertices(vertices);
  const edgeMid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const normal = ((edgeMid[0] - centroid[0]) * -axisY + (edgeMid[1] - centroid[1]) * axisX) > 0
    ? [-axisY, axisX]
    : [axisY, -axisX];
  const pointsAlong = [0, ...alongs.map(value => Math.max(0, Math.min(edgeLength, value))), edgeLength]
    .sort((left, right) => left - right)
    .filter((value, index, list) => index === 0 || value - list[index - 1] > 0.5);
  const annotations = [];
  for (let index = 0; index + 1 < pointsAlong.length; index += 1) {
    const from = pointsAlong[index];
    const to = pointsAlong[index + 1];
    if (to - from < 0.5) continue;
    const p1 = [start[0] + axisX * from, start[1] + axisY * from];
    const p2 = [start[0] + axisX * to, start[1] + axisY * to];
    annotations.push({
      nodeId: null,
      key: null,
      dimensionKind: 'placement',
      from: p1,
      to: p2,
      loc: [
        (p1[0] + p2[0]) / 2 + normal[0] * 34,
        (p1[1] + p2[1]) / 2 + normal[1] * 34
      ],
      rot: Math.atan2(dy, dx),
      text: dimensionLabelValue(to - from)
    });
  }
  return annotations;
};

const buildLayoutDrawingFromCurves = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  // Profiles modify face geometry (owner law 2026-10-15): the open
  // profile chain splices into the boundary, closed sections and
  // hardware subtract — every consumer of the face, 2D drawing and
  // folded 3D alike, sees the SAME modified geometry.
  const openProfileHits = [];
  const spliceProfileEmbeddings = (sourceCurves, embeddingErrors, profileHits = null) => {
    const embeddingsByFace = new Map();
    for (const item of profileEdgeEmbeddingsForTree(sourceCurves, tree)) {
      if (!item.embedding.ok) {
        embeddingErrors.push({ relationId: item.relationId, reason: item.embedding.reason });
        continue;
      }
      if (profileHits) {
        item.embedding.copies.forEach((points, index) => {
          const d = occsCurveToPath(points);
          if (!d) return;
          profileHits.push({
            id: `${item.relationId}:open:${index}`,
            workpieceId: item.profileWorkpieceId,
            relationId: item.relationId,
            open: true,
            d,
            center: centroidForVertices(points)
          });
        });
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
  profileFoldEdgeRefusalsForTree(tree).forEach((faceId, relationId) => {
    profileEmbeddingErrors.push({ relationId, reason: 'fold-edge' });
  });
  const arrayErrors = [];
  const embeddedCurves = spliceProfileEmbeddings(curves, profileEmbeddingErrors, openProfileHits);
  const productionEntities = [
    ...await profileCutEntitiesForTree(curves, tree, { errors: arrayErrors }),
    ...faceSketchCutEntitiesForTree(curves),
    ...await hardwareProductionEntitiesForTree(curves, tree, { errors: arrayErrors })
  ];
  const closedProfileHits = productionEntities
    .filter(entity => entity.profileWorkpieceId && entity.geometry?.polygons?.length)
    .map(entity => {
      const polygons = entity.geometry.polygons;
      return {
        id: entity.id,
        workpieceId: entity.profileWorkpieceId,
        relationId: entity.relationId,
        open: false,
        d: polygons.map(occsCurveToPath).filter(Boolean).join(' '),
        center: centroidForVertices(polygons[0])
      };
    })
    .filter(hit => hit.d);
  const shapedCurves = await applyHardwareBooleanDifferences(embeddedCurves, productionEntities);
  // The folded 3D rides the local (untransformed) curves in assembly
  // mode: their modification pass runs in the same space — local
  // embedding, local cut entities — so the folded faces carry the
  // stitched boundary and the cuts exactly as the 2D drawing does.
  let foldedPreviewCurves = shapedCurves;
  if (options.foldedPreviewCurves) {
    const localEmbedded = spliceProfileEmbeddings(options.foldedPreviewCurves, []);
    const localEntities = [
      ...await profileCutEntitiesForTree(options.foldedPreviewCurves, tree),
      ...faceSketchCutEntitiesForTree(options.foldedPreviewCurves),
      ...await hardwareProductionEntitiesForTree(options.foldedPreviewCurves, tree)
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
    designerEdgesForBoundary(curve.node.id, curve.labelBoundaryVertices, tree)
  ));
  const designerFoldEdges = designerFoldEdgesForTree(shapedCurves, tree);
  const foldedPreview = await foldedPreviewForTree(foldedPreviewCurves, tree, { includeJoints: options.includeFoldedPreviewJoints });
  const designerSections = designerSectionsForTree(shapedCurves, foldedPreview, tree);
  const hardwareLayers = hardwareProductionLayers(productionEntities, shapedCurves);
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
      dimensionControls: dimensionControlsForNode(curve.node, labelBoundary)
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
    const dimensionLayers = drawing.layers.filter(layer => layer.role === 'dimension');
    const assemblyLayers = await designerAssemblyLayersForCurves(shapedCurves, [designerSections.layer, markLayer], {
      contextWorkpieceId: options.contextWorkpieceId,
      foldEdges: designerFoldEdges
    });
    drawing.layers = assemblyLayers.concat(hardwareLayers, dimensionLayers);
  }
  drawing.designerAttachmentMarkers = designerAttachmentMarkers;
  drawing.designerProfiles = [...closedProfileHits, ...openProfileHits];
  drawing.profileEmbeddingErrors = profileEmbeddingErrors;
  drawing.attachmentErrors = [...profileEmbeddingErrors, ...arrayErrors];
  drawing.faceEdgeCounts = Object.fromEntries(drawingCurves.map((curve) => {
    const boundary = curve.labelBoundaryVertices || curve.boundaryVertices || curve.vertices || [];
    return [curve.node.id, withoutClosingVertex(boundary).length];
  }));
  drawing.faceEdgeLengths = Object.fromEntries(drawingCurves.map((curve) => {
    const ring = withoutClosingVertex(curve.labelBoundaryVertices || curve.boundaryVertices || curve.vertices || []);
    return [curve.node.id, ring.map((point, index) => {
      const next = ring[(index + 1) % ring.length];
      return Math.round(Math.hypot(
        numeric(next?.[0], 0) - numeric(point?.[0], 0),
        numeric(next?.[1], 0) - numeric(point?.[1], 0)
      ) * 1000) / 1000;
    })];
  }));
  appendCassetteDimensionAnnotations(
    drawing,
    placementDimensionAnnotations(drawingCurves, tree, options.selectedRelationId)
  );
  appendCassetteDimensionAnnotations(
    drawing,
    await selectionDimensionAnnotations(tree, options)
  );
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

// Snap points and array bindings read the RAW authored face (owner law
// 2026-10-17): a face cut by closed profiles keeps its authored outline
// in originalBoundaryVertices/referenceVertices while vertices and
// boundaryVertices carry the merged cut geometry — placement anchors
// must not drift with the cut.
const rawFaceVertices = (curve) => curve?.originalBoundaryVertices
  || curve?.referenceVertices
  || curve?.boundaryVertices
  || curve?.vertices
  || [];

// The face's attachment edge is E0: the outer ring rotates so its edge
// on the datum line (y = 0, running +X) starts the ring. Fold routes
// hinge on that index for trapezoid and sketch faces alike.
const rotateSketchRingToAttachment = (ring = []) => {
  const points = ring.map(point => [numeric(point?.[0], 0), numeric(point?.[1], 0), 0]);
  const closed = points.length > 1 && pointsEqual(points[0], points[points.length - 1]);
  const open = closed ? points.slice(0, -1) : points;
  let index = -1;
  let best = { distance: Infinity, x: Infinity };
  for (let current = 0; current < open.length; current += 1) {
    const from = open[current];
    const to = open[(current + 1) % open.length];
    if (to[0] - from[0] <= 0.001) continue;
    const distance = Math.max(Math.abs(from[1]), Math.abs(to[1]));
    if (distance < best.distance - 0.001
      || (Math.abs(distance - best.distance) <= 0.001 && from[0] < best.x)) {
      index = current;
      best = { distance, x: from[0] };
    }
  }
  if (index < 0) return points;
  const rotated = [...open.slice(index), ...open.slice(0, index)];
  return closed ? [...rotated, rotated[0]] : rotated;
};

// A face sketch resolves through the same ordered boolean fold the
// profile section uses: adds form the face, subtracts cut it. The face's
// material region (outer rings minus holes) also cuts the parent where
// the face overlaps it. The result is the region on the child's side of
// the datum (y >= 0 in shard coordinates), and the editor's hatch
// evaluates through this same fold.
// A face's base host in the sketch frame: the trapezoid the node carries
// before its shape set applies. A face sketch is a boolean modifier set
// over this host, exactly as a profile modifies the face it attaches to.
const faceBaseLocalRing = (node, parameters, parentBoundaryVertices, frame) => {
  const trapezoid = resolvedNodeTrapezoidForGeometry(node, parameters, parentBoundaryVertices || null);
  const vertices = buildCassetteV2TrapezoidVertices({
    ...trapezoid,
    edgeStart: node.parentId ? trapezoid.edgeStart : 0
  }, {
    parentVertices: parentBoundaryVertices || null,
    parentEdgeIndex: node.parentId ? node.parentEdgeIndex : trapezoid.parentEdgeIndex
  });
  return sketchRingInFrame(vertices, frame).map(([x, y]) => [
    x - (node.parentId ? numeric(trapezoid.edgeStart, 0) : 0),
    y
  ]);
};

export const resolveCassetteV2FaceSketchGeometry = async (face = {}, parameters = {}, basePolygons = []) => {
  const evaluated = evaluateOccsProfileSketch(
    face.derivedSketch || normalizeOccsProfileSketch(face.sketch || face),
    parameters
  );
  const { section } = buildOccsProfileFromEvaluatedSketch(evaluated);
  const operations = resolveOccsProfileSectionOperations(section) || [];
  // Add shapes author the face: they replace the base host. A set with
  // no add is a modifier set, so it cuts the face's base host instead.
  const hasAdd = operations.some(operation => operation.op === 'add');
  const base = hasAdd
    ? []
    : (Array.isArray(basePolygons) ? basePolygons : [basePolygons])
      .filter(ring => Array.isArray(ring) && ring.length >= 3);
  const region = await foldCassetteV2Region({ polygons: base, holes: [] }, operations);
  // Every participating shape cuts the parent where it lands: the cut
  // footprint is the union of the adds and subtracts. The child face
  // keeps the ordered fold result on its side of the datum.
  const cutRegion = await foldCassetteV2Region(
    { polygons: [], holes: [] },
    operations.map(operation => ({ op: 'add', polygons: operation.polygons }))
  );
  const span = 1e5;
  const clipped = await foldCassetteV2Region(
    { polygons: region.polygons, holes: region.holes },
    [{ op: 'subtract', polygons: [[[-span, -span], [span, -span], [span, 0], [-span, 0]]] }]
  );
  return {
    outer: clipped.polygons[0] ? rotateSketchRingToAttachment(clipped.polygons[0]) : null,
    holes: clipped.holes,
    polygons: clipped.polygons,
    cuts: cutRegion.polygons.filter(ring => ring.length >= 3)
  };
};

export const resolveCassetteV2FaceSketchRegion = async (source = {}, parameters = {}, basePolygons = []) => {
  const face = normalizeCassetteV2Face(source, parameters);
  const { outer, holes, polygons } = await resolveCassetteV2FaceSketchGeometry(face, parameters, basePolygons);
  return { outer, holes, polygons };
};

const placeSketchRing = (ring = [], frame) => ring.map(point => [
  numeric(frame.start[0], 0) + numeric(frame.direction[0], 0) * numeric(point[0], 0) + numeric(frame.normal[0], 0) * numeric(point[1], 0),
  numeric(frame.start[1], 0) + numeric(frame.direction[1], 0) * numeric(point[0], 0) + numeric(frame.normal[1], 0) * numeric(point[1], 0),
  0
]);

const sketchRingInFrame = (ring = [], frame) => ring.map((point) => {
  const dx = numeric(point?.[0], 0) - numeric(frame.start[0], 0);
  const dy = numeric(point?.[1], 0) - numeric(frame.start[1], 0);
  return [
    dx * numeric(frame.direction[0], 0) + dy * numeric(frame.direction[1], 0),
    dx * numeric(frame.normal[0], 0) + dy * numeric(frame.normal[1], 0)
  ];
});

const buildCassetteV2LocalTreeCurves = async (sourceTree) => {
  const parameters = treeParameters(sourceTree);
  const entryById = new Map();
  const curves = [];

  for (const node of orderedTreeNodes(sourceTree)) {
    const parentEntry = node.parentId ? entryById.get(node.parentId) : null;
    if (node.parentId && !parentEntry) continue;

    const frame = cassetteV2FaceAttachmentFrame(
      parentEntry?.boundaryVertices || null,
      node.parentId ? node.parentEdgeIndex : 0
    );

    if (isCassetteV2SketchFace(node)) {
      const edgeStart = node.parentId
        ? Math.max(0, resolveCassetteV2Expression(node.parameters?.edgeStart, nodeExpressionScope(node, parameters), 0))
        : 0;
      const shiftedFrame = {
        ...frame,
        start: [
          numeric(frame.start[0], 0) + numeric(frame.direction[0], 0) * edgeStart,
          numeric(frame.start[1], 0) + numeric(frame.direction[1], 0) * edgeStart,
          0
        ]
      };
      const baseLocalVertices = faceBaseLocalRing(
        node,
        parameters,
        parentEntry?.boundaryVertices || null,
        frame
      );
      // Zero geometry (no shapes): the face renders nothing, holds its
      // shard interval, and stays selectable through its base ring.
      if (!normalizeOccsProfileSketch(node.sketch).shapes.length) {
        const baseRing = withoutClosingVertex(placeSketchRing(baseLocalVertices, shiftedFrame));
        const emptyEntry = {
          node,
          vertices: [],
          boundaryVertices: [],
          holes: [],
          localVertices: [],
          localHoles: [],
          baseLocalVertices,
          faceCutPolygons: [],
          frame: shiftedFrame,
          referenceVertices: baseRing,
          labelBoundaryVertices: baseRing,
          shapeType: 'polygon',
          trapezoid: null,
          dimensionLabels: {},
          zeroGeometry: true
        };
        entryById.set(node.id, emptyEntry);
        curves.push(emptyEntry);
        continue;
      }
      let region;
      try {
        region = await resolveCassetteV2FaceSketchGeometry(
          normalizeCassetteV2Face(node, parameters),
          parameters,
          [baseLocalVertices]
        );
      } catch {
        // A sketch whose table does not resolve keeps the face on its base
        // host (the drawing-is-sacred law, occs/README.md).
        region = { outer: baseLocalVertices, holes: [], polygons: [baseLocalVertices], cuts: [] };
      }
      const localVertices = region.outer || [];
      const localHoles = region.holes;
      const vertices = placeSketchRing(localVertices, shiftedFrame);
      const boundaryVertices = withoutClosingVertex(vertices);
      const entry = {
        node,
        vertices,
        boundaryVertices,
        holes: localHoles.map(ring => placeSketchRing(ring, shiftedFrame)),
        localVertices,
        localHoles,
        baseLocalVertices,
        faceCutPolygons: region.cuts.map(ring => placeSketchRing(ring, shiftedFrame)),
        frame: shiftedFrame,
        referenceVertices: boundaryVertices,
        shapeType: 'polygon',
        trapezoid: null,
        dimensionLabels: {}
      };
      entryById.set(node.id, entry);
      curves.push(entry);
      continue;
    }

    const trapezoid = resolvedNodeTrapezoidForGeometry(node, parameters, parentEntry?.boundaryVertices || null);
    let vertices = buildCassetteV2TrapezoidVertices({
      ...trapezoid,
      edgeStart: node.parentId ? trapezoid.edgeStart : 0
    }, {
      parentVertices: parentEntry?.boundaryVertices || null,
      parentEdgeIndex: node.parentId ? node.parentEdgeIndex : trapezoid.parentEdgeIndex
    });
    const entry = {
      node,
      vertices,
      boundaryVertices: withoutClosingVertex(vertices),
      localVertices: sketchRingInFrame(vertices, frame).map(([x, y]) => [
        x - (node.parentId ? numeric(trapezoid.edgeStart, 0) : 0),
        y
      ]),
      frame,
      trapezoid,
      dimensionLabels: dimensionLabelsForNode(node)
    };

    entryById.set(node.id, entry);
    curves.push(entry);
  }

  const childrenByEdge = new Map();
  for (const curve of curves) {
    if (!curve.node.parentId) continue;
    const key = `${curve.node.parentId}:${Math.max(0, Math.round(numeric(curve.node.parentEdgeIndex, 0)))}`;
    if (!childrenByEdge.has(key)) childrenByEdge.set(key, []);
    childrenByEdge.get(key).push(curve);
  }
  for (const [key, children] of childrenByEdge) {
    if (children.length < 2) continue;
    const [parentId, edgeIndex] = key.split(':');
    const parentEntry = entryById.get(parentId);
    if (!parentEntry) continue;
    const frame = cassetteV2FaceAttachmentFrame(parentEntry.boundaryVertices, edgeIndex);
    const along = (point) => (
      (numeric(point?.[0], 0) - numeric(frame.start[0], 0)) * numeric(frame.direction[0], 0)
      + (numeric(point?.[1], 0) - numeric(frame.start[1], 0)) * numeric(frame.direction[1], 0)
    );
    const intervals = children.map((curve) => {
      const vertices = withoutClosingVertex(curve.referenceVertices || curve.boundaryVertices || curve.vertices);
      const at = edgeIndexFromLabel(curve.node.attachEdge, 0);
      const start = along(vertices[at]);
      const end = along(vertices[(at + 1) % vertices.length]);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    }).sort((left, right) => left.start - right.start);
    for (let index = 1; index < intervals.length; index += 1) {
      if (intervals[index].start < intervals[index - 1].end - 0.001) {
        throw new Error(`Faces overlap on edge E${edgeIndex} of ${parentId}`);
      }
    }
  }

  return curves;
};

const transformCurve = (curve, transform = {}) => {
  const place = ring => rotateAndTranslateVertices(ring, transform);
  const vertices = place(curve.vertices);
  return {
    ...curve,
    vertices,
    boundaryVertices: withoutClosingVertex(vertices),
    ...(Array.isArray(curve.holes) ? { holes: curve.holes.map(place) } : {}),
    ...(Array.isArray(curve.faceCutPolygons) ? { faceCutPolygons: curve.faceCutPolygons.map(place) } : {}),
    ...(Array.isArray(curve.referenceVertices) ? { referenceVertices: withoutClosingVertex(place(curve.referenceVertices)) } : {}),
    ...(Array.isArray(curve.originalBoundaryVertices) ? { originalBoundaryVertices: withoutClosingVertex(place(curve.originalBoundaryVertices)) } : {}),
    ...(Array.isArray(curve.labelBoundaryVertices) ? { labelBoundaryVertices: withoutClosingVertex(place(curve.labelBoundaryVertices)) } : {})
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

      const targetPointLocal = faceSnapPoint(rawFaceVertices(targetCurve), relation.targetSnap);
      const targetPointRotated = rotate2d(targetPointLocal, targetTransform.rotation);
      const offsetRotated = rotate2d([
        resolveCassetteV2Expression(relation.offsetX, parameters, 0),
        resolveCassetteV2Expression(relation.offsetY, parameters, 0)
      ], targetTransform.rotation);
      const rotation = numeric(targetTransform.rotation, 0) + resolveCassetteV2AngleExpression(relation.rotation, parameters, 0);
      // The self anchor rides its own offset pair (sourceOrigin): the
      // source snap point plus the self offset, rotated into place —
      // symmetric to the host offset on the target snap.
      const sourceSnap = faceSnapPoint(rawFaceVertices(sourceCurve), relation.sourceSnap);
      const sourceSnapRotated = rotate2d([
        sourceSnap[0] + resolveCassetteV2Expression(relation.sourceOffsetX, parameters, 0),
        sourceSnap[1] + resolveCassetteV2Expression(relation.sourceOffsetY, parameters, 0)
      ], rotation);

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

export const buildCassetteV2TreeCurves = async (tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const mode = options.mode || 'layout';
  const localCurves = await buildCassetteV2LocalTreeCurves(sourceTree);
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

// The local frame a profile or face sketch is authored in, mapped to
// assembly coordinates. `cassetteV2SketchContext` inverts it to draw the
// cassette around the sketch. Closed profiles place by point and axis
// rotation, open profiles by their edge embedding, faces by the
// workpiece's assembly transform.
export const cassetteV2SketchFrame = async (tree = createCassetteV2GraphTree(), { mode = 'profile', id = '' } = {}) => {
  if (!id) return null;
  const sourceTree = cloneCassetteV2Tree(tree);
  const parameters = treeParameters(sourceTree);
  const localCurves = await buildCassetteV2LocalTreeCurves(sourceTree);

  if (mode === 'face') {
    const node = sourceTree.nodes.find(item => item.id === id);
    if (!node) return null;
    const transforms = buildCassetteV2AssemblyTransforms(sourceTree, localCurves);
    const transform = transforms.get(node.workpieceId) || { origin: [0, 0, 0], rotation: 0 };
    const parentCurve = node.parentId
      ? localCurves.find(item => item.node.id === node.parentId)
      : null;
    const attachment = cassetteV2FaceAttachmentFrame(
      parentCurve?.boundaryVertices || null,
      node.parentId ? node.parentEdgeIndex : 0
    );
    if (!attachment) return null;
    const edgeStart = node.parentId
      ? Math.max(0, resolveCassetteV2Expression(node.parameters?.edgeStart, parameters, 0))
      : 0;
    const start = [
      numeric(attachment.start?.[0], 0) + numeric(attachment.direction?.[0], 0) * edgeStart,
      numeric(attachment.start?.[1], 0) + numeric(attachment.direction?.[1], 0) * edgeStart
    ];
    const radians = numeric(transform.rotation, 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      origin: [
        numeric(transform.origin?.[0], 0) + start[0] * cos - start[1] * sin,
        numeric(transform.origin?.[1], 0) + start[0] * sin + start[1] * cos,
        0
      ],
      rotation: numeric(transform.rotation, 0)
        + Math.atan2(numeric(attachment.direction?.[1], 0), numeric(attachment.direction?.[0], 1)) * 180 / Math.PI,
      mirrorX: false,
      mirrorY: false
    };
  }

  const workpiece = sourceTree.workpieces.find(item => item.id === id);
  if (!workpiece) return null;
  const relation = getCassetteV2WorkpieceRelations(sourceTree)
    .find(item => item.sourceWorkpieceId === id && item.targetFaceId);
  if (!relation) return null;
  const curves = await buildCassetteV2TreeCurves(sourceTree, { mode: 'assembly' });
  const targetCurve = curves.find(item => item.node.id === relation.targetFaceId);
  if (!targetCurve) return null;
  const profile = normalizeCassetteV2Profile(workpiece, parameters);
  const open = profile.section?.open || profile.section?.type === 'polyline';

  if (open) {
    const contour = targetCurve.originalBoundaryVertices
      || targetCurve.referenceVertices
      || targetCurve.boundaryVertices
      || targetCurve.vertices;
    const embedding = embedOccsProfileEdge({
      section: profile.section,
      vertices: contour,
      relation,
      resolve: (value, fallback = 0) => resolveCassetteV2Expression(value, parameters, fallback)
    });
    if (!embedding.ok || !embedding.frame) return null;
    return {
      ...embedding.frame,
      rotation: embedding.frame.rotation * 180 / Math.PI,
      parentFace: contour
    };
  }

  const sectionOperations = resolveOccsProfileSectionOperations(profile.section || {});
  const sectionBounds = mirroredCopyBounds(profileSectionBounds(sectionOperations || []), relation.pattern?.item);
  const edgeExtent = sectionBounds ? sectionBounds.maxY - sectionBounds.minY : 0;
  const point = hardwarePointsForRelation(targetCurve, relation, parameters, edgeExtent, sectionBounds)[0];
  if (!point) return null;
  return {
    origin: [numeric(point[0], 0), numeric(point[1], 0), 0],
    rotation: profileAxisRotationDegrees(relation, targetCurve)
      + (relation.pattern
        ? Number(point.rotation) || 0
        : resolveCassetteV2AngleExpression(relation.rotation || '0', parameters, 0)),
    mirrorX: Boolean(relation.pattern ? relation.pattern.item?.mirrorX : relation.mirrorX),
    mirrorY: Boolean(relation.pattern ? relation.pattern.item?.mirrorY : relation.mirrorY),
    parentFace: targetCurve.originalBoundaryVertices
      || targetCurve.referenceVertices
      || targetCurve.boundaryVertices
      || targetCurve.vertices
  };
};

// The assembly in its own coordinates, on its own layers. The sketch
// editor places the authored sketch over it through `cassetteV2SketchFrame`;
// locked layers keep extraction on the authored sketch.
export const cassetteV2AssemblyEntitiesFromDrawing = (drawing) => {
  if (!drawing?.layers?.length) return null;
  const cassetteDimStyle = { ...OCCS_DIM_STYLE, txt: 18, asz: 9, exe: 5, exo: 2, gap: 3, dli: 14 };
  const isDimensionLayer = (layer) => (
    layer.role === 'dimension' || layer.standardCode === OCCS_LAYER_DIMENSION_CASSETTE
  );
  const linetypeForDash = (dasharray) => (
    dasharray === '5,5' ? 'DASHED' : dasharray === '1,3' ? 'DOT' : 'Continuous'
  );
  const layers = drawing.layers.map(layer => ({
    name: layer.name || layer.standardCode || 'geometry',
    color: /^#?[0-9a-f]{6}$/i.test(String(layer.color || '')) ? layer.color : 'ink',
    lineweight: Number(layer.weight) || 0.35,
    linetype: isDimensionLayer(layer) ? 'Continuous' : linetypeForDash(layer.dasharray),
    locked: true
  }));
  const linetypes = [
    { name: 'DASHED', description: 'Dashed', pattern: [5, -5] },
    { name: 'DOT', description: 'Dot', pattern: [0, -3] }
  ];
  const entities = [];
  const geometryLayers = drawing.layers.filter(layer => !isDimensionLayer(layer));
  const isFilledPath = (path) => (
    typeof path === 'object' && path?.d && path.fill && path.fill !== 'none'
    && (!path.stroke || path.stroke === 'none')
  );
  for (const layer of geometryLayers) {
    const layerName = layer.name || layer.standardCode || 'geometry';
    const paths = Array.isArray(layer.paths) ? layer.paths : [];
    for (const path of paths.filter(isFilledPath)) {
      const loops = svgPathToPolylines(path.d)
        .filter(loop => loop.points.length >= 3)
        .map((loop, index) => {
          const points = loop.points.map(([x, y]) => [x, -y]);
          const area = points.reduce((sum, [x, y], pointIndex) => {
            const [nextX, nextY] = points[(pointIndex + 1) % points.length];
            return sum + x * nextY - nextX * y;
          }, 0);
          const reversed = (area > 0) !== (index === 0);
          return (reversed ? [...points].reverse() : points).flat();
        });
      if (!loops.length) continue;
      const opacity = Number.isFinite(Number(path.opacity)) ? Number(path.opacity) : 0.1;
      entities.push({
        type: 'hatch',
        solid: true,
        loops,
        color: path.fill === 'layer' ? layer.color : path.fill,
        tr: Math.max(0, Math.min(100, Math.round((1 - opacity) * 100))),
        layer: layerName
      });
    }
    const outlinePaths = paths.filter(path => !isFilledPath(path));
    if (!outlinePaths.length) continue;
    for (const entity of collectDxfEntities({ layers: [{ ...layer, paths: outlinePaths }] })) {
      if (entity.type === 'line') {
        entities.push({
          type: 'line',
          x1: entity.from[0],
          y1: -entity.from[1],
          x2: entity.to[0],
          y2: -entity.to[1],
          layer: entity.layer
        });
        continue;
      }
      if (entity.type === 'polyline') {
        const pts = entity.points.map(([x, y]) => ({ x, y: -y }));
        if (pts.length >= 2) {
          entities.push({ type: 'poly', closed: entity.closed, pts, layer: entity.layer });
        }
      }
    }
  }
  const dimensionLayer = drawing.layers.find(isDimensionLayer);
  const dimensionLayerName = dimensionLayer?.name || dimensionLayer?.standardCode || 'dimension.cassette';
  const dimensionAnnotations = Array.isArray(drawing.dimensionAnnotations) ? drawing.dimensionAnnotations : [];
  if (dimensionAnnotations.length) {
    if (!dimensionLayer) {
      layers.push({
        name: dimensionLayerName,
        color: 'ink',
        lineweight: 0.25,
        linetype: 'Continuous',
        locked: true
      });
    }
    for (const annotation of dimensionAnnotations) {
      const kind = annotation.kind || 'linear';
      entities.push({
        type: 'dim',
        kind,
        p1: { x: Number(annotation.from?.[0]) || 0, y: Number(annotation.from?.[1]) || 0 },
        p2: { x: Number(annotation.to?.[0]) || 0, y: Number(annotation.to?.[1]) || 0 },
        ...(kind === 'diameter' && Array.isArray(annotation.center)
          ? { c: { x: Number(annotation.center[0]) || 0, y: Number(annotation.center[1]) || 0 } }
          : {}),
        loc: { x: Number(annotation.loc?.[0]) || 0, y: Number(annotation.loc?.[1]) || 0 },
        rot: Number(annotation.rot) || 0,
        text: String(annotation.text ?? ''),
        st: annotation.style ? { ...cassetteDimStyle, ...annotation.style } : cassetteDimStyle,
        color: 7,
        layer: dimensionLayerName,
        cassette: {
          nodeId: annotation.nodeId,
          fieldKey: annotation.key,
          dimensionKind: annotation.dimensionKind
        }
      });
    }
  }
  return entities.length ? { layers, linetypes, entities } : null;
};

export const cassetteV2AssemblyEntities = async (tree = createCassetteV2GraphTree()) => {
  const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
  return cassetteV2AssemblyEntitiesFromDrawing(drawing);
};

const roundSketchValue = (value) => Math.round((numeric(value, 0) + Number.EPSILON) * 1000) / 1000;

const halfExpression = (value) => (
  typeof value === 'number' ? value / 2 : `(${String(value || 0).trim()}) / 2`
);

// Converts the face's current local outline into the profile shape model:
// an axis-aligned rectangle keeps its authored width and height
// expressions (a rectangle is a rectangle under the global parameters),
// every other outline becomes one closed chain of its drawn corners.
export const cassetteV2FaceSketchFromNode = async (tree = createCassetteV2GraphTree(), nodeId = '') => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const node = sourceTree.nodes.find(item => item.id === nodeId);
  if (!node) return createEmptyOccsProfileSketch();
  if (isCassetteV2SketchFace(node)) return normalizeOccsProfileSketch(node.sketch);
  const curve = (await buildCassetteV2LocalTreeCurves(sourceTree)).find(item => item.node.id === nodeId);
  const points = withoutClosingVertex(curve?.localVertices || []);
  if (points.length < 3) return createEmptyOccsProfileSketch();

  const trapezoid = curve.trapezoid || {};
  const offsetsClear = ['baseStartOffset', 'baseEndOffset', 'topStartOffset', 'topEndOffset']
    .every(key => Math.abs(numeric(trapezoid[key], 0)) < 0.001);
  const xs = points.map(point => numeric(point[0], 0));
  const ys = points.map(point => numeric(point[1], 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const samePointAt = (point, values) => (
    Math.abs(numeric(point[0], 0) - values[0]) < 0.001 &&
    Math.abs(numeric(point[1], 0) - values[1]) < 0.001
  );
  const rectangle = offsetsClear
    && points.length === 4
    && samePointAt(points[0], [minX, minY])
    && samePointAt(points[1], [maxX, minY])
    && samePointAt(points[2], [maxX, maxY])
    && samePointAt(points[3], [minX, maxY]);
  if (rectangle) {
    const rawWidth = !node.parentId && node.parameters?.defaultLength !== 'inherit'
      ? node.parameters?.defaultLength
      : roundSketchValue(maxX - minX);
    const rawHeight = node.parameters?.height ?? roundSketchValue(maxY - minY);
    return normalizeOccsProfileSketch({
      version: '0.2',
      units: 'mm',
      parameters: {},
      material: 'positive',
      shapes: [{
        id: 's0',
        type: 'rect',
        op: 'add',
        center: [halfExpression(rawWidth), halfExpression(rawHeight)],
        width: rawWidth,
        height: rawHeight,
        rotation: 0,
        fillets: []
      }]
    });
  }

  const chainPoints = points.map((point, index) => ({
    id: `p${index}`,
    x: roundSketchValue(point[0]),
    y: roundSketchValue(point[1])
  }));
  return normalizeOccsProfileSketch({
    version: '0.2',
    units: 'mm',
    parameters: {},
    material: 'positive',
    shapes: [{
      id: 's0',
      type: 'chain',
      op: 'add',
      closed: true,
      points: chainPoints,
      edges: chainPoints.map((point, index) => ({
        id: `e${index}`,
        type: 'line',
        from: point.id,
        to: chainPoints[(index + 1) % chainPoints.length].id
      })),
      modifiers: []
    }]
  });
};

// The face editor's context: the authored sketch plus the parent face in
// sketch coordinates (edge start at the origin, +X along the edge, +Y
// across it). The parent outline is the ghost the author mounts to.
export const cassetteV2FaceSketchContext = async (tree = createCassetteV2GraphTree(), nodeId = '') => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const node = sourceTree.nodes.find(item => item.id === nodeId);
  const sketch = await cassetteV2FaceSketchFromNode(sourceTree, nodeId);
  if (!node) return { sketch, basisStart: null, basisEnd: null, parentFace: null };
  const curves = await buildCassetteV2LocalTreeCurves(sourceTree);
  const ownCurve = curves.find(item => item.node.id === nodeId);
  const baseFace = withoutClosingVertex(
    ownCurve?.baseLocalVertices || ownCurve?.localVertices || []
  );
  if (!node.parentId) {
    const boundary = withoutClosingVertex(ownCurve?.boundaryVertices || []);
    const length = boundary.length >= 2
      ? Math.hypot(boundary[1][0] - boundary[0][0], boundary[1][1] - boundary[0][1])
      : NaN;
    return {
      sketch,
      baseFace,
      basisStart: Number.isFinite(length) ? 0 : null,
      basisEnd: Number.isFinite(length) ? length : null,
      parentFace: null
    };
  }
  const parentCurve = curves.find(item => item.node.id === node.parentId);
  const boundary = withoutClosingVertex(
    parentCurve?.referenceVertices || parentCurve?.boundaryVertices || parentCurve?.vertices || []
  );
  if (boundary.length < 2) return { sketch, basisStart: null, basisEnd: null, parentFace: null };
  const edgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
  const edgeStartPoint = boundary[edgeIndex % boundary.length];
  const edgeEndPoint = boundary[(edgeIndex + 1) % boundary.length];
  const edgeLength = Math.hypot(
    numeric(edgeEndPoint?.[0], 0) - numeric(edgeStartPoint?.[0], 0),
    numeric(edgeEndPoint?.[1], 0) - numeric(edgeStartPoint?.[1], 0)
  );
  const frame = cassetteV2FaceAttachmentFrame(boundary, edgeIndex);
  const edgeStart = resolveCassetteV2Expression(node.parameters?.edgeStart, treeParameters(sourceTree), 0);
  const parentFace = boundary.map((point) => {
    const dx = numeric(point?.[0], 0) - numeric(frame.start[0], 0);
    const dy = numeric(point?.[1], 0) - numeric(frame.start[1], 0);
    return [
      dx * numeric(frame.direction[0], 0) + dy * numeric(frame.direction[1], 0) - edgeStart,
      dx * numeric(frame.normal[0], 0) + dy * numeric(frame.normal[1], 0)
    ];
  });
  return {
    sketch,
    baseFace,
    basisStart: -edgeStart,
    basisEnd: edgeLength - edgeStart,
    parentFace
  };
};

export const renderCassetteV2TreeToDrawing = async (tree = createCassetteV2GraphTree(), options = {}) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const localCurves = await buildCassetteV2LocalTreeCurves(sourceTree);
  const assemblyTransforms = options.mode === 'assembly'
    ? buildCassetteV2AssemblyTransforms(sourceTree, localCurves)
    : null;
  const curves = assemblyTransforms
    ? localCurves.map(curve => transformCurve(curve, assemblyTransforms.get(curve.node.workpieceId)))
    : await buildCassetteV2TreeCurves(sourceTree, options);
  if (!curves.length) return null;
  return buildLayoutDrawingFromCurves(curves, sourceTree, {
    foldedPreviewCurves: options.mode === 'assembly' ? localCurves : curves,
    includeFoldedPreviewJoints: options.mode === 'assembly',
    contextWorkpieceId: options.mode === 'assembly' ? options.contextWorkpieceId : '',
    selectedRelationId: options.selectedRelationId,
    selectedFaceId: options.selectedFaceId,
    includeDimensions: options.includeDimensions,
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
