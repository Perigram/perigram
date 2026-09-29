// The composed order process (the pack's end-to-end proof): the process
// graph over the order vocabulary, composed through the headless
// authoring seam — every record born from a palette drop, configured
// through the inspector's writes, and wired through the port-gated
// connect gesture. Consumed by order-process.spec.js (runtime proof) and
// the designer e2e (the same definition loads in the browser designer).
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';
import { ORDER_LINEAGE_KEY, ORDER_TABLE_RELATION, ORDER_TYPE_ID, ATTEMPT_TYPE_ID } from './order-process-declarations.js';

export function composeOrderProcessDefinition(domain, tableType) {
  const authoring = createDefinitionAuthoring(domain);
  const adminAccess = { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] };
  const lineageInput = `lineage.${ORDER_LINEAGE_KEY}`;

  // The manual entry: creating the order container is what a user starts;
  // its table arrives on the construct's relation input (a manual-input
  // contract — an automatically evaluated path could never prompt).
  authoring.drop('construct', { id: 'order' });
  authoring.configure('order', { typeId: ORDER_TYPE_ID, access: adminAccess });
  authoring.setInputDefault('order', 'data.name', 'Facade order 42');

  // The relation read resolves the stored table refs into entity
  // instances; the first table feeds the rows projection.
  authoring.drop('relatedEntities', { id: 'tables' });
  authoring.configure('tables', { typeId: ORDER_TYPE_ID });
  authoring.drop('itemAtPosition', { id: 'firstTable' });
  authoring.configure('firstTable', { type: { base: 'entity', typeId: tableType } });
  authoring.setInputDefault('firstTable', 'index', 0);
  authoring.drop('extractProjection', { id: 'rows' });
  authoring.configure('rows', { typeId: tableType, projection: 'rows' });

  // Name-keyed template resolution: rows join the cassette library by
  // the authored keys (no lookup service exists); the pair's `right` is
  // the matched template. The parameter columns compose a clean
  // parameters record — no row residue reaches the bake.
  authoring.drop('recordField', { id: 'rowName' });
  authoring.configure('rowName', { path: 'name', type: { base: 'string', nullable: true } });
  authoring.drop('recordField', { id: 'rowTemplate' });
  authoring.configure('rowTemplate', { path: 'right', type: { base: 'entity', typeId: 'cassette', nullable: true } });
  authoring.drop('recordField', { id: 'paramA' });
  authoring.configure('paramA', { path: 'A', type: { base: 'string', nullable: true } });
  authoring.drop('recordField', { id: 'paramB' });
  authoring.configure('paramB', { path: 'B', type: { base: 'string', nullable: true } });
  authoring.drop('constructRecord', { id: 'params' });
  authoring.configure('params', { fields: ['A', 'B'] });

  authoring.drop('allEntities', { id: 'templates' });
  authoring.configure('templates', { typeId: 'cassette' });
  authoring.drop('joinByKey', { id: 'pairs' });
  authoring.configure('pairs', { leftKey: 'cassette', rightKey: 'identity.name' });

  authoring.drop('construct', { id: 'bake' });
  authoring.configure('bake', { typeId: 'cassette-design', construction: { mode: 'bake' } });

  // The declared materials: one sheet-material per aligned tuple of the
  // authored list literals — no per-material branch, no convergence.
  authoring.drop('literalList', { id: 'codes' });
  authoring.configure('codes', { type: { base: 'string', nullable: false }, value: ['ACM-1250x2500-04', 'ACM-1500x3000-06'] });
  authoring.drop('literalList', { id: 'widths' });
  authoring.configure('widths', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [1250, 1500] });
  authoring.drop('literalList', { id: 'heights' });
  authoring.configure('heights', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [2500, 3000] });
  authoring.drop('literalList', { id: 'thicknesses' });
  authoring.configure('thicknesses', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [4, 6] });
  authoring.drop('construct', { id: 'materials' });
  authoring.configure('materials', { typeId: 'sheet-material', access: adminAccess });

  // Job geometry through the declared projection; one job item per
  // design (count authored).
  authoring.drop('extractProjection', { id: 'polygons' });
  authoring.configure('polygons', { typeId: 'cassette-design', projection: 'nesting-polygons' });
  authoring.drop('constructRecord', { id: 'jobItems' });
  authoring.configure('jobItems', { fields: ['polygonParts', 'count'] });
  authoring.drop('literal', { id: 'one' });
  authoring.configure('one', { type: { base: 'number', nullable: false, unit: 'count' }, value: 1 });

  // The loop pair (the closer lands with its loop): one solve per
  // material, every run saved as a child.
  authoring.drop('forEachEntity', { id: 'loop' });
  authoring.configure('loop', { type: { base: 'entity', typeId: 'sheet-material' } });

  authoring.drop('getField', { id: 'matWidth' });
  authoring.configure('matWidth', { typeId: 'sheet-material' });
  authoring.setInputDefault('matWidth', 'field', 'data.width');
  authoring.drop('getField', { id: 'matHeight' });
  authoring.configure('matHeight', { typeId: 'sheet-material' });
  authoring.setInputDefault('matHeight', 'field', 'data.height');

  authoring.drop('service:nesting.solve', { id: 'solve' });

  authoring.drop('construct', { id: 'attempt' });
  authoring.configure('attempt', { typeId: ATTEMPT_TYPE_ID, access: adminAccess });
  authoring.setInputDefault('attempt', 'data.label', 'Nesting run');

  // Control spine: order → bake → materials → loop → solve → attempt →
  // loop end.
  authoring.connect('order', 'completed', 'bake', 'in');
  authoring.connect('bake', 'completed', 'materials', 'in');
  authoring.connect('materials', 'completed', 'loop', 'in');
  authoring.connect('loop', 'each', 'solve', 'in');
  authoring.connect('solve', 'completed', 'attempt', 'in');
  authoring.connect('attempt', 'completed', 'loopEnd', 'in');

  // The table path.
  authoring.connect('order', 'result', 'tables', 'entity');
  authoring.connect('tables', 'result', 'firstTable', 'items');
  authoring.connect('firstTable', 'item', 'rows', 'entity');

  // Row values and template resolution.
  authoring.connect('rows', 'result', 'rowName', 'value');
  authoring.connect('rows', 'result', 'pairs', 'left');
  authoring.connect('templates', 'result', 'pairs', 'right');
  authoring.connect('pairs', 'pairs', 'rowTemplate', 'value');
  authoring.connect('rows', 'result', 'paramA', 'value');
  authoring.connect('rows', 'result', 'paramB', 'value');
  authoring.connect('paramA', 'value', 'params', 'A');
  authoring.connect('paramB', 'value', 'params', 'B');

  // One baked design per row, under the order's lineage.
  authoring.connect('rowName', 'value', 'bake', 'name');
  authoring.connect('rowTemplate', 'value', 'bake', 'template');
  authoring.connect('params', 'record', 'bake', 'parameters');
  authoring.connect('order', 'result', 'bake', lineageInput);

  // The declared materials under the order's lineage.
  authoring.connect('codes', 'value', 'materials', 'data.code');
  authoring.connect('widths', 'value', 'materials', 'data.width');
  authoring.connect('heights', 'value', 'materials', 'data.height');
  authoring.connect('thicknesses', 'value', 'materials', 'data.thickness');
  authoring.connect('order', 'result', 'materials', lineageInput);

  // Job items and the per-material solve.
  authoring.connect('bake', 'result', 'polygons', 'entity');
  authoring.connect('polygons', 'result', 'jobItems', 'polygonParts');
  authoring.connect('one', 'value', 'jobItems', 'count');
  authoring.connect('materials', 'result', 'loop', 'items');
  authoring.connect('loop', 'item', 'matWidth', 'entity');
  authoring.connect('loop', 'item', 'matHeight', 'entity');
  authoring.connect('jobItems', 'record', 'solve', 'items');
  authoring.connect('matWidth', 'value', 'solve', 'sheetWidth');
  authoring.connect('matHeight', 'value', 'solve', 'sheetHeight');
  authoring.connect('solve', 'result', 'attempt', 'data.result');
  authoring.connect('order', 'result', 'attempt', lineageInput);

  return authoring.definition();
}
