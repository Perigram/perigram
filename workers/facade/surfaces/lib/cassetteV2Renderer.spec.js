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
  buildCassetteV2TrapezoidTreeCurves,
  buildCassetteV2WorkpieceTopology,
  cassetteV2AttachableProfileEdgesForTree,
  cassetteV2LayerPanelRows,
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
  normalizeCassetteV2Profile,
  renameCassetteV2TreeParameter,
  normalizeCassetteV2Trapezoid,
  profileTerminalEdgesForTree,
  renderCassetteV2ToDrawing,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  resolveCassetteV2Expression,
  setGraphNumberInput,
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
          parameters: { W: '40', H: '24', R: '2', D: '5', L: '100' }
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

  it('embeds an open profile into the face boundary and terminates its edge', async () => {
    const initialTree = createCassetteV2GraphTree();
    const square = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const result = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      kind: 'hanger',
      process: 'extruded',
      parameters: square.parameters,
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
    // ...and the profile-arranged edge is terminal — no + affordance.
    expect(profileTerminalEdgesForTree(arranged).has('face_1:2')).toBe(true);
    const edgeIndexes = drawing.designerEdges
      .filter(edge => edge.nodeId === 'face_1')
      .map(edge => edge.edgeIndex);
    expect(edgeIndexes).toEqual([0, 1, 3]);
  });

  it('offers only arrangeable edges: folds and profile-arranged edges are excluded', () => {
    // A face grown on E0 folds there; a profile arranged on E2 consumes
    // it. Only E1 and E3 may carry a profile.
    const initialTree = createCassetteV2GraphTree();
    const grown = addCassetteV2GraphChild(initialTree, 'face_1', 0).tree;
    expect(cassetteV2AttachableProfileEdgesForTree(grown, 'face_1')).toEqual(['E1', 'E2', 'E3']);

    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      parameters: open.parameters,
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
    expect(cassetteV2AttachableProfileEdgesForTree(arranged, 'face_1')).toEqual(['E1', 'E3']);
    // The asking relation's own edge stays listed — its value must remain
    // in its own chooser.
    expect(cassetteV2AttachableProfileEdgesForTree(arranged, 'face_1', relation.id)).toEqual(['E1', 'E2', 'E3']);
    // The fold eats an edge on both faces (the existing folded-edge law):
    // the child's attach edge is not arrangeable either.
    expect(cassetteV2AttachableProfileEdgesForTree(arranged, 'face_2')).toEqual(['E1', 'E2', 'E3']);
  });

  it('refuses a profile arranged on a fold edge instead of embedding or cutting', async () => {
    const initialTree = createCassetteV2GraphTree();
    const grown = addCassetteV2GraphChild(initialTree, 'face_1', 0).tree;
    const cleanFace = (await renderCassetteV2TreeToDrawing(grown, { mode: 'assembly' }))
      .designerFaces.find(face => face.nodeId === 'face_1');

    const open = openChainSketch([[0, 0], [42, 0], [42, 28], [0, 28]], createDefaultOccsProfileSketch().parameters);
    const added = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Open strip',
      parameters: open.parameters,
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

    // A closed section arranged on the fold is refused the same way —
    // no cut entity lands on the fold line.
    const closed = addCassetteV2ProfileWorkpiece(grown, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger cut',
      sketch: createDefaultOccsProfileSketch()
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
    expect(cutDrawing.profileEmbeddingErrors).toEqual([
      { relationId: expect.any(String), reason: 'fold-edge' }
    ]);
    const cutInner = cutDrawing.layers.find(layer => layer.name === 'cut.inner');
    expect(cutInner?.paths.length || 0).toBe(0);
  });

  it('applies the profile steps grouped — the production fold ignores shape order', async () => {
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
        name: 'Grouped steps',
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
    const holeArea = async (shapes) => {
      const drawing = await renderCassetteV2TreeToDrawing(build(shapes), {});
      const face = drawing.designerFaces.map(item => item.d).join(' ');
      const rings = face.split('M')
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
        });
      return Math.min(...rings);
    };
    // The cut always wins inside the hole ring, whatever order the
    // shapes were drawn in.
    const first = await holeArea([tab, hole, patch]);
    const second = await holeArea([patch, hole, tab]);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
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
    expect(cleared.arraySpacing).toBe('');
    expect(cleared.arrayEdge).toBe('E1');
    const zeroed = updateCassetteV2WorkpieceRelation(edited, relation.id, { arraySpacing: '0' });
    expect(getCassetteV2WorkpieceRelations(zeroed)[0].arraySpacing).toBe('0');
    expect(getCassetteV2WorkpieceRelations(zeroed)[0].arrayCount).toBe('1');
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
        parameters: sketch.parameters,
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

  it('treats a closed profile edge array as terminal and cuts every copy', async () => {    const initialTree = createCassetteV2GraphTree();
    const square = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(initialTree, {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      kind: 'hanger',
      process: 'extruded',
      parameters: square.parameters,
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
    expect(drawing.designerEdges.filter(edge => edge.nodeId === 'face_1').map(edge => edge.edgeIndex))
      .toEqual([0, 1, 3]);
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
      parameters: square.parameters,
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
    // supplies both the geometry and its table. The workpiece's own
    // table carries it, because that is the table the row renders a
    // chip per bound key from.
    const attached = workpieceOf(added.tree);
    expect(attached.parameters).toEqual({ W: 42, H: 28, R: 3, D: 6, L: 120 });

    // Editing the chip re-evaluates: a larger R grows the corner arcs.
    const edited = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      parameters: { ...attached.parameters, R: 12 }
    });
    const radius = (tree) => sectionShapeVertices(workpieceOf(tree).profileSnapshot.section).length;
    expect(radius(edited)).toBeGreaterThan(radius(added.tree));
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
      parameters: sketch.parameters,
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const before = getCassetteV2Workpieces(added.tree).find(item => item.id === added.workpieceId);
    const rectVerticesOf = (workpiece) => sectionShapeVertices(workpiece.profileSnapshot.section, 'chain')
      .map(vertex => vertex.map(String));
    expect(rectVerticesOf(before)).toEqual([['0', '0'], ['42', '0'], ['42', '28'], ['0', '28']]);

    const instantiated = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      parameters: { ...sketch.parameters, W: 84, H: 'W/3' }
    });
    const instance = getCassetteV2Workpieces(instantiated).find(item => item.id === added.workpieceId);
    expect(rectVerticesOf(instance)).toEqual([['0', '0'], ['84', '0'], ['84', '28'], ['0', '28']]);
    expect(instance.profileSnapshot.parameters).toMatchObject({ W: 84, H: 'W/3' });

    // A transient invalid parameter keeps the last good section.
    const broken = updateCassetteV2Workpiece(instantiated, added.workpieceId, {
      parameters: { ...sketch.parameters, W: 84, H: 'W/' }
    });
    const held = getCassetteV2Workpieces(broken).find(item => item.id === added.workpieceId);
    expect(rectVerticesOf(held)).toEqual([['0', '0'], ['84', '0'], ['84', '28'], ['0', '28']]);
  });

  it('shadows a profile-local parameter over a same-named global', () => {
    // The tree carries R=35; the hanger template's own table carries R=3.
    // A chip expression reading R gets the LOCAL one — inner shadows
    // outer, never the other way around.
    const sketch = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      parameters: sketch.parameters,
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      parameters: { ...sketch.parameters, W: 'R*2' }
    });
    const workpiece = getCassetteV2Workpieces(driven).find(item => item.id === added.workpieceId);
    // The corner fillets resolve to arc points; bounds carry the law —
    // the local R (3) drove W, never the tree's global R (35).
    const vertices = sectionShapeVertices(workpiece.profileSnapshot.section).map(vertex => vertex.map(Number));
    expect(Math.max(...vertices.map(vertex => vertex[0]))).toBeCloseTo(6, 5);
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
      parameters: open.parameters,
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
      parameters: { ...open.parameters, W: 'A/2' }
    });

    const renamed = renameCassetteV2TreeParameter(instance, 'A', 'LENGTH');
    expect(Object.keys(renamed.parameters)).toEqual(['LENGTH', 'B', 'R']);
    // The face's dimension and the child's fold angle rebind (deg suffix
    // survives).
    expect(renamed.nodes.find(node => node.id === 'face_1').parameters.defaultLength).toBe('LENGTH');
    expect(renamed.nodes.find(node => node.id !== 'face_1').foldAngle).toBe('LENGTH/2deg');
    // The instance value and the array count rebind.
    const workpiece = getCassetteV2Workpieces(renamed).find(item => item.id === placed.workpieceId);
    expect(workpiece.parameters.W).toBe('LENGTH/2');
    expect(getCassetteV2WorkpieceRelations(renamed)[0].pattern.count).toBe('LENGTH/100');
    // Colliding and invalid names refuse.
    expect(renameCassetteV2TreeParameter(renamed, 'LENGTH', 'B').parameters.LENGTH).toBe('500');
    expect(renameCassetteV2TreeParameter(renamed, 'LENGTH', '1X')).toBe(renamed);
  });

  it('reads a chip value that names a cassette global', () => {    const sketch = createDefaultOccsProfileSketch();
    const added = addCassetteV2ProfileWorkpiece(createCassetteV2GraphTree(), {
      referenceWorkpieceId: 'wp_1',
      referenceNodeId: 'face_1',
      name: 'Hanger',
      parameters: sketch.parameters,
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    // The default tree carries A=500: the W chip naming it reads it, and
    // the stored table keeps the raw expression.
    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      parameters: { ...sketch.parameters, W: 'A' }
    });
    const workpiece = getCassetteV2Workpieces(driven).find(item => item.id === added.workpieceId);
    const boundsOf = (section) => {
      const vertices = sectionShapeVertices(section).map(vertex => vertex.map(Number));
      return Math.max(...vertices.map(vertex => vertex[0]));
    };
    expect(boundsOf(workpiece.profileSnapshot.section)).toBeCloseTo(500, 5);
    expect(workpiece.parameters.W).toBe('A');

    // The global stays live: the next derivation (what every render
    // runs) reads the changed value — the stored table never baked it.
    const reDerived = normalizeCassetteV2Profile(workpiece, { A: '600' });
    expect(boundsOf(reDerived.section)).toBeCloseTo(600, 5);
    expect(reDerived.parameters.W).toBe('A');
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
      parameters: sketch.parameters,
      occsProfile: occsProfileFromSketch(sketch),
      sketch
    });
    const workpieceOf = (tree) => getCassetteV2Workpieces(tree).find(item => item.id === added.workpieceId);
    const chainOf = (tree) => sectionShapeVertices(workpieceOf(tree).profileSnapshot.section, 'chain');

    const before = chainOf(added.tree);
    expect(before.length, 'Expected the authored fillet to round the placed chain').toBeGreaterThan(4);

    const driven = updateCassetteV2Workpiece(added.tree, added.workpieceId, {
      parameters: { A: 2.5 }
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
      arrayEdge: 'E0',
      arrayMode: 'count',
      arrayCount: '3'
    });
    expect(occs.cassette.joints[0].placement.pattern).toMatchObject({
      type: 'edgeArray',
      edge: 'E0',
      count: '3'
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
      pattern: expect.objectContaining({ edge: 'E0', count: 3 })
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
    expect(contextFaceContour.paths[0].d).toBe(cutOuter.paths[0].d);
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
    expect(clippedFace.offsetControls).toEqual(cleanFace.offsetControls);
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
    expect(drawing.layers[0].paths).toHaveLength(1);
    expect(drawing.layers[1].paths).toHaveLength(1);
    expect(drawing.layers[2].paths).toHaveLength(1);
    expect(drawing.layers.find(layer => layer.standardCode === 'dimension.cassette').paths
      .filter(path => path.kind === 'text')
      .map(path => path.text)).toEqual(['A', 'B', 'R']);
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

    expect(dimensionLayer.paths.filter(path => path.kind === 'text').map(path => path.text)).toEqual(['A', 'B']);
  });
});
