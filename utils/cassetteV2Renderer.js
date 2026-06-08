import {
  buildCassetteV2TrapezoidVertices,
  cassetteV2TrapezoidReferenceLength
} from './cassetteV2Trapezoid.js';
import { extractDesignerEdges } from './drawingPreview.js';
import {
  OCCS_LAYER_CONTOUR_FLAT_PATTERN,
  OCCS_LAYER_FOLD_ROUTE
} from './occs/layers.js';
import {
  collectOccsExpressionIdentifiers,
  resolveOccsAngleExpression,
  resolveOccsExpression
} from './occs/expressions.js';
import {
  buildOccsDrawingFromFaceCurves,
  occsCurveToPath
} from './occs/drawing.js';
import { buildOccsFaceDimensionEntities } from './occs/dimensions.js';
import { buildOccsFoldedPreviewPayload } from './occs/folded-3d.js';

const BOUNDARY_LAYER = OCCS_LAYER_CONTOUR_FLAT_PATTERN;
const FOLD_ROUTE_LAYER = OCCS_LAYER_FOLD_ROUTE;
const CONSTRUCTION_LAYER = 'construction.nodi';
const DEFAULT_CASSETTE_V2_WORKPIECE_ID = 'wp_1';
const DEFAULT_CASSETTE_V2_WORKPIECE_GAP = 160;
const DEFAULT_CASSETTE_V2_WORKPIECE_NODE_SIZE = 34;

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
const DEFAULT_CASSETTE_V2_FOLD_ANGLE = '90deg';
const DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT = Object.freeze({
  targetSnap: 'center',
  sourceSnap: 'center',
  offsetX: '0',
  offsetY: '0',
  rotation: '0deg',
  side: 'front'
});

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

const clonePlacement = (placement = {}) => JSON.parse(JSON.stringify(placement || {}));

const occurrenceIdForWorkpiece = (workpiece = {}) => workpiece.occurrenceId || workpiece.id;

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

const createCassetteV2WorkpieceJoint = (sourceWorkpiece = {}, targetWorkpiece = {}, targetNode = null) => {
  const placement = defaultCassetteV2AttachmentPlacement(targetWorkpiece, targetNode);
  return {
    id: `joint_${targetWorkpiece.id || 'world'}_${sourceWorkpiece.id}`,
    type: 'mechanical',
    method: 'reference',
    source: {
      occurrence: occurrenceIdForWorkpiece(sourceWorkpiece),
      face: sourceWorkpiece.rootId
    },
    target: { ...placement.relativeTo },
    placement
  };
};

export const createCassetteV2GraphTree = () => ({
  version: '0.4',
  parameters: { ...DEFAULT_CASSETTE_V2_PARAMETERS },
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
        rotation: ['0deg', '0deg', '0deg']
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
          rotation: ['0deg', '0deg', '0deg']
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
  nextTree.workpieces.forEach((workpiece, index) => {
    workpiece.rootId ||= nextTree.nodes.find(node => node.workpieceId === workpiece.id && !node.parentId)?.id || nextTree.rootId;
    workpiece.definitionId ||= `${workpiece.id}_def`;
    workpiece.occurrenceId ||= workpiece.id;
    workpiece.name ||= `Workpiece ${index + 1}`;
    workpiece.previewOrigin ||= [index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP), 0, 0];
    workpiece.placement ||= {
      relativeTo: index === 0 ? 'world' : { occurrence: nextTree.workpieces[0].occurrenceId || nextTree.workpieces[0].id },
      origin: [String(index * (DEFAULT_CASSETTE_V2_NUMERIC.defaultLength + DEFAULT_CASSETTE_V2_WORKPIECE_GAP)), '0', '0'],
      rotation: ['0deg', '0deg', '0deg']
    };
  });
  const workpieceByOccurrenceId = new Map(nextTree.workpieces.map(workpiece => [occurrenceIdForWorkpiece(workpiece), workpiece]));
  nextTree.joints = Array.isArray(nextTree.joints) ? nextTree.joints : [];
  for (const workpiece of nextTree.workpieces.slice(1)) {
    const hasJoint = nextTree.joints.some(joint => joint.source?.occurrence === occurrenceIdForWorkpiece(workpiece));
    if (hasJoint) continue;

    const relativeTo = typeof workpiece.placement?.relativeTo === 'object'
      ? workpiece.placement.relativeTo
      : null;
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

  return {
    id: joint.id || `joint_${index + 1}`,
    type: joint.type || 'mechanical',
    method: joint.method || 'reference',
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
      targetAnchor: targetSnap
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
  const childrenByTarget = new Map();
  const incoming = new Set();

  for (const relation of relations) {
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
      x: 18 + level * 92,
      y: 18 + index * 54,
      size: DEFAULT_CASSETTE_V2_WORKPIECE_NODE_SIZE
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
        label: relation.targetSnap,
        x1: sourceNode.x + sourceNode.size,
        y1: sourceNode.y + sourceNode.size / 2,
        x2: targetNode.x,
        y2: targetNode.y + targetNode.size / 2,
        midX: (sourceNode.x + sourceNode.size + targetNode.x) / 2,
        midY: (sourceNode.y + sourceNode.size / 2 + targetNode.y + targetNode.size / 2) / 2
      };
    })
    .filter(Boolean);

  const width = Math.max(...nodes.map(node => node.x + node.size + 18), 140);
  const height = Math.max(...nodes.map(node => node.y + node.size + 18), 72);
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
  nextTree.nodes.push({
    id,
    workpieceId: parent.workpieceId,
    operation: 'face.trapezoid',
    parentId,
    parentEdgeIndex: normalizedEdgeIndex,
    attachEdge: 'E0',
    foldAngle: DEFAULT_CASSETTE_V2_FOLD_ANGLE,
    parameters: { ...DEFAULT_CASSETTE_V2_CHILD_TRAPEZOID }
  });

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
        rotation: ['0deg', '0deg', '0deg']
      };

  nextTree.workpieces.push({
    ...sourceWorkpiece,
    placement
  });
  nextTree.nodes.push(createCassetteV2RootNode(nodeId, id));
  if (referenceWorkpiece) {
    nextTree.joints.push(createCassetteV2WorkpieceJoint(sourceWorkpiece, referenceWorkpiece, targetNode));
  }

  return { tree: nextTree, workpieceId: id, nodeId };
};

