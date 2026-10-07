import {
  createCassetteV2GraphTree,
  addCassetteV2GraphChild,
  updateCassetteV2GraphNode,
  createCassetteV2OccsDocumentFromTree,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2WorkpieceAttachment,
  updateCassetteV2WorkpieceRelation
} from '../utils/cassetteV2Renderer.js';
import { evaluateOccsCassetteTemplate } from '../utils/occs/evaluate.js';

let tree = createCassetteV2GraphTree();
// Return flanges on all four root edges.
for (let edge = 0; edge < 4; edge++) {
  const { tree: t, nodeId } = addCassetteV2GraphChild(tree, tree.rootId, edge);
  tree = t;
  console.error(`return on E${edge}: node ${nodeId}`);
}
// Try a hanger clip attached to the top return (edge E2 child).
let hwId = null;
try {
  const hw = addCassetteV2HardwareWorkpiece(tree, { family: 'hanger_clip' });
  tree = hw.tree;
  hwId = hw.workpieceId;
  const attach = addCassetteV2WorkpieceAttachment(tree, hwId, {
    referenceWorkpieceId: tree.workpieces[0].id,
    referenceNodeId: tree.rootId
  });
  tree = attach.tree;
  console.error('hanger clip:', hwId, 'relation:', attach.relationId);
} catch (e) {
  console.error('hanger clip failed:', e.message);
}

const definition = createCassetteV2OccsDocumentFromTree(tree, { templateName: 'FCT-01', templateId: 'tpl_8842' });
const result = await evaluateOccsCassetteTemplate(definition, { A: 300, B: 600, R: 40, T: 2 }, { templateName: 'FCT-01', templateId: 'tpl_8842' });

const out = {
  dimensions: result.dimensions,
  nestingPolygons: result.nestingPolygons?.map(p => p.coordinates),
  layers: (result.layerData || []).map(l => ({
    layer: l.layer,
    geometry: l.geometry,
    workpieceId: l.workpieceId
  }))
};
console.log(JSON.stringify(out, null, 1).slice(0, 20000));
