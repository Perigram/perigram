import { describe, expect, it } from 'vitest';
import {
  addCassetteV2GraphChild,
  addCassetteV2Workpiece,
  addCassetteV2WorkpieceAttachment,
  buildCassetteV2ComposedDrawing,
  buildCassetteV2Drawing,
  buildCassetteV2FaceGraph,
  buildCassetteV2IncrementalDrawing,
  buildCassetteV2TrapezoidTreeCurves,
  buildCassetteV2WorkpieceTopology,
  collectCassetteV2ExpressionIdentifiers,
  composeCassetteV2NodiGraph,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  deleteCassetteV2WorkpieceRelation,
  findBoundaryOutputRef,
  getCassetteV2FoldEdges,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  normalizeCassetteV2Trapezoid,
  renderCassetteV2ToDrawing,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  resolveCassetteV2Expression,
  setGraphNumberInput,
  updateCassetteV2WorkpieceRelation
} from './cassetteV2Renderer.js';

const graph = {
  nodes: {
    rootBaseLine: {
      id: 'root-base-line-node',
      label: 'rootBaseEdge',
      name: 'Line',
      output: {
        parameters: [
          { id: 'root-base-output', name: 'line curve', hint: 512, connections: [] }
        ]
      }
    },
    parentPolygon: {
      id: 'parent-polygon-node',
      label: 'parentPolygon',
      name: 'Curve',
      input: {
        parameters: [
          { id: 'parent-input', name: 'input geometry', hint: 512, connections: [] }
        ]
      },
      output: {
        parameters: [
          { id: 'parent-output', name: 'curve', hint: 512, connections: [] }
        ]
      }
    },
    boundary: {
      id: 'boundary-node',
      label: 'out.boundary',
      name: 'Polyline',
      output: {
        parameters: [
          { id: 'boundary-output', name: 'resulting polyline', hint: 512, connections: [] }
        ]
      }
    },
    defaultLengthInput: {
      id: 'default-length-input-node',
      label: 'defaultLength',
      name: 'Number',
      entity: { variant: 'Number', data: { value: 500 } },
      output: { parameters: [] }
    },
    heightInput: {
      id: 'height-input-node',
      label: 'height',
      name: 'Number Slider',
      entity: { variant: 'NumberSlider', data: { value: 25.4 } },
      output: { parameters: [] }
    },
    parentEdgeInput: {
      id: 'parent-edge-input-node',
      label: 'parentEdgeIndex',
      name: 'Number Slider',
      entity: {
        variant: 'NumberSlider',
        data: { value: 2 }
      },
      output: { parameters: [] }
    },
    startAnchorInput: {
      id: 'start-anchor-input-node',
      label: 'startAnchor',
      name: 'Number',
      entity: { variant: 'Number', data: { value: 0 } },
      output: { parameters: [] }
    },
    endAnchorInput: {
      id: 'end-anchor-input-node',
      label: 'endAnchor',
      name: 'Number',
      entity: { variant: 'Number', data: { value: 1 } },
      output: { parameters: [] }
    },
    baseStartOffsetInput: {
      id: 'base-start-offset-input-node',
      label: 'baseStartOffset',
      name: 'Number Slider',
      entity: { variant: 'NumberSlider', data: { value: 10 } },
      output: { parameters: [] }
    },
    baseEndOffsetInput: {
      id: 'base-end-offset-input-node',
      label: 'baseEndOffset',
      name: 'Number Slider',
      entity: { variant: 'NumberSlider', data: { value: 10 } },
      output: { parameters: [] }
    },
    topStartOffsetInput: {
      id: 'top-start-offset-input-node',
      label: 'topStartOffset',
      name: 'Number Slider',
      entity: { variant: 'NumberSlider', data: { value: -10 } },
      output: { parameters: [] }
    },
    topEndOffsetInput: {
      id: 'top-end-offset-input-node',
      label: 'topEndOffset',
      name: 'Number Slider',
      entity: { variant: 'NumberSlider', data: { value: -10 } },
      output: { parameters: [] }
    }
  }
};

const graphParameterById = (targetGraph, parameterId) => {
  for (const node of Object.values(targetGraph.nodes || {})) {
    for (const side of ['input', 'output']) {
      const parameter = (node[side]?.parameters || []).find(item => item.id === parameterId);
      if (parameter) return parameter;
    }
  }
  return null;
};

const graphNodeValuesByLabel = (targetGraph, label) => Object.values(targetGraph.nodes || {})
  .filter(node => node.label === label)
  .map(node => node.entity?.data?.value);