export const deleteCassetteV2Workpiece = (tree, workpieceId) => {
  const nextTree = cloneCassetteV2Tree(tree);
  const workpiece = nextTree.workpieces.find(item => item.id === workpieceId);
  const rootWorkpieceId = nextTree.workpieces[0]?.id;
  if (!workpiece || workpiece.id === rootWorkpieceId || nextTree.workpieces.length <= 1) {
    return { tree: nextTree, deletedWorkpieceIds: [], selectedWorkpieceId: rootWorkpieceId || '' };
  }

  const relations = getCassetteV2WorkpieceRelations(nextTree);
  const childrenByTarget = new Map();
  for (const relation of relations) {
    if (!relation.targetWorkpieceId || !relation.sourceWorkpieceId) continue;
    if (!childrenByTarget.has(relation.targetWorkpieceId)) childrenByTarget.set(relation.targetWorkpieceId, []);
    childrenByTarget.get(relation.targetWorkpieceId).push(relation.sourceWorkpieceId);
  }

  const deleteIds = new Set();
  const collect = (id) => {
    if (!id || deleteIds.has(id)) return;
    deleteIds.add(id);
    for (const childId of childrenByTarget.get(id) || []) collect(childId);
  };
  collect(workpiece.id);

  const deletedOccurrenceIds = new Set(nextTree.workpieces
    .filter(item => deleteIds.has(item.id))
    .map(occurrenceIdForWorkpiece));
  const targetRelation = relations.find(relation => relation.sourceWorkpieceId === workpiece.id);
  const selectedWorkpieceId = targetRelation?.targetWorkpieceId || rootWorkpieceId || '';

  nextTree.workpieces = nextTree.workpieces.filter(item => !deleteIds.has(item.id));
  nextTree.nodes = nextTree.nodes.filter(node => !deleteIds.has(node.workpieceId));
  nextTree.joints = nextTree.joints.filter(joint => (
    !deletedOccurrenceIds.has(joint.source?.occurrence) &&
    !deletedOccurrenceIds.has(joint.target?.occurrence) &&
    !deletedOccurrenceIds.has(joint.placement?.relativeTo?.occurrence)
  ));
  nextTree.rootId = nextTree.workpieces[0]?.rootId || nextTree.nodes[0]?.id || nextTree.rootId;

  return {
    tree: nextTree,
    deletedWorkpieceIds: [...deleteIds],
    selectedWorkpieceId
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
  const sourceFaceId = faceIdForWorkpiece(nextTree, sourceWorkpiece, patch.sourceFaceId || relation.sourceFaceId);
  const targetFaceId = faceIdForWorkpiece(nextTree, targetWorkpiece, patch.targetFaceId ||
    (patch.targetWorkpieceId ? targetWorkpiece?.rootId : relation.targetFaceId));
  const targetSide = patch.targetSide || relation.targetSide || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.side;
  const targetSnap = patch.targetSnap || relation.targetSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.targetSnap;
  const sourceSnap = patch.sourceSnap || relation.sourceSnap || DEFAULT_CASSETTE_V2_ATTACHMENT_PLACEMENT.sourceSnap;
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
    anchor: sourceSnap,
    targetAnchor: targetSnap
  };
  const nextJoint = {
    ...nextTree.joints[relationIndex],
    type: patch.type || relation.type,
    method: patch.method ?? relation.method,
    source: {
      occurrence: occurrenceIdForWorkpiece(sourceWorkpiece),
      face: sourceFaceId
    },
    target,
    placement
  };

  nextTree.joints.splice(relationIndex, 1, nextJoint);
  if (sourceWorkpiece) {
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

const foldAngleFromNode = (node) => node.foldAngle || DEFAULT_CASSETTE_V2_FOLD_ANGLE;

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

const dimensionLabelsForNode = (node) => {
  const base = rawShapeValue(node, 'defaultLength');
  return {
    base: base === 'inherit' ? '' : String(base),
    height: String(rawShapeValue(node, 'height'))
  };
};

export const createCassetteV2OccsDocument = (definition = {}) => {
  if (isGraphTree(definition)) {
    return createCassetteV2OccsDocumentFromTree(definition);
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
            rotation: ['0deg', '0deg', '0deg']
          }
        }
      ],
      joints: []
    },
    extensions: {
      cutkit: {
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

export const createCassetteV2OccsDocumentFromTree = (tree = createCassetteV2GraphTree()) => {
  const sourceTree = cloneCassetteV2Tree(tree);
  const nodes = Array.isArray(sourceTree.nodes) ? sourceTree.nodes : [];
  const nodesByWorkpieceId = new Map();
  for (const node of nodes) {
    if (!nodesByWorkpieceId.has(node.workpieceId)) nodesByWorkpieceId.set(node.workpieceId, []);
    nodesByWorkpieceId.get(node.workpieceId).push(node);
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
        const faces = workpieceNodes.map(node => ({
          id: node.id,
          role: node.parentId ? 'return_flange' : 'main',
          shape: shapeFromNode(node)
        }));
        return {
          id: workpiece.definitionId || `${workpiece.id}_def`,
          type: 'sheet',
          role: workpiece.id === sourceTree.workpieces[0]?.id ? 'cassette_tray' : 'cassette_part',
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
          entities: faces.flatMap(face => dimensionEntitiesForFaceShape(face.id, face.shape))
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
          rotation: ['0deg', '0deg', '0deg']
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
      cutkit: {
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

const designerEdgesForBoundary = (nodeId, vertices = [], foldedEdges = new Map()) => {
  const boundaryVertices = withoutClosingVertex(vertices);
  return boundaryVertices
    .map((vertex, edgeIndex) => {
      if (foldedEdges.has(pointKey(nodeId, edgeIndex))) return null;

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
      const parentVertices = withoutClosingVertex(parentCurve?.boundaryVertices || parentCurve?.vertices || []);
      const edgeIndex = Math.max(0, Math.round(numeric(node.parentEdgeIndex, 0)));
      const vertex = parentVertices[edgeIndex];
      const next = parentVertices[(edgeIndex + 1) % parentVertices.length];
      if (!vertex || !next) return null;

      const [x1, y1] = toSvgPoint(vertex);
      const [x2, y2] = toSvgPoint(next);
      const angle = foldAngleFromNode(node);
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
        angle,
        label: angle
      };
    })
    .filter(Boolean);
};

const foldedPreviewForTree = (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const parameters = treeParameters(tree);
  const faces = curves.map(curve => ({
    nodeId: curve.node.id,
    workpieceId: curve.node.workpieceId,
    vertices: curve.boundaryVertices || curve.vertices
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
    ? getCassetteV2WorkpieceRelations(tree).map(relation => ({
      sourceWorkpieceId: relation.sourceWorkpieceId,
      sourceFaceId: relation.sourceFaceId,
      sourceSnap: relation.sourceSnap,
      targetWorkpieceId: relation.targetWorkpieceId,
      targetFaceId: relation.targetFaceId,
      targetSnap: relation.targetSnap,
      targetSide: relation.targetSide,
      offsetX: resolveCassetteV2Expression(relation.offsetX, parameters, 0),
      offsetY: resolveCassetteV2Expression(relation.offsetY, parameters, 0),
      rotation: resolveCassetteV2AngleExpression(relation.rotation, parameters, 0)
    }))
    : [];

  return buildOccsFoldedPreviewPayload({ faces, folds, joints });
};

const buildLayoutDrawingFromCurves = async (curves = [], tree = createCassetteV2GraphTree(), options = {}) => {
  const foldedEdges = getCassetteV2FoldEdges(tree);
  const foldedPreviewCurves = options.foldedPreviewCurves || curves;
  const designerEdges = curves.flatMap(curve => (
    designerEdgesForBoundary(curve.node.id, curve.boundaryVertices, foldedEdges)
  ));
  const designerFoldEdges = designerFoldEdgesForTree(curves, tree);
  const designerFaces = curves.map(curve => ({
    nodeId: curve.node.id,
    d: occsCurveToPath(curve.vertices),
    label: curve.node.id
  }));

  return buildOccsDrawingFromFaceCurves(curves, {
    designerFaces,
    designerFoldEdges,
    foldedPreview: foldedPreviewForTree(foldedPreviewCurves, tree, { includeJoints: options.includeFoldedPreviewJoints }),
    designerEdges
  });
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
    name: BOUNDARY_LAYER,
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
      boundaryVertices: withoutClosingVertex(curve.vertices)
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
      boundaryVertices: withoutClosingVertex(entry.boundaryVertices)
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
  const relations = getCassetteV2WorkpieceRelations(sourceTree);
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
    includeFoldedPreviewJoints: options.mode === 'assembly'
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
