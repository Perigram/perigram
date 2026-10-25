// The composed facade order process as one seam-authored fixture
// (`packages/processes/src/authoring.js`): the org vocabulary is declared
// in-tree and posted first (the Apply sequence), every type binding
// derives from a binds wire, and the graph over it is palette drops +
// configure + port-gated wires. The pack spec (unit, faked persistence)
// and the live e2e both compose through this module — one composition,
// two proofs.
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';

export const ORDER_LINEAGE_KEY = 'facadeOrderId';

export function emptyAuthoringDomain() {
  return { entities: [], fieldSchemas: {}, workflows: {}, construction: {}, relations: [], projectionContracts: {}, serviceContracts: {} };
}

export function composeOrderTree(authoring) {
  authoring.declareClass({ id: 'orderClass', typeId: 'facade-order', class: 'group', name: 'Facade order' });
  authoring.declareClass({ id: 'attemptClass', typeId: 'nesting-attempt', class: 'item', name: 'Nesting attempt' });
  authoring.declareField({ id: 'orderNameField', ownerClassId: 'orderClass', name: 'name', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'attemptLabelField', ownerClassId: 'attemptClass', name: 'label', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'attemptResultField', ownerClassId: 'attemptClass', name: 'result', descriptor: { base: 'json' } });
  authoring.declareTypeRef({ id: 'xlsxRef', typeId: 'xlsx-workbook' });
  authoring.declareTypeRef({ id: 'csvRef', typeId: 'csv-table' });
  authoring.declareTypeRef({ id: 'cassetteRef', typeId: 'cassette' });
  authoring.declareTypeRef({ id: 'designRef', typeId: 'cassette-design' });
  authoring.declareClass({ id: 'materialClass', typeId: 'sheet-material', class: 'file', name: 'Sheet material' });
  authoring.declareField({ id: 'materialCode', ownerClassId: 'materialClass', name: 'code', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'materialWidth', ownerClassId: 'materialClass', name: 'width', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'materialHeight', ownerClassId: 'materialClass', name: 'height', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'materialThickness', ownerClassId: 'materialClass', name: 'thickness', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'tableField', ownerClassId: 'orderClass', name: 'table', descriptor: { base: 'ref' } });
  authoring.wireDeclaration('xlsxRef', 'tableField', 'targets');
  authoring.wireDeclaration('csvRef', 'tableField', 'targets');
  authoring.wireDeclaration('designRef', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('materialClass', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('attemptClass', 'orderClass', 'children', { key: 'contents' });
  return authoring;
}

export function composeOrderGraph(authoring, tableType) {
  const adminAccess = { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] };
  authoring.drop('construct', { id: 'order' });
  authoring.wireDeclaration('orderClass', 'order', 'binds');
  authoring.configure('order', { access: adminAccess });
  authoring.setInputDefault('order', 'fields.name', 'Facade order 42');

  authoring.drop('relatedEntities', { id: 'tables' });
  authoring.configure('tables', { typeId: 'facade-order' });
  authoring.drop('itemAtPosition', { id: 'firstTable' });
  authoring.configure('firstTable', { type: { base: 'entityRef', typeId: tableType } });
  authoring.setInputDefault('firstTable', 'index', 0);
  authoring.drop('extractProjection', { id: 'rows' });
  authoring.configure('rows', { typeId: tableType, projection: 'rows' });

  authoring.drop('recordField', { id: 'rowName' });
  authoring.configure('rowName', { path: 'name', type: { base: 'string', nullable: true } });
  authoring.drop('recordField', { id: 'rowTemplate' });
  authoring.configure('rowTemplate', { path: 'right', type: { base: 'entityRef', typeId: 'cassette', nullable: true } });
  authoring.drop('recordField', { id: 'paramA' });
  authoring.configure('paramA', { path: 'A', type: { base: 'string', nullable: true } });
  authoring.drop('recordField', { id: 'paramB' });
  authoring.configure('paramB', { path: 'B', type: { base: 'string', nullable: true } });
  authoring.drop('constructRecord', { id: 'params' });
  authoring.configure('params', { fields: ['A', 'B'] });

  authoring.drop('allEntities', { id: 'templates' });
  authoring.wireDeclaration('cassetteRef', 'templates', 'binds');
  authoring.drop('joinByKey', { id: 'pairs' });
  authoring.configure('pairs', { leftKey: 'cassette', rightKey: 'identity.name' });

  authoring.drop('construct', { id: 'bake' });
  authoring.wireDeclaration('designRef', 'bake', 'binds');
  authoring.configure('bake', { construction: { mode: 'bake' } });

  authoring.drop('literalList', { id: 'codes' });
  authoring.configure('codes', { type: { base: 'string', nullable: false }, value: ['ACM-1250x2500-04', 'ACM-1500x3000-06'] });
  authoring.drop('literalList', { id: 'widths' });
  authoring.configure('widths', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [1250, 1500] });
  authoring.drop('literalList', { id: 'heights' });
  authoring.configure('heights', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [2500, 3000] });
  authoring.drop('literalList', { id: 'thicknesses' });
  authoring.configure('thicknesses', { type: { base: 'number', nullable: false, unit: 'mm' }, value: [4, 6] });
  authoring.drop('construct', { id: 'materials' });
  authoring.wireDeclaration('materialClass', 'materials', 'binds');
  authoring.configure('materials', { access: adminAccess });

  authoring.drop('extractProjection', { id: 'polygons' });
  authoring.configure('polygons', { typeId: 'cassette-design', projection: 'nesting-polygons' });
  authoring.drop('constructRecord', { id: 'jobItems' });
  authoring.configure('jobItems', { fields: ['polygonParts', 'count'] });
  authoring.drop('literal', { id: 'one' });
  authoring.configure('one', { type: { base: 'number', nullable: false, unit: 'count' }, value: 1 });

  authoring.drop('forEachEntity', { id: 'loop' });
  authoring.configure('loop', { type: { base: 'entityRef', typeId: 'sheet-material' } });

  authoring.drop('getField', { id: 'matWidth' });
  authoring.configure('matWidth', { typeId: 'sheet-material' });
  authoring.setInputDefault('matWidth', 'field', 'fields.width');
  authoring.drop('getField', { id: 'matHeight' });
  authoring.configure('matHeight', { typeId: 'sheet-material' });
  authoring.setInputDefault('matHeight', 'field', 'fields.height');

  authoring.drop('service:plugin.facade.nesting-solve', { id: 'solve' });

  authoring.drop('construct', { id: 'attempt' });
  authoring.wireDeclaration('attemptClass', 'attempt', 'binds');
  authoring.configure('attempt', { access: adminAccess });
  authoring.setInputDefault('attempt', 'fields.label', 'Nesting run');

  authoring.connect('order', 'control:completed', 'bake', 'control:in');
  authoring.connect('bake', 'control:completed', 'materials', 'control:in');
  authoring.connect('materials', 'control:completed', 'loop', 'control:in');
  authoring.connect('loop', 'control:each', 'solve', 'control:in');
  authoring.connect('solve', 'control:completed', 'attempt', 'control:in');
  authoring.connect('attempt', 'control:completed', 'loopEnd', 'control:in');

  authoring.connect('order', 'data:result', 'tables', 'data:entity');
  authoring.connect('tables', 'data:result', 'firstTable', 'data:items');
  authoring.connect('firstTable', 'data:item', 'rows', 'data:entity');

  authoring.connect('rows', 'data:result', 'rowName', 'data:value');
  authoring.connect('rows', 'data:result', 'pairs', 'data:left');
  authoring.connect('templates', 'data:result', 'pairs', 'data:right');
  authoring.connect('pairs', 'data:pairs', 'rowTemplate', 'data:value');
  authoring.connect('rows', 'data:result', 'paramA', 'data:value');
  authoring.connect('rows', 'data:result', 'paramB', 'data:value');
  authoring.connect('paramA', 'data:value', 'params', 'data:A');
  authoring.connect('paramB', 'data:value', 'params', 'data:B');

  authoring.connect('rowName', 'data:value', 'bake', 'data:name');
  authoring.connect('rowTemplate', 'data:value', 'bake', 'data:template');
  authoring.connect('params', 'data:record', 'bake', 'data:parameters');
  authoring.connect('order', 'result', 'bake', `lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('codes', 'data:value', 'materials', 'data:fields.code');
  authoring.connect('widths', 'data:value', 'materials', 'data:fields.width');
  authoring.connect('heights', 'data:value', 'materials', 'data:fields.height');
  authoring.connect('thicknesses', 'data:value', 'materials', 'data:fields.thickness');
  authoring.connect('order', 'result', 'materials', `lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('bake', 'data:result', 'polygons', 'data:entity');
  authoring.connect('polygons', 'data:result', 'jobItems', 'data:polygonParts');
  authoring.connect('one', 'data:value', 'jobItems', 'data:count');
  authoring.connect('materials', 'data:result', 'loop', 'data:items');
  authoring.connect('loop', 'data:item', 'matWidth', 'data:entity');
  authoring.connect('loop', 'data:item', 'matHeight', 'data:entity');
  authoring.connect('jobItems', 'data:record', 'solve', 'data:items');
  authoring.connect('matWidth', 'data:value', 'solve', 'data:sheetWidth');
  authoring.connect('matHeight', 'data:value', 'solve', 'data:sheetHeight');
  authoring.connect('solve', 'data:result', 'attempt', 'data:fields.result');
  authoring.connect('order', 'result', 'attempt', `lineage.${ORDER_LINEAGE_KEY}`);

  return authoring.definition();
}

export function createOrderProcessAuthoring(domain) {
  return composeOrderTree(createDefinitionAuthoring(domain));
}
