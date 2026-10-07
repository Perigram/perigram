import {
  createCassetteV2GraphTree,
  addCassetteV2GraphChild,
  updateCassetteV2GraphNode,
  createCassetteV2OccsDocumentFromTree,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2WorkpieceAttachment
} from '../utils/cassetteV2Renderer.js';
import { evaluateOccsCassetteTemplate } from '../utils/occs/evaluate.js';

const evaluate = async (tree, name) => {
  const definition = createCassetteV2OccsDocumentFromTree(tree, { templateName: name, templateId: 'tpl_8842' });
  return evaluateOccsCassetteTemplate(definition, { A: 300, B: 600, R: 40, L: 25 }, { templateName: name, templateId: 'tpl_8842' });
};

// Simple cassette: return flanges on all four root edges, one hanger clip.
let tree = createCassetteV2GraphTree();
for (let edge = 0; edge < 4; edge++) {
  tree = addCassetteV2GraphChild(tree, tree.rootId, edge).tree;
}
try {
  const hw = addCassetteV2HardwareWorkpiece(tree, { family: 'hanger_clip' });
  tree = addCassetteV2WorkpieceAttachment(hw.tree, hw.workpieceId, {
    referenceWorkpieceId: hw.tree.workpieces[0].id,
    referenceNodeId: hw.tree.rootId
  }).tree;
} catch (e) {
  console.error('hanger clip failed:', e.message);
}
const simple = await evaluate(tree, 'FCT-01');

// Complex cassette: mounting-flange lips (foldAngle -90) on the left (E3) and
// right (E1) returns' outer edges, height 25.
let complexTree = createCassetteV2GraphTree();
const returns = [];
for (let edge = 0; edge < 4; edge++) {
  const r = addCassetteV2GraphChild(complexTree, complexTree.rootId, edge);
  complexTree = r.tree;
  returns.push(r.nodeId);
}
for (const node of [returns[1], returns[3]]) {
  const lip = addCassetteV2GraphChild(complexTree, node, 2);
  complexTree = updateCassetteV2GraphNode(lip.tree, lip.nodeId, { height: '25' });
}
const complex = await evaluate(complexTree, 'FCT-01');

const out = {
  simple: {
    dimensions: simple.dimensions,
    nestingPolygons: simple.nestingPolygons?.map(p => p.coordinates),
    layers: (simple.layerData || []).map(l => ({ layer: l.layer, geometry: l.geometry, workpieceId: l.workpieceId }))
  },
  complex: {
    dimensions: complex.dimensions,
    nestingPolygons: complex.nestingPolygons?.map(p => p.coordinates)
  }
};
console.log(JSON.stringify(out, null, 1).slice(0, 20000));