describe('cassette v2 trapezoid renderer', () => {
  it('starts from one root trapezoid and grows a graph tree by parent edge', () => {
    const initialTree = createCassetteV2GraphTree();
    let result = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    result = addCassetteV2GraphChild(result.tree, 'face_2', 1);
    result = addCassetteV2GraphChild(result.tree, 'face_1', 0);
    const duplicate = addCassetteV2GraphChild(result.tree, 'face_1', 2);
    const occs = createCassetteV2OccsDocument(result.tree);
    const foldedEdges = getCassetteV2FoldEdges(result.tree);
    const composition = composeCassetteV2NodiGraph(result.tree, graph);
    const parentBoundaryOutput = composition.faces[0].boundaryOutput.outputId;
    const rootParentInput = composition.faces[0].parentPolygonInput.inputId;
    const rootBaseOutput = composition.faces[0].rootBaseOutput.outputId;
    const childParentInput = composition.faces[1].parentPolygonInput.inputId;
    const rootParentInputParameter = graphParameterById(composition.graph, rootParentInput);
    const rootBaseOutputParameter = graphParameterById(composition.graph, rootBaseOutput);
    const childParentInputParameter = graphParameterById(composition.graph, childParentInput);
    const parentBoundaryOutputParameter = graphParameterById(composition.graph, parentBoundaryOutput);

    expect(initialTree.nodes).toHaveLength(1);
    expect(initialTree.parameters.B).toBe('400');
    expect(initialTree.nodes[0].parameters).toMatchObject({
      height: 'B',
      baseStartOffset: '0',
      baseEndOffset: '0',
      topStartOffset: '0',
      topEndOffset: '0'
    });
    expect(result.tree.nodes).toHaveLength(4);
    expect(duplicate.tree.nodes).toHaveLength(4);
    expect(duplicate.nodeId).toBe('face_2');
    expect(result.tree.nodes[1]).toMatchObject({
      id: 'face_2',
      operation: 'face.trapezoid',
      parentId: 'face_1',
      parentEdgeIndex: 2,
      attachEdge: 'E0',
      foldAngle: '90',
      parameters: expect.objectContaining({
        height: 'R',
        baseStartOffset: '0',
        baseEndOffset: '0',
        topStartOffset: '0',
        topEndOffset: '0'
      })
    });
    expect(occs.definitions.workpieces[0].faces.map(face => face.id)).toEqual(['face_1', 'face_2', 'face_3', 'face_4']);
    expect(occs.definitions.workpieces[0].folds[0]).toMatchObject({
      from: 'face_1.E2',
      to: 'face_2.E0',
      angle: '90'
    });
    expect(occs.definitions.workpieces[0].folds).toHaveLength(3);
    expect(foldedEdges.get('face_1:E2')?.id).toBe('face_2');
    expect(foldedEdges.get('face_2:E0')?.id).toBe('face_2');
    expect(foldedEdges.get('face_2:E1')?.id).toBe('face_3');
    expect(composition.faces).toHaveLength(4);
    expect(rootParentInputParameter.connections).toEqual([rootBaseOutput]);
    expect(rootBaseOutputParameter.connections).toContain(rootParentInput);
    expect(childParentInputParameter.connections).toEqual([parentBoundaryOutput]);
    expect(parentBoundaryOutputParameter.connections).toContain(childParentInput);
    expect(Object.values(composition.graph.nodes).filter(node => node.label === 'parentEdgeIndex').map(node => node.entity.data.value)).toContain(2);
  });

  it('builds one face graph by feeding evaluated parent vertices through a Nodi polyline input', () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    const parentBoundary = [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]];
    const faceGraph = buildCassetteV2FaceGraph(tree.nodes[1], graph, parentBoundary);
    const parentInput = graphParameterById(faceGraph.graph, faceGraph.parentPolygonInput.inputId);
    const adapterOutput = graphParameterById(faceGraph.graph, faceGraph.parentOutput.outputId);
    const adapterPolyline = Object.values(faceGraph.graph.nodes).find(node => node.label === 'adapter.parentPolygon');
    const hints = Object.values(faceGraph.graph.nodes)
      .flatMap(node => [
        ...(node.input?.parameters || []),
        ...(node.output?.parameters || [])
      ])
      .map(parameter => parameter.hint)
      .filter(value => value !== undefined);

    expect(adapterPolyline?.entity.variant).toBe('Polyline');
    expect(parentInput.connections).toEqual([faceGraph.parentOutput.outputId]);
    expect(adapterOutput.connections).toContain(faceGraph.parentPolygonInput.inputId);
    expect(Object.values(faceGraph.graph.nodes).filter(node => node.entity?.variant === 'ConstructPoint')).toHaveLength(4);
    expect(hints.some(value => typeof value === 'number')).toBe(false);
  });

  it('normalizes graph inputs and emits OCCS trapezoid shape data', () => {
    const trapezoid = normalizeCassetteV2Trapezoid({
      defaultLength: '640',
      height: '80',
      startAnchor: 1,
      endAnchor: 0
    });
    const occs = createCassetteV2OccsDocument(trapezoid);

    expect(trapezoid.startAnchor).toBe(1);
    expect(trapezoid.endAnchor).toBe(0);
    expect(occs.occs).toBe('0.4-draft');
    expect(occs.definitions.workpieces[0].faces[0].shape).toEqual({
      type: 'trapezoid',
      baseLength: 'A',
      height: 'H',
      baseStartOffset: 'BSO',
      baseEndOffset: 'BEO',
      topStartOffset: 'TSO',
      topEndOffset: 'TEO'
    });
    expect(occs.extensions.cutkit.nodi.inputs.startAnchor).toBe(1);
  });

  it('preserves OCCS expressions while resolving Nodi graph inputs from global parameters', () => {
    const tree = createCassetteV2GraphTree();
    tree.parameters = {
      A: '1200',
      B: '600',
      R: '35',
      O: 'R / 2 - 1'
    };
    tree.nodes[0].parameters = {
      ...tree.nodes[0].parameters,
      defaultLength: 'A + 10',
      height: 'B + (R / 2 - 1)',
      baseStartOffset: 'O'
    };

    const { tree: nextTree } = addCassetteV2GraphChild(tree, 'face_1', 2);
    nextTree.nodes[1].foldAngle = '135';
    nextTree.nodes[1].parameters = {
      ...nextTree.nodes[1].parameters,
      height: 'R + foldAngle / 10'
    };
    const occs = createCassetteV2OccsDocument(nextTree);
    const composition = composeCassetteV2NodiGraph(nextTree, graph);

    expect(resolveCassetteV2Expression('B + (R / 2 - 1)', tree.parameters)).toBe(616.5);
    expect(resolveCassetteV2Expression('sin(30) + cos(60) + tan(45)', tree.parameters)).toBeCloseTo(2);
    expect(resolveCassetteV2AngleExpression('135deg', tree.parameters)).toBe(135);
    expect(collectCassetteV2ExpressionIdentifiers('sin(A) + foldAngle')).toEqual(['A', 'foldAngle']);
    expect(occs.parameters).toMatchObject({
      A: '1200',
      B: '600',
      R: '35',
      O: 'R / 2 - 1'
    });
    expect(occs.definitions.workpieces[0].faces[0].shape).toMatchObject({
      baseLength: 'A + 10',
      height: 'B + (R / 2 - 1)',
      baseStartOffset: 'O'
    });
    expect(occs.definitions.workpieces[0].faces[1].shape).toMatchObject({
      baseLength: 'inherit',
      height: 'R + foldAngle / 10'
    });
    expect(occs.definitions.workpieces[0].folds[0].angle).toBe('135');
    expect(graphNodeValuesByLabel(composition.graph, 'defaultLength')).toContain(1210);
    expect(graphNodeValuesByLabel(composition.graph, 'height')).toEqual(expect.arrayContaining([616.5, 48.5]));
    expect(graphNodeValuesByLabel(composition.graph, 'baseStartOffset')).toContain(16.5);
  });

  it('adds a separate OCCS workpiece with its own root face and occurrence', async () => {
    const initialTree = createCassetteV2GraphTree();
    const result = addCassetteV2Workpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const workpieces = getCassetteV2Workpieces(result.tree);
    const occs = createCassetteV2OccsDocument(result.tree);
    const curves = buildCassetteV2TrapezoidTreeCurves(result.tree);
    const drawing = await renderCassetteV2TreeToDrawing(result.tree);
    const relations = getCassetteV2WorkpieceRelations(result.tree);
    const topology = buildCassetteV2WorkpieceTopology(result.tree);

    expect(workpieces.map(workpiece => workpiece.id)).toEqual(['wp_1', 'wp_2']);
    expect(result.nodeId).toBe('face_2');
    expect(result.workpieceId).toBe('wp_2');
    expect(result.tree.nodes).toEqual([
      expect.objectContaining({ id: 'face_1', workpieceId: 'wp_1', parentId: null }),
      expect.objectContaining({ id: 'face_2', workpieceId: 'wp_2', parentId: null })
    ]);
    expect(occs.definitions.workpieces.map(workpiece => ({
      id: workpiece.id,
      role: workpiece.role,
      faces: workpiece.faces.map(face => face.id),
      folds: workpiece.folds.length
    }))).toEqual([
      { id: 'wp_1_def', role: 'cassette_tray', faces: ['face_1'], folds: 0 },
      { id: 'wp_2_def', role: 'cassette_part', faces: ['face_2'], folds: 0 }
    ]);
    expect(occs.cassette.occurrences).toEqual([
      expect.objectContaining({ id: 'wp_1', ref: 'wp_1_def' }),
      expect.objectContaining({
        id: 'wp_2',
        ref: 'wp_2_def',
        placement: expect.objectContaining({
          relativeTo: { occurrence: 'wp_1', face: 'face_1', side: 'front' },
          origin: ['0', '0'],
          anchor: 'center',
          targetAnchor: 'center'
        })
      })
    ]);
    expect(occs.cassette.joints).toEqual([expect.objectContaining({
      id: 'joint_wp_1_wp_2',
      source: { occurrence: 'wp_2', face: 'face_2' },
      target: { occurrence: 'wp_1', face: 'face_1', side: 'front' }
    })]);
    expect(relations).toEqual([expect.objectContaining({
      sourceWorkpieceId: 'wp_2',
      targetWorkpieceId: 'wp_1',
      targetFaceId: 'face_1',
      targetSnap: 'center',
      sourceSnap: 'center'
    })]);
    expect(topology.nodes.map(node => ({ id: node.id, level: node.level }))).toEqual([
      { id: 'wp_1', level: 0 },
      { id: 'wp_2', level: 1 }
    ]);
    expect(topology.edges).toEqual([expect.objectContaining({
      sourceWorkpieceId: 'wp_1',
      targetWorkpieceId: 'wp_2',
      label: 'center'
    })]);
    expect(curves.map(curve => curve.vertices[0])).toEqual([
      [0, 0, 0],
      [660, 0, 0]
    ]);
    expect(drawing.layers[0].paths).toHaveLength(2);
    expect(drawing.foldedPreview.faces.map(face => face.nodeId)).toEqual(['face_1', 'face_2']);
    expect(drawing.foldedPreview.faces.map(face => face.workpieceId)).toEqual(['wp_1', 'wp_2']);
  });

  it('stores source face selection for workpiece attachments and snaps from that face', async () => {
    const addedWorkpiece = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const addedFace = addCassetteV2GraphChild(addedWorkpiece.tree, addedWorkpiece.nodeId, 2);
    const relation = getCassetteV2WorkpieceRelations(addedFace.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(addedFace.tree, relation.id, {
      sourceFaceId: addedFace.nodeId,
      sourceSnap: 'origin',
      targetSnap: 'origin'
    });
    const relations = getCassetteV2WorkpieceRelations(tree);
    const occs = createCassetteV2OccsDocument(tree);
    const assemblyCurves = buildCassetteV2TrapezoidTreeCurves(tree, { mode: 'assembly' });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const targetCurve = assemblyCurves.find(curve => curve.node.id === 'face_1');
    const sourceFaceCurve = assemblyCurves.find(curve => curve.node.id === addedFace.nodeId);

    expect(relations[0]).toMatchObject({
      sourceWorkpieceId: 'wp_2',
      sourceFaceId: addedFace.nodeId,
      sourceSnap: 'origin',
      targetWorkpieceId: 'wp_1',
      targetFaceId: 'face_1',
      targetSnap: 'origin',
      source: { occurrence: 'wp_2', face: addedFace.nodeId }
    });
    expect(occs.cassette.joints[0].source).toEqual({ occurrence: 'wp_2', face: addedFace.nodeId });
    expect(sourceFaceCurve.vertices[0]).toEqual(targetCurve.vertices[0]);
    expect(drawing.foldedPreview.joints).toEqual([expect.objectContaining({
      sourceWorkpieceId: 'wp_2',
      sourceFaceId: addedFace.nodeId,
      targetWorkpieceId: 'wp_1',
      targetFaceId: 'face_1'
    })]);
  });

  it('edits workpiece attachment topology and renders selected/assembly preview modes', async () => {
    const first = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const relation = getCassetteV2WorkpieceRelations(first.tree)[0];
    let tree = updateCassetteV2WorkpieceRelation(first.tree, relation.id, {
      targetSnap: 'top_right',
      sourceSnap: 'origin',
      offsetX: '10',
      offsetY: '5',
      rotation: '0',
      targetSide: 'back'
    });
    const second = addCassetteV2Workpiece(tree, {
      referenceWorkpieceId: 'wp_2',
      referenceNodeId: 'face_2'
    });
    tree = second.tree;
    const occs = createCassetteV2OccsDocument(tree);
    const relations = getCassetteV2WorkpieceRelations(tree);
    const topology = buildCassetteV2WorkpieceTopology(tree);
    const selectedDrawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'workpiece', workpieceId: 'wp_2' });
    const assemblyCurves = buildCassetteV2TrapezoidTreeCurves(tree, { mode: 'assembly' });

    expect(relations.map(item => ({
      source: item.sourceWorkpieceId,
      target: item.targetWorkpieceId,
      snap: item.targetSnap,
      sourceSnap: item.sourceSnap,
      driver: item.driver
    }))).toEqual([
      { source: 'wp_2', target: 'wp_1', snap: 'top_right', sourceSnap: 'origin', driver: true },
      { source: 'wp_3', target: 'wp_2', snap: 'center', sourceSnap: 'center', driver: true }
    ]);
    expect(occs.cassette.occurrences.find(item => item.id === 'wp_2').placement).toMatchObject({
      relativeTo: { occurrence: 'wp_1', face: 'face_1', side: 'back' },
      origin: ['10', '5'],
      rotation: '0',
      anchor: 'origin',
      targetAnchor: 'top_right'
    });
    expect(occs.cassette.joints[0]).toMatchObject({
      target: { occurrence: 'wp_1', face: 'face_1', side: 'back' },
      placement: expect.objectContaining({
        origin: ['10', '5'],
        anchor: 'origin',
        targetAnchor: 'top_right'
      })
    });
    expect(topology.nodes.map(node => ({ id: node.id, level: node.level }))).toEqual([
      { id: 'wp_1', level: 0 },
      { id: 'wp_2', level: 1 },
      { id: 'wp_3', level: 2 }
    ]);
    expect(selectedDrawing.foldedPreview.faces.map(face => face.nodeId)).toEqual(['face_2']);
    expect(assemblyCurves.find(curve => curve.node.id === 'face_2').vertices[0]).toEqual([510, 405, 0]);
  });

  it('stores multiple declared attachments for one workpiece and uses only one placement driver', () => {
    const first = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const second = addCassetteV2Workpiece(first.tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const addedAttachment = addCassetteV2WorkpieceAttachment(second.tree, 'wp_3', {
      targetWorkpieceId: 'wp_2',
      targetFaceId: 'face_2',
      sourceFaceId: 'face_3'
    });
    const extraRelation = getCassetteV2WorkpieceRelations(addedAttachment.tree)
      .find(relation => relation.id === addedAttachment.relationId);
    const promoted = updateCassetteV2WorkpieceRelation(addedAttachment.tree, addedAttachment.relationId, {
      driver: true,
      targetSnap: 'origin'
    });
    const relations = getCassetteV2WorkpieceRelations(promoted).filter(relation => relation.sourceWorkpieceId === 'wp_3');
    const occs = createCassetteV2OccsDocument(promoted);
    const topology = buildCassetteV2WorkpieceTopology(promoted);

    expect(extraRelation).toMatchObject({
      sourceWorkpieceId: 'wp_3',
      targetWorkpieceId: 'wp_2',
      driver: false
    });
    expect(relations.map(relation => ({
      target: relation.targetWorkpieceId,
      driver: relation.driver,
      snap: relation.targetSnap
    }))).toEqual([
      { target: 'wp_1', driver: false, snap: 'center' },
      { target: 'wp_2', driver: true, snap: 'origin' }
    ]);
    expect(occs.cassette.joints.filter(joint => joint.source.occurrence === 'wp_3').map(joint => (
      joint.target.occurrence
    ))).toEqual(['wp_1', 'wp_2']);
    expect(occs.cassette.joints.find(joint => joint.source.occurrence === 'wp_3')).not.toHaveProperty('driver');
    expect(occs.cassette.occurrences.find(item => item.id === 'wp_3').placement.relativeTo).toMatchObject({
      occurrence: 'wp_2',
      face: 'face_2'
    });
    expect(topology.edges.filter(edge => edge.targetWorkpieceId === 'wp_3').map(edge => ({
      source: edge.sourceWorkpieceId,
      driver: edge.driver
    }))).toEqual([
      { source: 'wp_1', driver: false },
      { source: 'wp_2', driver: true }
    ]);
  });

  it('deletes workpiece attachment links without deleting the linked workpieces', async () => {
    const first = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const second = addCassetteV2Workpiece(first.tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const addedAttachment = addCassetteV2WorkpieceAttachment(second.tree, 'wp_3', {
      targetWorkpieceId: 'wp_2',
      targetFaceId: 'face_2',
      sourceFaceId: 'face_3'
    });
    const promoted = updateCassetteV2WorkpieceRelation(addedAttachment.tree, addedAttachment.relationId, {
      driver: true,
      targetSnap: 'origin'
    });
    const deleted = deleteCassetteV2WorkpieceRelation(promoted, addedAttachment.relationId);
    const relations = getCassetteV2WorkpieceRelations(deleted.tree).filter(relation => relation.sourceWorkpieceId === 'wp_3');
    const drawing = await renderCassetteV2TreeToDrawing(promoted, {
      mode: 'assembly',
      contextWorkpieceId: 'wp_3',
      selectedRelationId: addedAttachment.relationId
    });

    expect(deleted.deletedRelationId).toBe(addedAttachment.relationId);
    expect(deleted.tree.workpieces.map(workpiece => workpiece.id)).toEqual(['wp_1', 'wp_2', 'wp_3']);
    expect(relations).toEqual([expect.objectContaining({
      targetWorkpieceId: 'wp_1',
      driver: true
    })]);
    expect(deleted.tree.workpieces.find(workpiece => workpiece.id === 'wp_3').placement.relativeTo).toMatchObject({
      occurrence: 'wp_1'
    });
    expect(drawing.layers.find(layer => layer.standardCode === 'cut.outer').paths.map(path => ({
      workpieceId: path.workpieceId,
      opacity: path.opacity
    }))).toEqual([
      { workpieceId: 'wp_1', opacity: 0.28 },
      { workpieceId: 'wp_2', opacity: 0.28 },
      { workpieceId: 'wp_3', opacity: 1 }
    ]);
    expect(drawing.designerAttachmentMarkers.map(marker => ({
      relationId: marker.relationId,
      role: marker.role,
      workpieceId: marker.workpieceId,
      active: marker.active
    }))).toEqual(expect.arrayContaining([
      {
        relationId: addedAttachment.relationId,
        role: 'target',
        workpieceId: 'wp_2',
        active: true
      },
      {
        relationId: addedAttachment.relationId,
        role: 'source',
        workpieceId: 'wp_3',
        active: true
      }
    ]));
  });

  it('deletes only a non-root workpiece and its incident attachment edges', () => {
    const first = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const second = addCassetteV2Workpiece(first.tree, {
      referenceWorkpieceId: 'wp_2',
      referenceNodeId: 'face_2'
    });
    const result = deleteCassetteV2Workpiece(second.tree, 'wp_2');
    const rootDelete = deleteCassetteV2Workpiece(result.tree, 'wp_1');
    const occs = createCassetteV2OccsDocument(result.tree);

    expect(result.deletedWorkpieceIds).toEqual(['wp_2']);
    expect(result.selectedWorkpieceId).toBe('wp_1');
    expect(result.tree.workpieces.map(workpiece => workpiece.id)).toEqual(['wp_1', 'wp_3']);
    expect(result.tree.nodes.map(node => node.id)).toEqual(['face_1', 'face_3']);
    expect(result.tree.joints).toEqual([]);
    expect(occs.definitions.workpieces).toHaveLength(2);
    expect(occs.cassette.occurrences).toHaveLength(2);
    expect(occs.cassette.joints).toEqual([]);
    expect(rootDelete.deletedWorkpieceIds).toEqual([]);
    expect(rootDelete.tree.workpieces.map(workpiece => workpiece.id)).toEqual(['wp_1', 'wp_3']);
  });

  it('writes labeled graph node values before loading the Nodi graph', () => {
    const targetGraph = JSON.parse(JSON.stringify(graph));

    setGraphNumberInput(targetGraph, 'parentEdgeIndex', 4);

    expect(targetGraph.nodes.parentEdgeInput.entity.data.value).toBe(4);
  });

  it('normalizes numeric Nodi hint codes before browser graph loading', () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    const composition = composeCassetteV2NodiGraph(tree, graph);
    const hints = Object.values(composition.graph.nodes)
      .flatMap(node => [
        ...(node.input?.parameters || []),
        ...(node.output?.parameters || [])
      ])
      .map(parameter => parameter.hint)
      .filter(value => value !== undefined);

    expect(hints.some(value => typeof value === 'number')).toBe(false);
  });

  it('selects the trapezoid polyline output instead of construction curves', () => {
    const lineIdentifier = { graphNodeSet: { nodeId: 'root-base-line-node' }, outputId: 'root-base-output' };
    const boundaryIdentifier = { graphNodeSet: { nodeId: 'boundary-node' }, outputId: 'boundary-output' };
    const engine = {
      findGeometryInteropById(identifier) {
        if (identifier.outputId === 'root-base-output') {
          return {
            variant: 'Curve',
            data: { vertices: [[0, 0, 0], [20, 0, 0]] }
          };
        }
        return {
          variant: 'Curve',
          data: { vertices: [[0, 0, 0], [10, 0, 0], [8, 5, 0], [2, 5, 0], [0, 0, 0]] }
        };
      }
    };

    const drawing = buildCassetteV2Drawing({
      geometryIdentifiers: [lineIdentifier, boundaryIdentifier]
    }, engine, graph);

    expect(findBoundaryOutputRef(graph)).toEqual({ nodeId: 'boundary-node', outputId: 'boundary-output' });
    expect(drawing.layers.map(layer => layer.name)).toEqual([
      'construction.nodi',
      'contour.flat_pattern.face_and_returns'
    ]);
    expect(drawing.layers[1].paths[0].d).toContain('M 0 0 L 10 0 L 8 -5 L 2 -5 L 0 0 Z');
    expect(drawing.vertices).toHaveLength(4);
    expect(drawing.designerEdges).toHaveLength(4);
  });

  it('builds designer edges from evaluated Nodi boundaries instead of synthetic trapezoid geometry', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    const composition = composeCassetteV2NodiGraph(tree, graph);
    const rootRef = composition.faces[0].boundaryOutput;
    const childRef = composition.faces[1].boundaryOutput;
    const identifiers = [
      { graphNodeSet: { nodeId: rootRef.nodeId }, outputId: rootRef.outputId },
      { graphNodeSet: { nodeId: childRef.nodeId }, outputId: childRef.outputId }
    ];
    const engine = {
      findGeometryInteropById(identifier) {
        if (identifier.outputId === rootRef.outputId) {
          return {
            variant: 'Curve',
            data: { vertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]] }
          };
        }
        return {
          variant: 'Curve',
          data: { vertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0], [100, 40, 0]] }
        };
      }
    };

    const drawing = await buildCassetteV2ComposedDrawing({ geometryIdentifiers: identifiers }, engine, composition, tree);

    expect(drawing.layers.map(layer => layer.standardCode)).toEqual([
      'contour.cassette_face',
      'cut.outer',
      'fold.route',
      'dimension.cassette',
      'code.cassette_mark'
    ]);
    expect(drawing.layers[0].paths).toHaveLength(1);
    expect(drawing.layers[1].paths).toHaveLength(1);
    expect(drawing.layers[2].paths).toEqual([{
      d: 'M 100 -40 L 0 -40',
      fill: 'none',
      stroke: 'layer'
    }]);
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette').paths
      .filter(path => path.kind === 'text')
      .map(path => path.text)).toEqual(['A', 'B', 'R']);
    expect(drawing.designerFaces.map(face => face.nodeId)).toEqual(['face_1', 'face_2']);
    expect(drawing.designerFoldEdges).toEqual([expect.objectContaining({
      nodeId: 'face_1',
      edgeIndex: 2,
      foldNodeId: 'face_2',
      angle: '90',
      label: '90'
    })]);
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('builds the live tree drawing from separately evaluated face boundaries', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    tree.nodes[1].foldAngle = '135';
    const occs = createCassetteV2OccsDocument(tree);
    const drawing = await buildCassetteV2IncrementalDrawing([
      {
        node: tree.nodes[0],
        boundaryVertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]]
      },
      {
        node: tree.nodes[1],
        boundaryVertices: [[100, 40, 0], [0, 40, 0], [0, 70, 0], [100, 70, 0], [100, 40, 0]]
      }
    ], tree);

    expect(drawing.layers.map(layer => layer.standardCode)).toEqual([
      'contour.cassette_face',
      'cut.outer',
      'fold.route',
      'dimension.cassette',
      'code.cassette_mark'
    ]);
    expect(drawing.layers[0].paths).toHaveLength(1);
    expect(drawing.layers[1].paths).toHaveLength(1);
    expect(drawing.layers[2].paths).toHaveLength(1);
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette').paths
      .filter(path => path.kind === 'text')
      .map(path => path.text)).toEqual(['A', 'B', 'R']);
    expect(occs.definitions.workpieces[0].folds[0].angle).toBe('135');
    expect(occs.definitions.workpieces[0].entities.map(entity => entity.layer)).toContain('dimension.cassette');
    expect(drawing.designerFaces.map(face => face.nodeId)).toEqual(['face_1', 'face_2']);
    expect(drawing.designerFoldEdges).toEqual([expect.objectContaining({
      nodeId: 'face_1',
      edgeIndex: 2,
      foldNodeId: 'face_2',
      angle: '135',
      label: '135'
    })]);
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('preserves child attachment edge index in OCCS and folded preview payload', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    tree.nodes[1].attachEdge = 'E2';
    const occs = createCassetteV2OccsDocument(tree);
    const drawing = await buildCassetteV2IncrementalDrawing([
      {
        node: tree.nodes[0],
        boundaryVertices: [[0, 0, 0], [100, 0, 0], [100, 40, 0], [0, 40, 0], [0, 0, 0]]
      },
      {
        node: tree.nodes[1],
        boundaryVertices: [[100, 70, 0], [0, 70, 0], [0, 40, 0], [100, 40, 0], [100, 70, 0]]
      }
    ], tree);

    expect(occs.definitions.workpieces[0].folds[0]).toMatchObject({
      from: 'face_1.E2',
      to: 'face_2.E2'
    });
    expect(drawing.foldedPreview.folds[0]).toMatchObject({
      parentEdgeIndex: 2,
      childEdgeIndex: 2,
      childAttachEdge: 'E2'
    });
  });

  it('builds the live tree drawing from pure trapezoid curves', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    const curves = buildCassetteV2TrapezoidTreeCurves(tree);
    const drawing = await renderCassetteV2TreeToDrawing(tree);

    expect(curves[0].vertices).toEqual([
      [0, 0, 0],
      [500, 0, 0],
      [500, 400, 0],
      [0, 400, 0],
      [0, 0, 0]
    ]);
    expect(curves[1].vertices).toEqual([
      [0, 400, 0],
      [500, 400, 0],
      [500, 435, 0],
      [0, 435, 0],
      [0, 400, 0]
    ]);
    expect(drawing.layers.map(layer => layer.standardCode)).toEqual([
      'contour.cassette_face',
      'cut.outer',
      'fold.route',
      'dimension.cassette',
      'code.cassette_mark'
    ]);
    expect(drawing.foldedPreview.faces).toHaveLength(2);
    expect(drawing.designerFaces.map(face => face.workpieceId)).toEqual(['wp_1', 'wp_1']);
    expect(drawing.designerSections.handles.map(handle => handle.orientation)).toEqual(['vertical', 'horizontal']);
    expect(drawing.designerSections.segments.map(segment => segment.orientation)).toEqual(expect.arrayContaining(['vertical', 'horizontal']));
    expect(drawing.layers.find(layer => layer.standardCode === 'code.cassette_mark').paths.length).toBeGreaterThan(0);
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('adds cassette mark entities and drawing text for each sheet workpiece', async () => {
    const added = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const context = { templateName: 'Tray A', templateId: 'tpl_123' };
    const occs = createCassetteV2OccsDocument(added.tree, context);
    const drawing = await renderCassetteV2TreeToDrawing(added.tree, { cassetteMarkContext: context });
    const markEntities = occs.definitions.workpieces.flatMap(workpiece => (
      workpiece.entities.filter(entity => entity.layer === 'code.cassette_mark')
    ));
    const markLayer = drawing.layers.find(layer => layer.standardCode === 'code.cassette_mark');
    const markTexts = markLayer.paths.filter(path => path.kind === 'text' && path.markKind === 'cassette');

    expect(markEntities).toHaveLength(2);
    expect(markEntities.map(entity => entity.geometry.text)).toEqual([
      'Tray A\ntpl_123\nWP 1',
      'Tray A\ntpl_123\nWP 2'
    ]);
    expect(markTexts.map(path => path.text)).toEqual([
      'Tray A\ntpl_123\nWP 1',
      'Tray A\ntpl_123\nWP 2'
    ]);
    expect(markTexts[0]).toMatchObject({
      x: 12,
      y: -12,
      textAnchor: 'start',
      dominantBaseline: 'hanging'
    });
  });

  it('keeps template dimension labels symbolic in the fallback trapezoid renderer', async () => {
    const drawing = await renderCassetteV2ToDrawing({
      globalParameters: { A: '500', B: '400' },
      parameters: {
        defaultLength: 'A',
        height: 'B'
      }
    });
    const dimensionLayer = drawing.layers.find(layer => layer.standardCode === 'dimension.cassette');

    expect(dimensionLayer.paths.filter(path => path.kind === 'text').map(path => path.text)).toEqual(['A', 'B']);
  });
});
