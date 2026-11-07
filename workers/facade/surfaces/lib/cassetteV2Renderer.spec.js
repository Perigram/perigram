import { describe, expect, it } from 'vitest';
import {
  addCassetteV2GraphChild,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2ProfileWorkpiece,
  addCassetteV2Workpiece,
  addCassetteV2WorkpieceAttachment,
  buildCassetteV2ComposedDrawing,
  buildCassetteV2Drawing,
  buildCassetteV2FaceGraph,
  buildCassetteV2IncrementalDrawing,
  buildCassetteV2TreeCurves,
  buildCassetteV2WorkpieceTopology,
  cassetteV2AttachableProfileEdgesForTree,
  cassetteV2AssemblyEntities,
  cassetteV2AssemblyEntitiesFromDrawing,
  cassetteV2FaceSketchContext,
  cassetteV2FaceSketchFromNode,
  cassetteV2LayerPanelRows,
  cassetteV2ProfileSketch,
  cassetteV2SketchFrame,
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
  normalizeCassetteV2Face,
  normalizeCassetteV2Profile,
  renameCassetteV2TreeParameter,
  normalizeCassetteV2Trapezoid,
  renderCassetteV2ToDrawing,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  resolveCassetteV2Expression,
  resolveCassetteV2FaceSketchRegion,
  setGraphNumberInput,
  updateCassetteV2FaceInstance,
  updateCassetteV2FaceSketch,
  updateCassetteV2Workpiece,
  updateCassetteV2WorkpieceRelation
} from './cassetteV2Renderer.js';
import {
  createDefaultOccsProfileSketch,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '../../occs/profiles.js';
import { buildCassetteV2FoldedPreview } from './cassetteV2FoldedPreview.js';

const openChainSketch = (points, parameters = {}) => normalizeOccsProfileSketch({
  parameters,
  shapes: [{
    id: 's0',
    type: 'chain',
    op: 'none',
    closed: false,
    points: points.map(([x, y], index) => ({ id: `p${index}`, x, y })),
    edges: points.slice(0, -1).map((_, index) => ({ id: `e${index}`, from: `p${index}`, to: `p${index + 1}` }))
  }]
});

const sectionShapeVertices = (section, kind = 'rect') => (
  (section?.shapes || []).find(shape => shape.kind === kind)?.vertices || []
);

const xsOf = (ring) => ring.map(vertex => vertex[0]);
const ysOf = (ring) => ring.map(vertex => vertex[1]);
const expectCloseToBounds = ([min, max]) => expect.arrayContaining([
  expect.closeTo(min, 5),
  expect.closeTo(max, 5)
]);

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
  it('starts from one face and defaults child role by parent role', async () => {
    const initialTree = createCassetteV2GraphTree();
    let result = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    result = addCassetteV2GraphChild(result.tree, 'face_2', 1);
    result = addCassetteV2GraphChild(result.tree, 'face_1', 0);
    const duplicate = addCassetteV2GraphChild(result.tree, 'face_1', 2);
    const occs = await createCassetteV2OccsDocument(result.tree);
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
      role: 'return_flange',
      parameters: expect.objectContaining({
        height: 'R',
        baseStartOffset: '0',
        baseEndOffset: '0',
        topStartOffset: '0',
        topEndOffset: '0'
      })
    });
    expect(result.tree.nodes[2]).toMatchObject({
      id: 'face_3',
      parentId: 'face_2',
      parentEdgeIndex: 1,
      role: 'mounting_flange',
      foldAngle: '-90'
    });
    expect(occs.definitions.workpieces[0].faces.map(face => face.id)).toEqual(['face_1', 'face_2', 'face_3', 'face_4']);
    expect(occs.definitions.workpieces[0].faces.map(face => face.role)).toEqual([
      'main',
      'return_flange',
      'mounting_flange',
      'return_flange'
    ]);
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

  it('adds profile workpieces and renders their attached section geometry', async () => {
    const initialTree = createCassetteV2GraphTree();
    const result = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      profileTemplate: {
        _id: 'profile_1',
        identity: { name: 'Hook profile' },
        data: {
          kind: 'hanger',
          process: 'extruded',
          instance: { W: '40', H: '24', R: '2', D: '5', L: '100' }
        }
      }
    });
    const workpiece = getCassetteV2Workpieces(result.tree).find(item => item.id === result.workpieceId);
    const occs = await createCassetteV2OccsDocument(result.tree);
    const definition = occs.definitions.workpieces.find(item => item.id === workpiece.definitionId);

    expect(workpiece).toMatchObject({
      type: 'profile',
      profileTemplateId: 'profile_1'
    });
    expect(workpiece).not.toHaveProperty('family');
    expect(workpiece).not.toHaveProperty('hardware');
    expect(definition).toMatchObject({
      type: 'profile',
      role: 'hanger',
      parameters: { W: '40', H: '24', R: '2', D: '5', L: '100' },
      profile: {
        section: {
          type: 'shapes',
          // The default template is parametric: the template's own
          // parameters drive the evaluated section (the centered
          // subtract circle of diameter D cuts the hole).
          shapes: expect.arrayContaining([
            expect.objectContaining({ kind: 'circle', op: 'subtract' })
          ])
        },
        sweep: { type: 'linear', length: '100' }
      },
      manufacturing: { process: 'extruded' }
    });
    const drawing = await renderCassetteV2TreeToDrawing(result.tree, { mode: 'assembly' });
    // Closed profile sections produce their production effect: the cut
    // polygon rides the inner-cut layer, nothing rides the section layer.
    const cutInner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(cutInner.paths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workpieceId: 'wp_1',
        hardwareWorkpieceId: undefined,
        relationId: expect.any(String)
      })
    ]));
    const sectionLayer = drawing.layers.find(layer => layer.name === 'designer.section');
    expect(sectionLayer.paths.filter(path => path.relationId)).toHaveLength(0);
  });

  it('places the sketch in assembly coordinates over the locked assembly layers', async () => {
    const tree = createCassetteV2GraphTree();
    const faceFrame = await cassetteV2SketchFrame(tree, { mode: 'face', id: tree.rootId });
    expect(faceFrame).toMatchObject({ origin: [0, 0, 0], rotation: 0, mirrorX: false, mirrorY: false });
    const assembly = await cassetteV2AssemblyEntities(tree);
    expect(assembly?.entities.length).toBeGreaterThan(0);
    expect(assembly.layers.length).toBeGreaterThan(0);
    expect(assembly.layers.every(layer => layer.locked)).toBe(true);
    const curves = await buildCassetteV2TreeCurves(tree, { mode: 'assembly' });
    const expected = curves[0].boundaryVertices || curves[0].vertices;
    const polys = assembly.entities.filter(entity => entity.type === 'poly');
    expect(polys.some(poly => expected.every(([x, y]) => (
      poly.pts.some(pt => Math.hypot(pt.x - x, pt.y - y) < 0.001)
    )))).toBe(true);

    const added = addCassetteV2ProfileWorkpiece(tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      profileTemplate: {
        _id: 'profile_1',
        identity: { name: 'Hook profile' },
        data: {
          kind: 'hanger',
          process: 'extruded',
          instance: { W: '40', H: '24', R: '2', D: '5', L: '100' }
        }
      }
    });
    const frame = await cassetteV2SketchFrame(added.tree, { mode: 'profile', id: added.workpieceId });
    expect(frame).toBeTruthy();
    expect(frame.origin.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(frame.rotation)).toBe(true);

    const child = addCassetteV2GraphChild(tree, tree.rootId, 0);
    const folded = await cassetteV2AssemblyEntities(child.tree);
    expect(folded.linetypes.length).toBeGreaterThan(0);
    expect(folded.layers.some(layer => layer.linetype === 'DASHED' || layer.linetype === 'DOT')).toBe(true);
  });

  it('places a child face sketch at its shard on the host edge', async () => {
    const tree = createCassetteV2GraphTree();
    const child = addCassetteV2GraphChild(tree, tree.rootId, 0, {
      edgeLength: 500,
      shardStart: 100,
      shardEnd: 250
    });
    const grandchild = addCassetteV2GraphChild(child.tree, child.nodeId, 1);
    const frame = await cassetteV2SketchFrame(grandchild.tree, { mode: 'face', id: grandchild.nodeId });
    const curves = await buildCassetteV2TreeCurves(grandchild.tree, { mode: 'assembly' });
    const curve = curves.find(item => item.node.id === grandchild.nodeId);
    const radians = frame.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const mapped = curve.localVertices.slice(0, curve.boundaryVertices.length).map(([x, y]) => [
      frame.origin[0] + x * cos - y * sin,
      frame.origin[1] + x * sin + y * cos
    ]);
    mapped.forEach((point, index) => {
      expect(point[0]).toBeCloseTo(curve.boundaryVertices[index][0], 6);
      expect(point[1]).toBeCloseTo(curve.boundaryVertices[index][1], 6);
    });
  });

  it('embeds an open profile into the face boundary and leaves the edge free', async () => {
    const initialTree = createCassetteV2GraphTree();
    const square = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const result = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      kind: 'hanger',
      process: 'extruded',
      occsProfile: occsProfileFromSketch(square),
      sketch: square
    });
    const workpiece = getCassetteV2Workpieces(result.tree).find(item => item.id === result.workpieceId);
    expect(workpiece.profileSnapshot.section).toMatchObject({ type: 'polyline', open: true });
    const relation = getCassetteV2WorkpieceRelations(result.tree)[0];
    const arranged = updateCassetteV2WorkpieceRelation(result.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '1'
    });
    const openFrame = await cassetteV2SketchFrame(arranged, { mode: 'profile', id: result.workpieceId });
    expect(openFrame).toBeTruthy();
    const openAssembly = await cassetteV2AssemblyEntities(arranged);
    expect(openAssembly?.entities.length).toBeGreaterThan(0);

    const cleanDrawing = await renderCassetteV2TreeToDrawing(initialTree, { mode: 'assembly' });
    const drawing = await renderCassetteV2TreeToDrawing(arranged, { mode: 'assembly' });
    // The composite chain splices into the drawn boundary: the face
    // outline grows beyond the four authored corners...
    const cleanFace = cleanDrawing.designerFaces.find(face => face.nodeId === 'face_1');
    const face = drawing.designerFaces.find(face => face.nodeId === 'face_1');
    expect(face.d.length).toBeGreaterThan(cleanFace.d.length);
    // ...the section layer carries no profile geometry...
    const sectionLayer = drawing.layers.find(layer => layer.name === 'designer.section');
    expect(sectionLayer.paths.filter(path => path.relationId)).toHaveLength(0);
    const edgeIndexes = drawing.designerEdges
      .filter(edge => edge.nodeId === 'face_1')
      .map(edge => edge.edgeIndex);
    expect(edgeIndexes).toEqual([0, 1, 2, 3]);
  });

  it('offers only arrangeable edges: folds are excluded, profiles may share an edge', () => {
    // A face grown on E0 folds there; profiles may share every other
    // edge across its whole length.
    const initialTree = createCassetteV2GraphTree();
    const grown = addCassetteV2GraphChild(initialTree, 'face_1', 0).tree;
    expect(cassetteV2AttachableProfileEdgesForTree(grown, 'face_1')).toEqual(['E1', 'E2', 'E3']);

    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const arranged = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '1'
    });
    expect(cassetteV2AttachableProfileEdgesForTree(arranged, 'face_1')).toEqual(['E1', 'E2', 'E3']);
    // The fold eats an edge on both faces (the existing folded-edge law):
    // the child's attach edge is not arrangeable either.
    expect(cassetteV2AttachableProfileEdgesForTree(arranged, 'face_2')).toEqual(['E1', 'E2', 'E3']);
  });

  it('refuses an open profile on a fold edge and lets a closed profile cut through it', async () => {
    const initialTree = createCassetteV2GraphTree();
    const grown = addCassetteV2GraphChild(initialTree, 'face_1', 0).tree;
    const cleanFace = (await renderCassetteV2TreeToDrawing(grown, { mode: 'assembly' }))
      .designerFaces.find(face => face.nodeId === 'face_1');

    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const onFold = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E0',
      arrayMode: 'count',
      arrayCount: '1'
    });
    const drawing = await renderCassetteV2TreeToDrawing(onFold, { mode: 'assembly' });
    expect(drawing.profileEmbeddingErrors).toEqual([
      { relationId: expect.any(String), reason: 'fold-edge' }
    ]);
    // The fold edge is never spliced: the outline stays the authored one.
    const face = drawing.designerFaces.find(item => item.nodeId === 'face_1');
    expect(face.d).toBe(cleanFace.d);

    // A closed section cuts through the fold; the authored bend route
    // stays on the parent edge.
    const crossingCut = normalizeOccsProfileSketch({
      parameters: {},
      shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [0, 0], diameter: 100 }]
    });
    const closed = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Fold cut',
      occsProfile: occsProfileFromSketch(crossingCut),
      sketch: crossingCut
    });
    const closedRelation = getCassetteV2WorkpieceRelations(closed.tree)
      .find(item => item.sourceWorkpieceId === closed.workpieceId);
    const cutOnFold = updateCassetteV2WorkpieceRelation(closed.tree, closedRelation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E0',
      arrayMode: 'count',
      arrayCount: '1'
    });
    const cutDrawing = await renderCassetteV2TreeToDrawing(cutOnFold, { mode: 'assembly' });
    const cutFace = cutDrawing.designerFaces.find(item => item.nodeId === 'face_1');

    expect(cutDrawing.profileEmbeddingErrors).toEqual([]);
    expect(cutFace.d).not.toBe(cleanFace.d);
    expect(cutDrawing.designerFoldEdges).toEqual(
      (await renderCassetteV2TreeToDrawing(grown, { mode: 'assembly' })).designerFoldEdges
    );
  });

  it('keeps a closed profile cut when a face takes another shard of the host edge', async () => {
    const cutSketch = normalizeOccsProfileSketch({
      parameters: {},
      shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [80, 0], diameter: 100 }]
    });
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Edge cut',
      occsProfile: occsProfileFromSketch(cutSketch),
      sketch: cutSketch
    });
    const clean = await renderCassetteV2TreeToDrawing(added.tree);
    const cleanParent = clean.designerFaces.find(face => face.nodeId === 'face_1');
    const face = addCassetteV2GraphChild(added.tree, 'face_1', 0, {
      edgeLength: 500,
      shardStart: 0,
      shardEnd: 200
    });
    const drawing = await renderCassetteV2TreeToDrawing(face.tree);
    const parent = drawing.designerFaces.find(item => item.nodeId === 'face_1');

    expect(drawing.profileEmbeddingErrors).toEqual([]);
    expect(parent.d).toBe(cleanParent.d);
    expect(drawing.designerFaces.map(item => item.nodeId)).toEqual(['face_1', face.nodeId]);
    expect(drawing.foldedPreview.faces.find(item => item.nodeId === 'face_1').holes).toHaveLength(1);

    const assembly = await renderCassetteV2TreeToDrawing(face.tree, {
      mode: 'assembly',
      contextWorkpieceId: 'wp_1'
    });
    const faceLayer = assembly.layers.find(layer => layer.standardCode === 'contour.cassette_face');
    expect(faceLayer.paths.some(path => path.fillRule === 'evenodd')).toBe(true);
  });

  it('applies the profile steps in authored order — the sequence is semantic', async () => {
    const tab = { type: 'rect', op: 'add', center: [10, 0], width: 40, height: 24, rotation: 0 };
    const hole = { type: 'circle', op: 'subtract', center: [10, 0], diameter: 10 };
    const patch = { type: 'rect', op: 'add', center: [12, 0], width: 6, height: 40, rotation: 0 };
    const build = (shapes) => {
      const sketch = normalizeOccsProfileSketch({
        parameters: {},
        shapes: shapes.map((shape, index) => ({ id: `s${index}`, ...shape }))
      });
      const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
        referenceWorkpieceId: 'wp_1',
        referenceNodeId: 'face_1',
        name: 'Ordered steps',
        sketch
      });
      const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
      return updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
        placementMode: 'edgeArray',
        arrayEdge: 'E2',
        arrayMode: 'count',
        arrayCount: '1',
        offsetX: '50',
        offsetY: '30'
      });
    };
    const ringAreas = async (shapes) => {
      const drawing = await renderCassetteV2TreeToDrawing(build(shapes), {});
      const face = drawing.designerFaces.map(item => item.d).join(' ');
      return face.split('M')
        .filter(Boolean)
        .map(sub => (sub.match(/-?[\d.]+ -?[\d.]+/g) || [])
          .map(pair => pair.split(' ').map(Number)))
        .map(points => {
          let area = 0;
          for (let index = 0; index < points.length; index += 1) {
            const [x1, y1] = points[index];
            const [x2, y2] = points[(index + 1) % points.length];
            area += x1 * y2 - x2 * y1;
          }
          return Math.abs(area / 2);
        })
        .sort((left, right) => left - right);
    };
    // Cut, then bridge part of the cut: the later add refills the
    // covered half of the hole.
    const punched = await ringAreas([tab, hole]);
    const bridged = await ringAreas([tab, hole, patch]);
    // Cut through everything, then add the tab over the hole: the
    // refill leaves no hole ring at all.
    const refilled = await ringAreas([patch, hole, tab]);
    expect(punched).toHaveLength(2);
    expect(bridged).toHaveLength(2);
    expect(bridged[0]).toBeLessThan(punched[0]);
    expect(refilled).toHaveLength(1);
  });

  it('keeps authored array values untouched on the relation read', () => {
    // An empty string or a zero is the author's text while typing, never
    // a missing value: a falsy read rewrote the field with the default
    // under the caret.
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      parameters: {},
      sketch: createDefaultOccsProfileSketch()
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const edited = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayMode: 'spacing',
      arraySpacing: '',
      arrayEdge: 'E1'
    });
    const cleared = getCassetteV2WorkpieceRelations(edited)[0];
    expect(cleared.pattern.x.gap).toBe('');
    expect(cleared.pattern.edge).toBe('E1');
    const zeroed = updateCassetteV2WorkpieceRelation(edited, relation.id, { arraySpacing: '0' });
    expect(getCassetteV2WorkpieceRelations(zeroed)[0].pattern.x.gap).toBe('0');
    expect(getCassetteV2WorkpieceRelations(zeroed)[0].pattern.x.count).toBe('1');
  });

  it('rounds authored fillet corners in the cassette cut and the embedded boundary', async () => {
    // A rect shape carries its own per-corner fillets — a true sharp
    // baseline clears them; the open variant is a chain with a fillet
    // on one corner.
    const rectSketch = (fillets) => normalizeOccsProfileSketch({
      parameters: { W: 42, H: 28 },
      shapes: [{ id: 's0', type: 'rect', op: 'add', center: [21, 14], width: 'W', height: 'H', fillets }]
    });
    const openRectChain = (fillet) => normalizeOccsProfileSketch({
      parameters: { W: 42, H: 28 },
      shapes: [{
        id: 's0',
        type: 'chain',
        op: 'none',
        closed: false,
        points: [
          { id: 'p0', x: 0, y: 0 },
          { id: 'p1', x: 'W', y: 0 },
          { id: 'p2', x: 'W', y: 'H' },
          { id: 'p3', x: 0, y: 'H' }
        ],
        modifiers: fillet ? [{ type: 'fillet', vertexId: 'p1', radius: 6 }] : []
      }]
    });
    const filleted = rectSketch([0, 1, 2, 3].map(corner => ({ corner, radius: 6 })));
    const sharp = rectSketch([]);

    const build = (sketch) => {
      const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
        referenceWorkpieceId: 'wp_1',
        referenceNodeId: 'face_1',
        name: 'Filleted hanger',
        kind: 'hanger',
        process: 'extruded',
        occsProfile: occsProfileFromSketch(sketch),
        sketch
      });
      const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
      return updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
        placementMode: 'edgeArray',
        arrayEdge: 'E2',
        arrayMode: 'count',
        arrayCount: '1',
        offsetX: '100',
        offsetY: '-20'
      });
    };

    const filletedDrawing = await renderCassetteV2TreeToDrawing(build(filleted), { mode: 'workpiece' });
    const sharpDrawing = await renderCassetteV2TreeToDrawing(build(sharp), { mode: 'workpiece' });
    // The filleted add operand straddles the face edge: the union grows
    // the contour and its rounded corners ride the boundary.
    const contourD = drawing => drawing.designerFaces.find(face => face.nodeId === 'face_1').d;
    expect(contourD(filletedDrawing).match(/[LA]/g).length).toBeGreaterThan(contourD(sharpDrawing).match(/[LA]/g).length);

    // Open profile: the stitched boundary carries the rounded corner.
    const openFilleted = await renderCassetteV2TreeToDrawing(build(openRectChain(true)), { mode: 'workpiece' });
    const openSharp = await renderCassetteV2TreeToDrawing(build(openRectChain(false)), { mode: 'workpiece' });
    const openFilletedFace = openFilleted.designerFaces.find(face => face.nodeId === 'face_1');
    const openSharpFace = openSharp.designerFaces.find(face => face.nodeId === 'face_1');
    expect(openFilletedFace.d.length).toBeGreaterThan(openSharpFace.d.length);
  });

  it('cuts every copy of a closed profile edge array without consuming the edge', async () => {
    const initialTree = createCassetteV2GraphTree();
    const square = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      kind: 'hanger',
      process: 'extruded',
      occsProfile: occsProfileFromSketch(square),
      sketch: square
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    // The 42x28 section rides E2 (the top edge): a margin from both edge
    // ends and a normal offset pull all three copies fully inside the
    // face — each copy a cut on the inner-cut layer.
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '3',
      offsetX: '50',
      offsetY: '30'
    });

    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'workpiece' });
    const cutInner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(cutInner.paths.filter(path => path.relationId === relation.id)).toHaveLength(3);
    expect([...new Set(drawing.designerEdges
      .filter(edge => edge.nodeId === 'face_1')
      .map(edge => edge.edgeIndex))]).toEqual([0, 1, 2, 3]);
  });

  it('keeps closed-profile edge array copies inside the margins and refuses an impossible count', async () => {
    const square = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      occsProfile: occsProfileFromSketch(square),
      sketch: square
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const packed = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '3',
      offsetX: '0',
      offsetY: '30'
    });
    const doc = await createCassetteV2OccsDocument(packed);
    const xs = doc.definitions.workpieces[0].entities
      .filter(entity => entity.layer === 'cut.inner')
      .flatMap(entity => entity.geometry.vertices || [])
      .map(vertex => Number(vertex[0]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(500);

    const impossible = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '20'
    });
    await expect(createCassetteV2OccsDocument(impossible)).rejects.toThrow(/Array placement is invalid/);
  });

  it('merges nested array definition patches', () => {
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: createDefaultOccsProfileSketch()
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'faceArray',
      pattern: {
        kind: 'grid',
        x: { mode: 'span', count: '3', span: '120', start: '10' },
        y: { mode: 'gap', gap: '8' },
        stagger: { enabled: true, axis: 'x' },
        suppress: ['0:1']
      }
    });
    expect(getCassetteV2WorkpieceRelations(tree)[0].pattern).toMatchObject({
      space: 'face',
      kind: 'grid',
      x: expect.objectContaining({ mode: 'span', count: '3', span: '120', start: '10' }),
      y: expect.objectContaining({ mode: 'gap', gap: '8' }),
      stagger: expect.objectContaining({ enabled: true, axis: 'x' }),
      suppress: ['0:1']
    });
  });

  it('places a closed profile in a rectangular face array', async () => {
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: {
        version: '0.2', units: 'mm', parameters: {}, material: 'positive',
        shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [5, 0], diameter: 10 }]
      }
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'faceArray',
      arrayLayout: 'rectangular',
      arrayCountX: '2',
      arrayStepX: '0',
      arrayCountY: '2',
      arrayStepY: '0',
      arrayPaddingX: '20',
      arrayPaddingY: '20',
      targetSnap: 'center'
    });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    expect(drawing.attachmentErrors).toEqual([]);
    const inner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(inner.paths.filter(path => path.relationId === relation.id)).toHaveLength(4);
  });

  it('places every flush face-array copy on the face boundary', async () => {
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: {
        version: '0.2', units: 'mm', parameters: {}, material: 'positive',
        shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [5, 0], diameter: 10 }]
      }
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'faceArray',
      pattern: {
        space: 'face',
        kind: 'grid',
        x: { mode: 'count', count: '3' },
        y: { mode: 'count', count: '2' }
      },
      targetSnap: 'center'
    });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    expect(drawing.attachmentErrors).toEqual([]);
    expect(drawing.designerProfiles.filter(profile => profile.relationId === relation.id)).toHaveLength(6);
  });

  it('rides a refused edge embedding on the drawing instead of vanishing silently', async () => {
    const initialTree = createCassetteV2GraphTree();
    const square = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      kind: 'hanger',
      process: 'extruded',
      occsProfile: occsProfileFromSketch(square),
      sketch: square
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    // Default face 500x400 with a 28-wide chord: twenty copies cannot
    // fit and the embedding refuses.
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: '20'
    });

    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'workpiece' });
    expect(drawing.profileEmbeddingErrors).toEqual([
      { relationId: relation.id, reason: expect.stringContaining('overlaps copy 2') }
    ]);
    const sectionLayer = drawing.layers.find(layer => layer.name === 'designer.section');
    expect(sectionLayer.paths.filter(path => path.relationId === relation.id)).toHaveLength(0);
  });

  it('layer panel rows cover the full standards registry, present or not', async () => {
    const drawing = await renderCassetteV2TreeToDrawing(createCassetteV2GraphTree(), { mode: 'workpiece' });
    const rows = cassetteV2LayerPanelRows(drawing);
    const codes = rows.filter(row => row.code).map(row => row.code);
    expect(codes).toHaveLength(22);
    expect(codes.slice(0, 6)).toEqual([
      'contour.prefix',
      'contour.cassette_face',
      'contour.flat_pattern.face_and_returns',
      'contour.flat_pattern.offset_envelope',
      'contour.material_sheet',
      'contour.nesting_field'
    ]);
    // Registry order, registry names, parametric names interpolated.
    const cutOuter = rows.find(row => row.code === 'cut.outer');
    expect(cutOuter.name).toBe('2_1_Обрезь_3,15');
    expect(cutOuter.tablePen).toMatchObject({ color: '#DC2626', weight: 0.6 });
    // Presence: the bare face drawing carries the face contour, the cut
    // contour, dimensions, and the designer-only section layer.
    expect(cutOuter.present).toBe(true);
    expect(rows.find(row => row.code === 'cut.hole').present).toBe(false);
    expect(rows.find(row => row.code === 'fold.engrave').present).toBe(false);
    // Non-standard drawing layers ride after the registry rows.
    const leftover = rows.find(row => row.key === 'designer.section');
    expect(leftover).toMatchObject({ code: '', present: true });
    expect(rows[rows.length - 1].key).toBe(leftover.key);
  });

  it('carries the parametric default table on an attached profile so its row chips drive it', async () => {
    const initialTree = createCassetteV2GraphTree();
    const added = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger'
    });
    const workpieceOf = (tree) => getCassetteV2Workpieces(tree).find(item => item.id === added.workpieceId);

    // No template, no authored sketch: the parametric default template
    // supplies both the geometry and its table. The authored table rides
    // the sketch, the overrides ride the instance table, and the chips
    // render the derived table between them.
    const attached = workpieceOf(added.tree);
    expect(attached.profileSnapshot.instance).toEqual({});
    expect(attached.profileSnapshot.sketch.parameters).toEqual({ W: 42, H: 28, R: 3, D: 6, L: 120 });
    expect(normalizeCassetteV2Profile(attached).parameters).toEqual({ W: 42, H: 28, R: 3, D: 6, L: 120 });

    // Editing the chip re-evaluates: a larger R grows the corner arcs.
    const edited = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { R: 12 }
    });
    const radius = (tree) => sectionShapeVertices(workpieceOf(tree).profileSnapshot.section).length;
    expect(radius(edited)).toBeGreaterThan(radius(added.tree));
  });

  it('reads a workpiece-level profile sketch and migrates it into profileSnapshot on write', () => {
    expect(cassetteV2ProfileSketch(null)).toBe(null);
    const sketch = normalizeOccsProfileSketch({
      parameters: { W: 42, H: 28 },
      shapes: [{
        id: 's0',
        type: 'rect',
        op: 'add',
        center: ['W/2', 'H/2'],
        width: 'W',
        height: 'H'
      }]
    });
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch
    });
    const legacyTree = JSON.parse(JSON.stringify(added.tree));
    const legacy = legacyTree.workpieces.find(item => item.id === added.workpieceId);
    legacy.sketch = legacy.profileSnapshot.sketch;
    delete legacy.profileSnapshot.sketch;

    expect(cassetteV2ProfileSketch(legacy).shapes[0].width).toBe('W');
    expect(normalizeCassetteV2Profile(legacy).sketch.shapes[0].width).toBe('W');

    const nextSketch = normalizeOccsProfileSketch({
      ...legacy.sketch,
      shapes: legacy.sketch.shapes.map(shape => ({ ...shape, width: 60 }))
    });
    const migrated = updateCassetteV2Workpiece(legacyTree, added.workpieceId, {
      profileSnapshot: { sketch: nextSketch }
    });
    const next = getCassetteV2Workpieces(migrated).find(item => item.id === added.workpieceId);
    expect(next.sketch).toBeUndefined();
    expect(next.profileSnapshot.sketch.shapes[0].width).toBe(60);
    expect(normalizeCassetteV2Profile(next).sketch.shapes[0].width).toBe(60);
  });

  it('resolves placed profile and face instance expressions with the cassette scope first', () => {
    const sketch = normalizeOccsProfileSketch({
      parameters: { R: 5, W: 40 },
      shapes: [{
        id: 'outline',
        type: 'rect',
        op: 'add',
        center: ['W/2', 'R'],
        width: 'W',
        height: 'R'
      }]
    });
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch
    });
    const profileTree = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { R: 'R', W: 'R*2' }
    });
    const profile = normalizeCassetteV2Profile(
      getCassetteV2Workpieces(profileTree).find(item => item.id === added.workpieceId),
      { R: 35 }
    );

    expect(profile.instance).toEqual({ R: 'R', W: 'R*2' });
    expect(profile.parameters.R).toBe(35);
    expect(profile.parameters.W).toBe(70);

    const faceTree = updateCassetteV2FaceInstance(
      updateCassetteV2FaceSketch(createCassetteV2GraphTree(), 'face_1', sketch),
      'face_1',
      { R: 'R', W: 'R*2' }
    );
    const face = normalizeCassetteV2Face(faceTree.nodes[0], { R: 35 });
    expect(face.parameters.R).toBe(35);
    expect(face.parameters.W).toBe(70);
  });

  it('re-evaluates a profile workpiece from its sketch when instance parameters change', async () => {
    const initialTree = createCassetteV2GraphTree();
    const sketch = {
      parameters: { W: 42, H: 28, R: 0, D: 6, L: 120 },
      points: [
        { id: 'p0', x: 0, y: 0 },
        { id: 'p1', x: 'W', y: 0 },
        { id: 'p2', x: 'W', y: 'H' },
        { id: 'p3', x: 0, y: 'H' }
      ],
      edges: [
        { from: 'p0', to: 'p1' },
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p3' },
        { from: 'p3', to: 'p0' }
      ],
      closed: true
    };
    const added = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Parametric hanger',
      kind: 'hanger',
      process: 'extruded',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const before = getCassetteV2Workpieces(added.tree).find(item => item.id === added.workpieceId);
    const rectVerticesOf = (workpiece) => sectionShapeVertices(workpiece.profileSnapshot.section, 'chain')
      .map(vertex => vertex.map(String));
    expect(rectVerticesOf(before)).toEqual([['0', '0'], ['42', '0'], ['42', '28'], ['0', '28']]);

    const instantiated = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { W: 84, H: 'W/3' }
    });
    const instance = getCassetteV2Workpieces(instantiated).find(item => item.id === added.workpieceId);
    expect(rectVerticesOf(instance)).toEqual([['0', '0'], ['84', '0'], ['84', '28'], ['0', '28']]);
    // The tables stay apart: the override rides instance, the authored
    // row keeps its value.
    expect(instance.profileSnapshot.instance).toEqual({ W: 84, H: 'W/3' });
    expect(instance.profileSnapshot.sketch.parameters).toMatchObject({ W: 42, H: 28 });

    // A transient invalid parameter keeps the last good section.
    const broken = updateCassetteV2Workpiece(instantiated, added.workpieceId, {
      instance: { W: 84, H: 'W/' }
    });
    const held = getCassetteV2Workpieces(broken).find(item => item.id === added.workpieceId);
    expect(rectVerticesOf(held)).toEqual([['0', '0'], ['84', '0'], ['84', '28'], ['0', '28']]);
  });

  it('resolves a placed profile instance expression in the cassette scope over a same-named local row', () => {
    // The tree carries R=35; the hanger template's own table carries R=3.
    // A cassette-level chip expression reading R gets the CASSETTE one;
    // sketch shape expressions keep reading the profile's own rows.
    const sketch = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { W: 'R*2' }
    });
    const workpiece = getCassetteV2Workpieces(driven).find(item => item.id === added.workpieceId);
    const vertices = sectionShapeVertices(workpiece.profileSnapshot.section).map(vertex => vertex.map(Number));
    expect(Math.max(...vertices.map(vertex => vertex[0]))).toBeCloseTo(70, 5);
    expect(Math.max(...vertices.map(vertex => vertex[1]))).toBeCloseTo(28, 5);
  });

  it('renames a cassette global across the tree', () => {
    const initialTree = createCassetteV2GraphTree();
    const grown = addCassetteV2GraphChild(initialTree, 'face_1', 2).tree;
    grown.nodes.find(node => node.id !== 'face_1').foldAngle = 'A/2deg';
    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], { A: 100 });
    const placed = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Strip',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const relation = getCassetteV2WorkpieceRelations(placed.tree)[0];
    const arranged = updateCassetteV2WorkpieceRelation(placed.tree, relation.id, {
      placementMode: 'edgeArray',
      arrayEdge: 'E2',
      arrayMode: 'count',
      arrayCount: 'A/100'
    });
    const instance = updateCassetteV2Workpiece(arranged, placed.workpieceId, {
      instance: { W: 'A/2' }
    });

    const renamed = renameCassetteV2TreeParameter(instance, 'A', 'LENGTH');
    expect(Object.keys(renamed.parameters)).toEqual(['LENGTH', 'B', 'R']);
    // The face's dimension and the child's fold angle rebind (deg suffix
    // survives).
    expect(renamed.nodes.find(node => node.id === 'face_1').parameters.defaultLength).toBe('LENGTH');
    expect(renamed.nodes.find(node => node.id !== 'face_1').foldAngle).toBe('LENGTH/2deg');
    // The instance value and the array count rebind.
    const workpiece = getCassetteV2Workpieces(renamed).find(item => item.id === placed.workpieceId);
    expect(workpiece.profileSnapshot.instance.W).toBe('LENGTH/2');
    expect(getCassetteV2WorkpieceRelations(renamed)[0].pattern.x.count).toBe('LENGTH/100');
    // Colliding and invalid names refuse.
    expect(renameCassetteV2TreeParameter(renamed, 'LENGTH', 'B').parameters.LENGTH).toBe('500');
    expect(renameCassetteV2TreeParameter(renamed, 'LENGTH', '1X')).toBe(renamed);
  });

  it('reads a chip value that names a cassette global', () => {    const sketch = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    // The default tree carries A=500: the W chip naming it reads it, and
    // the stored instance value keeps the raw expression.
    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { W: 'A' }
    });
    const workpiece = getCassetteV2Workpieces(driven).find(item => item.id === added.workpieceId);
    const boundsOf = (section) => {
      const vertices = sectionShapeVertices(section).map(vertex => vertex.map(Number));
      return Math.max(...vertices.map(vertex => vertex[0]));
    };
    expect(boundsOf(workpiece.profileSnapshot.section)).toBeCloseTo(500, 5);
    expect(workpiece.profileSnapshot.instance.W).toBe('A');

    // The global stays live: the next derivation (what every render
    // runs) reads the changed value — the stored instance value never
    // baked it.
    const reDerived = normalizeCassetteV2Profile(workpiece, { A: '600' });
    expect(boundsOf(reDerived.section)).toBeCloseTo(600, 5);

    // A cassette global never becomes a profile override row, even when
    // an older edit put one there.
    const polluted = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { W: 'A', A: '999' }
    });
    const cleaned = getCassetteV2Workpieces(polluted).find(item => item.id === added.workpieceId);
    expect(cleaned.profileSnapshot.instance).toEqual({ W: 'A' });
    expect(normalizeCassetteV2Profile(cleaned, { A: '500' }).instance).toEqual({ W: 'A' });
    expect(reDerived.instance.W).toBe('A');
    expect(reDerived.parameters.W).toBe(600);
  });

  it('exposes placed profiles as designer hit areas', async () => {
    const sketch = createDefaultOccsProfileSketch();
    const closed = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const closedDrawing = await renderCassetteV2TreeToDrawing(closed.tree);
    const closedHits = closedDrawing.designerProfiles.filter(hit => hit.workpieceId === closed.workpieceId);
    expect(closedHits.length).toBeGreaterThan(0);
    expect(closedHits.every(hit => hit.relationId && hit.d && !hit.open)).toBe(true);

    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], { A: 100 });
    const strip = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Strip',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const openDrawing = await renderCassetteV2TreeToDrawing(strip.tree);
    const openHits = openDrawing.designerProfiles.filter(hit => hit.workpieceId === strip.workpieceId);
    expect(openHits.length).toBeGreaterThan(0);
    expect(openHits.every(hit => hit.relationId && hit.d && hit.open)).toBe(true);
  });

  it('drives a drawn fillet chip whose point id is not its index', () => {
    // The drawing/merge flow mints fresh ids (p4 lands first), so a
    // fillet on that corner must resolve by its vertex slot — parsing the
    // id as an index dropped it and the placed profile stayed frozen.
    const sketch = {
      parameters: { A: 1 },
      points: [
        { id: 'p4', x: 0, y: 0 },
        { id: 'p1', x: 42, y: 0 },
        { id: 'p2', x: 42, y: 28 },
        { id: 'p3', x: 0, y: 28 }
      ],
      edges: [
        { from: 'p4', to: 'p1' }, { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p3' }, { from: 'p3', to: 'p4' }
      ],
      closed: true,
      modifiers: [{ type: 'fillet', vertexId: 'p4', radius: 'A' }]
    };
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Drawn hanger',
      kind: 'hanger',
      process: 'extruded',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const workpieceOf = (tree) => getCassetteV2Workpieces(tree).find(item => item.id === added.workpieceId);
    const chainOf = (tree) => sectionShapeVertices(workpieceOf(tree).profileSnapshot.section, 'chain');

    const before = chainOf(added.tree);
    expect(before.length, 'Expected the authored fillet to round the placed chain').toBeGreaterThan(4);

    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      instance: { A: 2.5 }
    });
    expect(chainOf(driven).length).toBeGreaterThan(4);
    expect(JSON.stringify(chainOf(driven)), 'Expected the chip edit to re-round the chain')
      .not.toBe(JSON.stringify(before));
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

  it('normalizes graph inputs and emits OCCS trapezoid shape data', async () => {
    const trapezoid = normalizeCassetteV2Trapezoid({
      defaultLength: '640',
      height: '80',
      startAnchor: 1,
      endAnchor: 0
    });
    const occs = await createCassetteV2OccsDocument(trapezoid);

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
    expect(occs.extensions.perigram.nodi.inputs.startAnchor).toBe(1);
  });

  it('preserves OCCS expressions while resolving Nodi graph inputs from global parameters', async () => {
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
    const occs = await createCassetteV2OccsDocument(nextTree);
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
    const occs = await createCassetteV2OccsDocument(result.tree);
    const curves = await buildCassetteV2TreeCurves(result.tree);
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
      source: { occurrence: 'wp_2', face: 'face_2', side: 'front' },
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
    const occs = await createCassetteV2OccsDocument(tree);
    const assemblyCurves = await buildCassetteV2TreeCurves(tree, { mode: 'assembly' });
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
    expect(occs.cassette.joints[0].source).toEqual({ occurrence: 'wp_2', face: addedFace.nodeId, side: 'front' });
    expect(sourceFaceCurve.vertices[0]).toEqual(targetCurve.vertices[0]);
    expect(drawing.foldedPreview.joints).toEqual([expect.objectContaining({
      sourceWorkpieceId: 'wp_2',
      sourceFaceId: addedFace.nodeId,
      targetWorkpieceId: 'wp_1',
      targetFaceId: 'face_1'
    })]);
  });

  it('adds declarative hardware as a non-sheet OCCS workpiece with edge-array placement', async () => {
    const result = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'bolt',
      parameters: { diameter: '8', length: '20' },
      pattern: {
        type: 'edgeArray',
        edge: 'E0',
        mode: 'count',
        count: '3',
        spacing: '120'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(result.tree)[0];
    const placedTree = updateCassetteV2WorkpieceRelation(result.tree, relation.id, {
      offsetX: '40',
      offsetY: '12'
    });
    const occs = await createCassetteV2OccsDocument(placedTree);
    const relations = getCassetteV2WorkpieceRelations(placedTree);
    const drawing = await renderCassetteV2TreeToDrawing(placedTree, { mode: 'assembly' });
    const folded = buildCassetteV2FoldedPreview(drawing.foldedPreview);
    const hardwareDefinition = occs.definitions.workpieces.find(workpiece => workpiece.id === `${result.workpieceId}_def`);

    expect(result.nodeId).toBe('');
    expect(hardwareDefinition).toMatchObject({
      type: 'hardware',
      role: 'bolt',
      hardware: {
        family: 'bolt',
        parameters: expect.objectContaining({ diameter: '8', length: '20' })
      }
    });
    expect(hardwareDefinition).not.toHaveProperty('faces');
    expect(relations[0]).toMatchObject({
      sourceWorkpieceId: result.workpieceId,
      sourceFaceId: '',
      targetFaceId: 'face_1',
      placementMode: 'edgeArray',
      pattern: expect.objectContaining({
        space: 'edge',
        kind: 'linear',
        edge: 'E0',
        x: expect.objectContaining({ mode: 'count', count: '3' })
      })
    });
    expect(occs.cassette.joints[0].placement.pattern).toMatchObject({
      space: 'edge',
      kind: 'linear',
      edge: 'E0',
      x: expect.objectContaining({ count: '3' })
    });
    expect(drawing.layers.find(layer => layer.standardCode === 'code.cassette_mark').paths
      .filter(path => path.markKind === 'hardware')
      .map(path => path.text)).toEqual(['B', 'B', 'B']);
    expect(drawing.layers.find(layer => layer.standardCode === 'code.cassette_mark').paths
      .every(path => path.kind === 'text')).toBe(true);
    expect(drawing.layers.find(layer => layer.standardCode === 'cut.hole').paths).toHaveLength(3);
    expect(occs.definitions.workpieces[0].entities
      .filter(entity => entity.layer === 'cut.hole')
      .map(entity => entity.geometry.type)).toEqual(['circle', 'circle', 'circle']);
    expect(drawing.foldedPreview.cutouts.filter(cutout => cutout.layer === 'cut.hole')).toHaveLength(3);
    expect(drawing.foldedPreview.bodies[0]).toMatchObject({
      family: 'bolt',
      targetFaceId: 'face_1',
      pattern: expect.objectContaining({ space: 'edge', edge: 'E0', x: expect.objectContaining({ count: 3 }) })
    });
    expect(folded.bodies).toHaveLength(3);
    expect(folded.cutouts).toHaveLength(3);
    expect(folded.bodies.map(body => body.workpieceId)).toEqual([result.workpieceId, result.workpieceId, result.workpieceId]);
  });

  it('binds hardware edge arrays from start, end, or center with two-sided X margins', async () => {
    const start = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'bolt',
      parameters: { diameter: '8' },
      pattern: {
        type: 'edgeArray',
        edge: 'E0',
        mode: 'spacing',
        spacing: '120'
      }
    });
    const startRelation = getCassetteV2WorkpieceRelations(start.tree)[0];
    const startTree = updateCassetteV2WorkpieceRelation(start.tree, startRelation.id, {
      targetSnap: 'start',
      offsetX: '40'
    });
    const centerTree = updateCassetteV2WorkpieceRelation(start.tree, startRelation.id, {
      targetSnap: 'center',
      offsetX: '40'
    });
    const endTree = updateCassetteV2WorkpieceRelation(start.tree, startRelation.id, {
      targetSnap: 'end',
      offsetX: '40'
    });

    const holeXs = async (tree) => (await createCassetteV2OccsDocument(tree)).definitions.workpieces[0].entities
      .filter(entity => entity.layer === 'cut.hole')
      .map(entity => Number(entity.geometry.center[0]));
    const foldedBodyXs = async (tree) => {
      const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
      return buildCassetteV2FoldedPreview(drawing.foldedPreview).bodies.map(body => Math.round(body.center[0]));
    };

    expect(await holeXs(startTree)).toEqual([40, 160, 280, 400]);
    expect(await holeXs(centerTree)).toEqual([70, 190, 310, 430]);
    expect(await holeXs(endTree)).toEqual([460, 340, 220, 100]);
    expect(await foldedBodyXs(centerTree)).toEqual([70, 190, 310, 430]);
  });

  it('stores hanger clips with selectable production modes', async () => {
    const sheetPart = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'sheetPart'
    });
    const castSolid = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'castSolid'
    });
    const sheetOccs = await createCassetteV2OccsDocument(sheetPart.tree);
    const solidOccs = await createCassetteV2OccsDocument(castSolid.tree);
    const convertedToSheet = updateCassetteV2Workpiece(castSolid.tree, castSolid.workpieceId, {
      family: 'hanger_clip',
      productionMode: 'sheetPart'
    });
    const convertedBackToSolid = updateCassetteV2Workpiece(convertedToSheet, castSolid.workpieceId, {
      family: 'hanger_clip',
      productionMode: 'castSolid'
    });

    expect(sheetPart.nodeId).toBe('face_2');
    expect(sheetOccs.definitions.workpieces.find(workpiece => workpiece.id === `${sheetPart.workpieceId}_def`)).toMatchObject({
      type: 'sheet',
      role: 'hanger_clip',
      hardware: { family: 'hanger_clip', productionMode: 'sheetPart' }
    });
    expect(solidOccs.definitions.workpieces.find(workpiece => workpiece.id === `${castSolid.workpieceId}_def`)).toMatchObject({
      type: 'solid',
      role: 'hanger_clip',
      solid: { kind: 'hanger_clip' },
      hardware: { family: 'hanger_clip', productionMode: 'castSolid' }
    });
    expect(convertedToSheet.nodes.find(node => node.workpieceId === castSolid.workpieceId)).toMatchObject({
      role: 'hook_flange'
    });
    expect(convertedBackToSolid.nodes.find(node => node.workpieceId === castSolid.workpieceId)).toBeUndefined();
  });

  it('renders integral-cut hanger clips as parent-face inner cut polygons', async () => {
    const result = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut',
      parameters: { width: '40', height: '24', hookDepth: '10' },
      pattern: {
        type: 'edgeArray',
        edge: 'E2',
        mode: 'count',
        count: '2',
        spacing: '160'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(result.tree)[0];
    const placedTree = updateCassetteV2WorkpieceRelation(result.tree, relation.id, {
      offsetX: '70',
      offsetY: '18'
    });
    const occs = await createCassetteV2OccsDocument(placedTree);
    const drawing = await renderCassetteV2TreeToDrawing(placedTree, { mode: 'assembly' });
    const folded = buildCassetteV2FoldedPreview(drawing.foldedPreview);
    const innerEntities = occs.definitions.workpieces[0].entities.filter(entity => entity.layer === 'cut.inner');

    expect(innerEntities).toHaveLength(2);
    expect(innerEntities.map(entity => entity.geometry.type)).toEqual(['polygon', 'polygon']);
    expect(occs.definitions.workpieces[0].faces[0].shape).toMatchObject({
      type: 'polygon',
      holes: expect.any(Array)
    });
    expect(occs.definitions.workpieces[0].faces[0].shape.holes).toHaveLength(2);
    expect(drawing.layers.find(layer => layer.standardCode === 'contour.cassette_face').paths[0]).toMatchObject({
      fillRule: 'evenodd'
    });
    expect(drawing.layers.find(layer => layer.standardCode === 'cut.inner').paths).toHaveLength(2);
    expect(drawing.foldedPreview.cutouts.filter(cutout => cutout.layer === 'cut.inner')).toHaveLength(2);
    expect(folded.faces[0].holes).toHaveLength(2);
    expect(folded.cutouts.filter(cutout => cutout.layer === 'cut.inner').map(cutout => cutout.points.length)).toEqual([9, 9]);
  });

  it('uses a selected profile template as hanger feature cut geometry', async () => {
    const result = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut'
    });
    const relation = getCassetteV2WorkpieceRelations(result.tree)[0];
    const profiled = updateCassetteV2Workpiece(result.tree, result.workpieceId, {
      profileTemplateId: 'profile_1',
      profileSnapshot: {
        kind: 'hanger',
        process: 'extruded',
        parameters: { L: '100' },
        sketch: {
          version: '0.2',
          units: 'mm',
          parameters: {},
          shapes: [{
            id: 's0',
            type: 'rect',
            op: 'add',
            center: [6, 4],
            width: 12,
            height: 8,
            rotation: 0,
            fillets: []
          }]
        }
      }
    });
    const placed = updateCassetteV2WorkpieceRelation(profiled, relation.id, {
      targetSnap: 'center',
      offsetX: '-6',
      offsetY: '10'
    });
    const occs = await createCassetteV2OccsDocument(placed);
    const add = occs.definitions.workpieces[0].entities.find(entity => entity.booleanOperation === 'add');
    // The wire keeps one polygon per entity; the axis law lands +X (the
    // material half) on the edge's inward normal: the 12mm material
    // depth runs into the face, the 8mm height along the edge.
    const ring = add.geometry.vertices.map(vertex => [Number(vertex[0]), Number(vertex[1])]);
    expect(xsOf(ring)).toEqual(expectCloseToBounds([242, 250]));
    expect(ysOf(ring)).toEqual(expectCloseToBounds([10, 22]));

    const mirrored = updateCassetteV2WorkpieceRelation(placed, relation.id, {
      mirrorY: true
    });
    const mirroredOccs = await createCassetteV2OccsDocument(mirrored);
    const mirroredAdd = mirroredOccs.definitions.workpieces[0].entities.find(entity => entity.booleanOperation === 'add');
    const mirroredRing = mirroredAdd.geometry.vertices.map(vertex => [Number(vertex[0]), Number(vertex[1])]);
    const mirroredXs = [...new Set(mirroredRing.map(vertex => Math.round(vertex[0])))].sort((a, b) => a - b);
    const mirroredYs = [...new Set(mirroredRing.map(vertex => Math.round(vertex[1])))].sort((a, b) => a - b);
    expect(mirroredXs).toEqual([250, 258]);
    expect(mirroredYs).toEqual([10, 22]);
  });

  it('dispatches edge-breaking integral cuts only through the modified parent contour', async () => {
    const result = addCassetteV2HardwareWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut',
      parameters: { width: '42', height: '28', hookDepth: '12' },
      pattern: {
        type: 'edgeArray',
        edge: 'E0',
        mode: 'count',
        count: '1'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(result.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(result.tree, relation.id, {
      targetSnap: 'start',
      offsetX: '250',
      offsetY: '0'
    });
    const occs = await createCassetteV2OccsDocument(tree);
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const contextDrawing = await renderCassetteV2TreeToDrawing(tree, {
      mode: 'assembly',
      contextWorkpieceId: 'wp_1'
    });
    const folded = buildCassetteV2FoldedPreview(drawing.foldedPreview);

    const cutOuter = drawing.layers.find(layer => layer.standardCode === 'cut.outer');
    const innerCut = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    const faceContour = drawing.layers.find(layer => layer.standardCode === 'contour.cassette_face');
    const contextCutOuter = contextDrawing.layers.find(layer => layer.standardCode === 'cut.outer');
    const contextFaceContour = contextDrawing.layers.find(layer => layer.standardCode === 'contour.cassette_face');
    const cutEntities = occs.definitions.workpieces[0].entities.filter(entity => entity.layer?.startsWith('cut.'));

    expect(cutOuter.paths).toHaveLength(1);
    expect(cutOuter.paths[0].d).toContain('257.349609375 -14');
    expect(faceContour.paths[0].fillRule).toBeUndefined();
    expect(contextCutOuter.paths).toHaveLength(1);
    expect(contextFaceContour.paths).toHaveLength(1);
    expect(contextCutOuter.paths[0].d).toBe(cutOuter.paths[0].d);
    expect(contextFaceContour.paths[0].d).toContain('257.349609375 -14');
    expect(innerCut).toBeUndefined();
    expect(cutEntities).toEqual([]);
    expect(folded.cutouts || []).toEqual([]);
  });

  it('ships the boolean result only — overlapping subtract operands merge into one inner cut', async () => {
    // Two overlapping subtract circles cut one merged hole: the
    // operand rings themselves never reach the cassette outputs
    // (owner law: production rides the region fold).
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: {
        version: '0.2', units: 'mm', parameters: {}, material: 'positive',
        shapes: [
          { id: 's0', type: 'circle', op: 'subtract', center: [100, 100], diameter: 30 },
          { id: 's1', type: 'circle', op: 'subtract', center: [115, 100], diameter: 30 },
          { id: 's2', type: 'rect', op: 'construction', center: [200, 100], width: 20, height: 20, rotation: 0, fillets: [] }
        ]
      }
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' },
      offsetX: '0', offsetY: '0'
    });

    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const occs = await createCassetteV2OccsDocument(tree);
    const innerCut = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(innerCut?.paths, 'the two overlapping operands ship as ONE merged result ring').toHaveLength(1);
    expect(innerCut.paths[0].relationId).toBe(relation.id);
    // The document's face shape carries the folded result; the
    // construction helper stays out of every output.
    const face = occs.definitions.workpieces[0].faces[0];
    expect(face.shape.holes).toHaveLength(1);
    const folded = buildCassetteV2FoldedPreview(drawing.foldedPreview);
    expect(folded.faces[0].holes).toHaveLength(1);
    expect(folded.cutouts.filter(cutout => cutout.layer === 'cut.inner')).toHaveLength(1);
  });

  it('butts profile array copies at zero spacing — pitch carries the copy extent', async () => {
    // A subtract circle d10 (extent 10 along the edge) arrayed with
    // spacing 0: adjacent anchors sit 10 apart, cuts touching —
    // never stacked on one point.
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: {
        version: '0.2', units: 'mm', parameters: {}, material: 'positive',
        shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [5, 0], diameter: 10 }]
      }
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      pattern: { type: 'edgeArray', edge: 'E0', mode: 'spacing', spacing: '0' },
      targetSnap: 'start', offsetX: '0', offsetY: '0'
    });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const inner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    const spans = (inner?.paths || []).map(path => {
      const pts = (path.d.match(/-?[\d.]+ -?[\d.]+/g) || []).map(s => s.split(' ').map(Number));
      const xs = pts.map(point => point[0]);
      return [Math.min(...xs), Math.max(...xs)];
    }).sort((left, right) => left[0] - right[0]);
    expect(spans.length).toBeGreaterThan(10);
    for (let index = 1; index < spans.length; index += 1) {
      const gap = spans[index][0] - spans[index - 1][1];
      expect(gap).toBeGreaterThanOrEqual(-0.05);
      expect(gap).toBeLessThan(0.5);
    }
    const pitch = spans[1][0] - spans[0][0];
    expect(pitch).toBeCloseTo(10, 0);
  });

  it('cuts the hole in straddling corner material on the inner-cut layer', async () => {
    // The template on E1 from its start snap centers the profile on
    // the corner; the hole lands in material hanging past the authored
    // face boundary and still carries its cut path — every result hole
    // cuts, whichever material it punches.
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: createDefaultOccsProfileSketch()
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      pattern: { type: 'edgeArray', edge: 'E1', mode: 'count', count: '1' },
      targetSnap: 'start', offsetX: '0', offsetY: '0'
    });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const inner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(inner?.paths || []).toHaveLength(1);
    // Authored placement is untouched: the straddling tab still grows
    // the contour outward.
    const outer = drawing.layers.find(layer => layer.standardCode === 'cut.outer');
    const pts = (outer.paths[0].d.match(/-?[\d.]+ -?[\d.]+/g) || []).map(s => s.split(' ').map(Number));
    const ys = pts.map(point => -point[1]);
    expect(Math.min(...ys)).toBeLessThan(0);
  });

  it('ships the hole in an authored tab as an inner cut and as its operand', async () => {
    // An add rect hanging past the edge with a subtract circle inside
    // the tab: the fold holes the tab, the result ring rides cut.inner,
    // and the document ships the subtract operand.
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      sketch: normalizeOccsProfileSketch({
        version: '0.2', units: 'mm', parameters: {}, material: 'positive',
        shapes: [
          { id: 's0', type: 'rect', op: 'add', center: [-5, 40], width: 42, height: 28, rotation: 0, fillets: [] },
          { id: 's1', type: 'circle', op: 'subtract', center: [-12, 40], diameter: 8 }
        ]
      })
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)[0];
    const tree = updateCassetteV2WorkpieceRelation(added.tree, relation.id, {
      pattern: { type: 'edgeArray', edge: 'E0', mode: 'count', count: '1' },
      targetSnap: 'center', offsetX: '0', offsetY: '0'
    });
    const drawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'assembly' });
    const occs = await createCassetteV2OccsDocument(tree);
    const folded = buildCassetteV2FoldedPreview(drawing.foldedPreview);
    const inner = drawing.layers.find(layer => layer.standardCode === 'cut.inner');
    expect(inner?.paths).toHaveLength(1);
    expect(inner.paths[0].relationId).toBe(relation.id);
    expect(occs.definitions.workpieces[0].faces[0].shape.holes).toHaveLength(1);
    const operands = occs.definitions.workpieces[0].entities.filter(entity => entity.booleanOperation === 'subtract');
    expect(operands).toHaveLength(1);
    expect(folded.cutouts.filter(cutout => cutout.layer === 'cut.inner')).toHaveLength(1);
  });

  it('keeps face labels and dimension controls on the original boundary for integral cuts', async () => {
    const cleanTree = createCassetteV2GraphTree();
    const cleanDrawing = await renderCassetteV2TreeToDrawing(cleanTree, { mode: 'assembly' });
    const cleanFace = cleanDrawing.designerFaces.find(face => face.nodeId === 'face_1');

    const clipped = addCassetteV2HardwareWorkpiece(cleanTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut',
      parameters: { width: '42', height: '28', hookDepth: '12' },
      pattern: {
        type: 'edgeArray',
        edge: 'E0',
        mode: 'count',
        count: '1'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(clipped.tree)[0];
    const clippedTree = updateCassetteV2WorkpieceRelation(clipped.tree, relation.id, {
      offsetX: '250',
      offsetY: '0'
    });
    const clippedDrawing = await renderCassetteV2TreeToDrawing(clippedTree, { mode: 'assembly' });
    const clippedFace = clippedDrawing.designerFaces.find(face => face.nodeId === 'face_1');

    expect(cleanFace).toBeDefined();
    expect(clippedFace).toBeDefined();
    expect(clippedFace.label).toBe(cleanFace.label);
    expect(clippedFace.center).toMatchObject(cleanFace.center);
    expect(clippedFace.dimensionControls).toEqual(cleanFace.dimensionControls);
  });

  it('keeps edge hover and add-face button anchors on the original boundary for integral cuts', async () => {
    const cleanTree = createCassetteV2GraphTree();
    const cleanDrawing = await renderCassetteV2TreeToDrawing(cleanTree, { mode: 'assembly' });
    const cleanEdges = (cleanDrawing.designerEdges || [])
      .filter(edge => edge.nodeId === 'face_1')
      .map(({ edgeIndex, x1, y1, x2, y2, midX, midY, length, label }) => ({
        edgeIndex,
        x1,
        y1,
        x2,
        y2,
        midX,
        midY,
        length,
        label
      }));

    const clipped = addCassetteV2HardwareWorkpiece(cleanTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut',
      parameters: { width: '42', height: '28', hookDepth: '12' },
      pattern: {
        type: 'edgeArray',
        edge: 'E2',
        mode: 'count',
        count: '1',
        spacing: '0'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(clipped.tree)[0];
    const clippedTree = updateCassetteV2WorkpieceRelation(clipped.tree, relation.id, {
      offsetX: '70',
      offsetY: '8'
    });
    const clippedDrawing = await renderCassetteV2TreeToDrawing(clippedTree, { mode: 'assembly' });
    const clippedEdges = (clippedDrawing.designerEdges || [])
      .filter(edge => edge.nodeId === 'face_1')
      .map(({ edgeIndex, x1, y1, x2, y2, midX, midY, length, label }) => ({
        edgeIndex,
        x1,
        y1,
        x2,
        y2,
        midX,
        midY,
        length,
        label
      }));

    expect(clippedEdges).toEqual(cleanEdges);
  });

  it('keeps fold-route indices on the original boundary after integral cut booleans', async () => {
    const cleanChild = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 2);
    const cleanDrawing = await renderCassetteV2TreeToDrawing(cleanChild.tree, { mode: 'assembly' });
    const cleanFoldEdges = (cleanDrawing.designerFoldEdges || [])
      .map(({ nodeId, edgeIndex, x1, y1, x2, y2, foldNodeId, label }) => ({
        nodeId,
        edgeIndex,
        x1,
        y1,
        x2,
        y2,
        foldNodeId,
        label
      }));

    const clipped = addCassetteV2HardwareWorkpiece(cleanChild.tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      family: 'hanger_clip',
      productionMode: 'integralCut',
      parameters: { width: '42', height: '28', hookDepth: '12' },
      pattern: {
        type: 'edgeArray',
        edge: 'E2',
        mode: 'count',
        count: '1',
        spacing: '0'
      }
    });
    const relation = getCassetteV2WorkpieceRelations(clipped.tree)[0];
    const clippedTree = updateCassetteV2WorkpieceRelation(clipped.tree, relation.id, {
      offsetX: '70',
      offsetY: '8'
    });
    const clippedDrawing = await renderCassetteV2TreeToDrawing(clippedTree, { mode: 'assembly' });
    const clippedFoldEdges = (clippedDrawing.designerFoldEdges || [])
      .map(({ nodeId, edgeIndex, x1, y1, x2, y2, foldNodeId, label }) => ({
        nodeId,
        edgeIndex,
        x1,
        y1,
        x2,
        y2,
        foldNodeId,
        label
      }));

    expect(clippedFoldEdges).toEqual(cleanFoldEdges);
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
      referenceNodeId: first.nodeId
    });
    tree = second.tree;
    const occs = await createCassetteV2OccsDocument(tree);
    const relations = getCassetteV2WorkpieceRelations(tree);
    const topology = buildCassetteV2WorkpieceTopology(tree);
    const selectedDrawing = await renderCassetteV2TreeToDrawing(tree, { mode: 'workpiece', workpieceId: 'wp_2' });
    const assemblyCurves = await buildCassetteV2TreeCurves(tree, { mode: 'assembly' });

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
    expect(selectedDrawing.foldedPreview.faces.map(face => face.nodeId)).toEqual([first.nodeId]);
    expect(assemblyCurves.find(curve => curve.node.id === first.nodeId).vertices[0]).toEqual([510, 405, 0]);
  });

  it('stores multiple declared attachments for one workpiece and uses only one placement driver', async () => {
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
      targetFaceId: first.nodeId,
      sourceFaceId: second.nodeId
    });
    const extraRelation = getCassetteV2WorkpieceRelations(addedAttachment.tree)
      .find(relation => relation.id === addedAttachment.relationId);
    const promoted = updateCassetteV2WorkpieceRelation(addedAttachment.tree, addedAttachment.relationId, {
      driver: true,
      targetSnap: 'origin'
    });
    const relations = getCassetteV2WorkpieceRelations(promoted).filter(relation => relation.sourceWorkpieceId === 'wp_3');
    const occs = await createCassetteV2OccsDocument(promoted);
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
      face: first.nodeId
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
      targetFaceId: first.nodeId,
      sourceFaceId: second.nodeId
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
    }))).toEqual(expect.arrayContaining([
      { workpieceId: 'wp_1', opacity: 0.28 },
      { workpieceId: 'wp_2', opacity: 0.28 },
      { workpieceId: 'wp_3', opacity: 1 }
    ]));
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

  it('deletes only a non-root workpiece and its incident attachment edges', async () => {
    const first = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const second = addCassetteV2Workpiece(first.tree, {
      referenceWorkpieceId: 'wp_2',
      referenceNodeId: first.nodeId
    });
    const result = deleteCassetteV2Workpiece(second.tree, 'wp_2');
    const rootDelete = deleteCassetteV2Workpiece(result.tree, 'wp_1');
    const occs = await createCassetteV2OccsDocument(result.tree);

    expect(result.deletedWorkpieceIds).toEqual(['wp_2']);
    expect(result.selectedWorkpieceId).toBe('wp_1');
    expect(result.tree.workpieces.map(workpiece => workpiece.id)).toEqual(['wp_1', 'wp_3']);
    expect(result.tree.nodes.map(node => node.id)).toEqual(['face_1', second.nodeId]);
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
      '1_2_Развертка кассеты_Лицо+подгибы'
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
      null,
      'code.cassette_mark'
    ]);
    expect(drawing.layers[0].paths).toHaveLength(2);
    expect(drawing.layers[1].paths).toHaveLength(1);
    expect(drawing.layers[2].paths).toEqual([{
      d: 'M 100 -40 L 0 -40',
      fill: 'none',
      stroke: 'layer'
    }]);
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette').paths).toEqual([]);
    expect(drawing.dimensionAnnotations.map(annotation => annotation.text)).toEqual(['A', 'B', 'R']);
    expect(drawing.designerFaces.map(face => face.nodeId)).toEqual(['face_1', 'face_2']);
    expect(drawing.designerFoldEdges).toEqual(expect.arrayContaining([expect.objectContaining({
      nodeId: 'face_1',
      edgeIndex: 2,
      foldNodeId: 'face_2',
      angle: '90',
      label: '90'
    })]));
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('builds the live tree drawing from separately evaluated face boundaries', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    tree.nodes[1].foldAngle = '135';
    const occs = await createCassetteV2OccsDocument(tree);
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
      null,
      'code.cassette_mark'
    ]);
    expect(drawing.layers[0].paths).toHaveLength(2);
    expect(drawing.layers[1].paths).toHaveLength(1);
    expect(drawing.layers[2].paths).toHaveLength(1);
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette').paths).toEqual([]);
    expect(drawing.dimensionAnnotations.map(annotation => annotation.text)).toEqual(['A', 'B', 'R']);
    expect(occs.definitions.workpieces[0].folds[0].angle).toBe('135');
    expect(occs.definitions.workpieces[0].entities.map(entity => entity.layer)).toContain('dimension.cassette');
    expect(drawing.designerFaces.map(face => face.nodeId)).toEqual(['face_1', 'face_2']);
    expect(drawing.designerFoldEdges).toEqual(expect.arrayContaining([expect.objectContaining({
      nodeId: 'face_1',
      edgeIndex: 2,
      foldNodeId: 'face_2',
      angle: '135',
      label: '135'
    })]));
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('preserves child attachment edge index in OCCS and folded preview payload', async () => {
    const initialTree = createCassetteV2GraphTree();
    const { tree } = addCassetteV2GraphChild(initialTree, 'face_1', 2);
    tree.nodes[1].attachEdge = 'E2';
    const occs = await createCassetteV2OccsDocument(tree);
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
    const curves = await buildCassetteV2TreeCurves(tree);
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
      null,
      'code.cassette_mark'
    ]);
    expect(drawing.foldedPreview.faces).toHaveLength(2);
    expect(drawing.designerFaces.map(face => face.workpieceId)).toEqual(['wp_1', 'wp_1']);
    expect(drawing.designerSections.handles.map(handle => handle.orientation)).toEqual(['vertical', 'horizontal']);
    expect(drawing.designerSections.segments.map(segment => segment.orientation)).toEqual(expect.arrayContaining(['vertical', 'horizontal']));
    expect(drawing.layers.find(layer => layer.name === 'designer.section').paths
      .every(path => path.sectionKind)).toBe(true);
    expect(drawing.layers.find(layer => layer.standardCode === 'code.cassette_mark').paths
      .every(path => path.kind === 'text')).toBe(true);
    expect(drawing.designerEdges.map(edge => edge.label)).toEqual(['+', '+', '+', '+', '+', '+']);
  });

  it('adds cassette mark entities and drawing text for each sheet workpiece', async () => {
    const added = addCassetteV2Workpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1'
    });
    const context = { templateName: 'Tray A', templateId: 'tpl_123' };
    const occs = await createCassetteV2OccsDocument(added.tree, context);
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

    expect(dimensionLayer.paths).toEqual([]);
    expect(drawing.dimensionAnnotations.map(annotation => annotation.text)).toEqual(['A', 'B']);
  });

  it('keeps the dimension layer in the assembly context', async () => {
    const tree = createCassetteV2GraphTree();
    const drawing = await renderCassetteV2TreeToDrawing(tree, {
      mode: 'assembly',
      contextWorkpieceId: tree.rootId
    });
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette')).toBeTruthy();
    const assembly = cassetteV2AssemblyEntitiesFromDrawing(drawing);
    expect(assembly.entities.filter(entity => entity.type === 'dim')).not.toHaveLength(0);
  });

  it('resolves a face sketch through the ordered boolean fold', async () => {
    const region = await resolveCassetteV2FaceSketchRegion({
      parameters: { W: 120, H: 80, D: 20 },
      shapes: [
        { id: 'outline', type: 'rect', op: 'add', center: ['W/2', 'H/2'], width: 'W', height: 'H' },
        { id: 'hole', type: 'circle', op: 'subtract', center: ['W/2', 'H/2'], diameter: 'D' }
      ]
    });

    expect(region.outer.slice(0, -1)).toHaveLength(4);
    expect(region.holes).toHaveLength(1);
  });

  it('cuts the parent with the sketch face material and keeps subtracts on the child', async () => {
    const grown = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 0, { edgeLength: 500 });
    grown.tree.nodes[1].parameters.defaultLength = '100';
    grown.tree.nodes[1].parameters.height = '100';
    const clean = await renderCassetteV2TreeToDrawing(grown.tree);
    const sketch = {
      version: '0.2',
      units: 'mm',
      parameters: {},
      material: 'positive',
      shapes: [
        { id: 's0', type: 'rect', op: 'add', center: [50, 0], width: 100, height: 100, rotation: 0, fillets: [] },
        { id: 's1', type: 'circle', op: 'subtract', center: [50, 25], diameter: 20 }
      ]
    };
    const converted = updateCassetteV2FaceSketch(grown.tree, grown.nodeId, sketch);
    const drawing = await renderCassetteV2TreeToDrawing(converted);
    const parent = drawing.designerFaces.find(face => face.nodeId === 'face_1');
    const child = drawing.designerFaces.find(face => face.nodeId === grown.nodeId);

    expect((drawing.dimensionAnnotations || []).some(annotation => annotation.nodeId === grown.nodeId)).toBe(false);
    const selected = await renderCassetteV2TreeToDrawing(converted, {
      mode: 'assembly',
      selectedFaceId: grown.nodeId
    });
    expect(selected.dimensionAnnotations
      .filter(annotation => annotation.nodeId === grown.nodeId && annotation.dimensionKind === 'inner')
      .map(annotation => annotation.fieldKey)).toEqual(expect.arrayContaining(['width', 'height']));
    expect(parent.d).not.toBe(clean.designerFaces.find(face => face.nodeId === 'face_1').d);
    expect(child.d).not.toBe(clean.designerFaces.find(face => face.nodeId === grown.nodeId).d);
    expect(drawing.foldedPreview.faces.find(face => face.nodeId === grown.nodeId).holes).toHaveLength(1);
    expect(drawing.designerFoldEdges).toEqual(clean.designerFoldEdges);
    expect(drawing.layers.find(layer => layer.standardCode === 'cut.inner')?.paths).toHaveLength(1);
    const childCurve = (await buildCassetteV2TreeCurves(converted))
      .find(curve => curve.node.id === grown.nodeId);
    expect(Math.min(...childCurve.localVertices.map(point => Number(point[1])))).toBeGreaterThanOrEqual(-0.001);
    const foldRoute = drawing.layers.find(layer => layer.standardCode === 'fold.route');
    expect(foldRoute.paths).toHaveLength(1);

    const assembly = await renderCassetteV2TreeToDrawing(converted, {
      mode: 'assembly',
      contextWorkpieceId: 'wp_1'
    });
    const faceLayer = assembly.layers.find(layer => layer.standardCode === 'contour.cassette_face');
    expect(faceLayer.paths.some(path => path.fillRule === 'evenodd')).toBe(true);
  });

  it('places a face over a closed profile footprint', () => {
    const cutSketch = normalizeOccsProfileSketch({
      parameters: {},
      shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [0, 0], diameter: 100 }]
    });
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Edge cut',
      occsProfile: occsProfileFromSketch(cutSketch),
      sketch: cutSketch
    });
    const placed = addCassetteV2GraphChild(added.tree, 'face_1', 0, {
      edgeLength: 500,
      shardStart: 200,
      shardEnd: 300
    });

    expect(placed.refused).toBeUndefined();
    expect(placed.nodeId).not.toBe('');
    expect(placed.tree.nodes.find(node => node.id === placed.nodeId).parameters).toMatchObject({
      edgeStart: '200',
      defaultLength: '100'
    });
  });

  it('cuts the parent with a face subtract shape outside the child material', async () => {
    const grown = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 0, { edgeLength: 500 });
    grown.tree.nodes[1].parameters.defaultLength = '100';
    grown.tree.nodes[1].parameters.height = '100';
    const clean = await renderCassetteV2TreeToDrawing(grown.tree);
    const sketch = {
      version: '0.2',
      units: 'mm',
      parameters: {},
      material: 'positive',
      shapes: [
        { id: 's0', type: 'rect', op: 'add', center: [50, 25], width: 100, height: 50, rotation: 0, fillets: [] },
        { id: 's1', type: 'circle', op: 'subtract', center: [50, -40], diameter: 40 }
      ]
    };
    const converted = updateCassetteV2FaceSketch(grown.tree, grown.nodeId, sketch);
    const drawing = await renderCassetteV2TreeToDrawing(converted);
    const parent = drawing.designerFaces.find(face => face.nodeId === 'face_1');
    const childHoles = drawing.foldedPreview.faces.find(face => face.nodeId === grown.nodeId).holes;
    const parentHoles = drawing.foldedPreview.faces.find(face => face.nodeId === 'face_1').holes;

    expect(parent.d).not.toBe(clean.designerFaces.find(face => face.nodeId === 'face_1').d);
    expect(childHoles).toHaveLength(0);
    expect(parentHoles).toHaveLength(1);
    expect(drawing.layers.find(layer => layer.standardCode === 'cut.inner')?.paths).toHaveLength(1);
  });

  it('stores a face sketch on the node and emits an OCCS polygon with the authored sketch extension', async () => {
    const sketch = {
      version: '0.2',
      units: 'mm',
      parameters: { W: 'A', H: 60 },
      shapes: [{
        id: 'outline',
        type: 'rect',
        op: 'add',
        center: ['W/2', 'H/2'],
        width: 'W',
        height: 'H'
      }]
    };
    const updated = updateCassetteV2FaceSketch(createCassetteV2GraphTree(), 'face_1', sketch);
    const curves = await buildCassetteV2TreeCurves(updated);
    const occs = await createCassetteV2OccsDocument(updated);
    const face = occs.definitions.workpieces[0].faces[0];

    expect(updated.nodes[0].sketch).toMatchObject({ parameters: { W: 'A', H: 60 } });
    expect(curves[0].boundaryVertices).toHaveLength(4);
    expect(face.shape.type).toBe('polygon');
    expect(face.extensions.perigram.sketch).toMatchObject({ parameters: { W: 'A', H: 60 } });
    expect(updateCassetteV2FaceSketch(updated, 'face_1', null).nodes[0].sketch).toBeUndefined();
  });

  it('places every open profile across the whole edge beside an earlier profile', () => {
    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const first = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const second = addCassetteV2ProfileWorkpiece(first.tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const secondRelation = getCassetteV2WorkpieceRelations(second.tree)
      .find(relation => relation.sourceWorkpieceId === second.workpieceId);

    expect(second.workpieceId).not.toBe('');
    expect(secondRelation.pattern).not.toHaveProperty('spanStart');
    expect(secondRelation.pattern).not.toHaveProperty('spanWidth');
  });

  it('places an open profile across the whole edge beside a face shard', () => {
    const grown = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 0, { edgeLength: 400 });
    grown.tree.nodes[1].parameters.edgeStart = '10';
    grown.tree.nodes[1].parameters.defaultLength = '90';
    const open = openChainSketch([[0, 0], [10, 10], [20, 0]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(grown.tree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      occsProfile: occsProfileFromSketch(open),
      sketch: open
    });
    const relation = getCassetteV2WorkpieceRelations(added.tree)
      .find(item => item.sourceWorkpieceId === added.workpieceId);

    expect(added.refused).toBeUndefined();
    expect(relation.pattern).not.toHaveProperty('spanStart');
    expect(relation.pattern).not.toHaveProperty('spanWidth');
  });

  it('leaves the edge shards free of a closed profile footprint', async () => {
    const sketch = normalizeOccsProfileSketch({
      parameters: {},
      shapes: [{ id: 's0', type: 'circle', op: 'subtract', center: [0, 0], diameter: 100 }]
    });
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const drawing = await renderCassetteV2TreeToDrawing(added.tree);
    const shards = drawing.designerEdges
      .filter(edge => edge.nodeId === 'face_1' && edge.edgeIndex === 0)
      .map(edge => [edge.shardStart, edge.shardEnd]);

    expect(shards).toEqual([[0, 500]]);
  });

  it('draws a + handle on each free edge shard', async () => {
    const first = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 1, { edgeLength: 400 });
    first.tree.nodes[1].parameters.defaultLength = '150';
    const drawing = await renderCassetteV2TreeToDrawing(first.tree);
    const handle = drawing.designerEdges.find(edge => edge.nodeId === 'face_1' && edge.edgeIndex === 1);

    expect(handle).toMatchObject({
      edgeLength: 400,
      shardStart: 150,
      shardEnd: 400,
      label: '+'
    });
  });

  it('allocates child faces to free shards of the host edge', async () => {
    const first = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 2, { edgeLength: 400 });
    first.tree.nodes[1].parameters.defaultLength = '150';
    const second = addCassetteV2GraphChild(first.tree, 'face_1', 2, { edgeLength: 400 });
    const third = addCassetteV2GraphChild(second.tree, 'face_1', 2, { edgeLength: 400 });
    const child = second.tree.nodes.find(node => node.id === second.nodeId);
    const curves = await buildCassetteV2TreeCurves(second.tree);
    const childCurve = curves.find(curve => curve.node.id === second.nodeId);

    expect(child.parameters).toMatchObject({
      edgeStart: '150',
      defaultLength: '250'
    });
    expect(childCurve.localVertices[0][0]).toBeCloseTo(0);
    expect(childCurve.localVertices[1][0]).toBeCloseTo(250);
    expect(childCurve.vertices[0][0]).toBeCloseTo(150);
    expect(childCurve.vertices[1][0]).toBeCloseTo(400);
    expect(third.refused).toBe('edge-full');
  });

  it('places a converted sketch face on its allocated edge shard', async () => {
    const first = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 2, { edgeLength: 400 });
    first.tree.nodes[1].parameters.defaultLength = '150';
    const second = addCassetteV2GraphChild(first.tree, 'face_1', 2, { edgeLength: 400 });
    const sketch = await cassetteV2FaceSketchFromNode(second.tree, second.nodeId);
    const converted = updateCassetteV2FaceSketch(second.tree, second.nodeId, sketch);
    const curve = (await buildCassetteV2TreeCurves(converted)).find(item => item.node.id === second.nodeId);

    const xs = curve.vertices.map(point => point[0]);
    expect(Math.min(...xs)).toBeCloseTo(150);
    expect(Math.max(...xs)).toBeCloseTo(400);
  });

  it('gives the face editor the parent face in shard coordinates', async () => {
    const grown = addCassetteV2GraphChild(createCassetteV2GraphTree(), 'face_1', 0, { edgeLength: 500 });
    grown.tree.nodes[1].parameters.edgeStart = '100';
    grown.tree.nodes[1].parameters.defaultLength = '100';
    const context = await cassetteV2FaceSketchContext(grown.tree, grown.nodeId);

    expect(context.basisStart).toBeCloseTo(-100);
    expect(context.basisEnd).toBeCloseTo(400);
    expect(context.parentFace).toHaveLength(4);
    expect(context.sketch.shapes).toHaveLength(1);
  });

  it('seeds a face sketch from the current rectangle with its authored expressions', async () => {
    const sketch = await cassetteV2FaceSketchFromNode(createCassetteV2GraphTree(), 'face_1');

    expect(sketch.shapes).toHaveLength(1);
    expect(sketch.shapes[0]).toMatchObject({
      type: 'rect',
      op: 'add',
      width: 'A',
      height: 'B'
    });
  });

  it('keeps the instance table apart for a subtract-only shape set', async () => {
    const sketch = {
      parameters: { W: 40 },
      shapes: [{
        id: 'hole',
        type: 'circle',
        op: 'subtract',
        center: [250, 200],
        diameter: 'W'
      }]
    };
    const authored = updateCassetteV2FaceSketch(createCassetteV2GraphTree(), 'face_1', sketch);
    const placed = updateCassetteV2FaceInstance(authored, 'face_1', { W: 80 });
    const face = normalizeCassetteV2Face(placed.nodes[0], {});
    const curve = (await buildCassetteV2TreeCurves(placed)).find(item => item.node.id === 'face_1');

    expect(face.sketch.parameters).toMatchObject({ W: 40 });
    expect(face.instance).toEqual({ W: 80 });
    expect(face.parameters.W).toBe(80);
    // A set with no add leaves the face at zero geometry.
    expect(curve.zeroGeometry).toBe(true);
    expect(curve.boundaryVertices).toHaveLength(0);

    const cleared = updateCassetteV2FaceSketch(placed, 'face_1', null).nodes[0];
    expect(cleared.sketch).toBeUndefined();
    expect(cleared.instance).toBeUndefined();
  });

  it('normalizes a trapezoid face without the profile template fallback', () => {
    const face = normalizeCassetteV2Face(createCassetteV2GraphTree().nodes[0], {});

    expect(face.sketch.shapes).toEqual([]);
    expect(face.sketch.parameters).toEqual({});
  });

  it('resolves a subtract-only shape set to zero geometry with its parent cut intact', async () => {
    const region = await resolveCassetteV2FaceSketchRegion({
      parameters: { W: 40 },
      shapes: [{ id: 'hole', type: 'circle', op: 'subtract', center: [250, 200], diameter: 'W' }]
    }, {});

    expect(region.outer).toBe(null);
    expect(region.polygons).toHaveLength(0);
  });

  it('lets add shapes author the face', async () => {
    const region = await resolveCassetteV2FaceSketchRegion({
      parameters: {},
      shapes: [{ id: 'outline', type: 'rect', op: 'add', center: [50, 50], width: 100, height: 100 }]
    }, {});
    const xs = region.outer.map(point => Number(point[0]));

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100);
  });

  it('keeps scope-named rows in the cassette table and rebinds face instance rows on rename', () => {
    const sketch = {
      parameters: { W: 'A' },
      shapes: [{ id: 'outline', type: 'rect', op: 'add', center: ['W/2', 0], width: 'W', height: 20 }]
    };
    const grown = updateCassetteV2FaceSketch(createCassetteV2GraphTree(), 'face_1', sketch);
    const scoped = {
      ...grown,
      parameters: { ...grown.parameters, A: 500 }
    };
    const placed = updateCassetteV2FaceInstance(scoped, 'face_1', { W: 'A/2', A: 999 });
    const face = normalizeCassetteV2Face(placed.nodes[0], scoped.parameters);

    expect(face.instance).toEqual({ W: 'A/2' });

    const renamed = renameCassetteV2TreeParameter(placed, 'A', 'LENGTH');
    const node = renamed.nodes.find(item => item.id === 'face_1');
    expect(node.sketch.parameters.W).toBe('LENGTH');
    expect(node.sketch.shapes[0].width).toBe('W');
    expect(node.instance).toEqual({ W: 'LENGTH/2' });
  });
});
