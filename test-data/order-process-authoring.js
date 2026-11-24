// The composed facade order process as one seam-authored fixture
// (`packages/processes/src/authoring.js`): the org vocabulary is declared
// in-tree and posted first (the Apply sequence), every type binding
// derives from a binds wire, and the graph over it is palette drops +
// configure + port-gated wires. The pack spec (unit, faked persistence)
// and the live e2e both compose through this module — one composition,
// two proofs.
import { createDefinitionAuthoring } from '#packages/processes/authoring';

export const ORDER_LINEAGE_KEY = 'facadeOrderId';

export function emptyAuthoringDomain() {
  return { entities: [], fieldSchemas: {}, workflows: {}, construction: {}, relations: [], projectionContracts: {}, serviceContracts: {} };
}

export function composeOrderTree(authoring) {
  authoring.declareClass({ id: 'orderClass', typeId: 'facade-order', class: 'group', name: 'Facade order' });
  authoring.declareClass({ id: 'entryClass', typeId: 'queue-entry', class: 'item', name: 'Queue entry' });
  authoring.declareClass({ id: 'attemptClass', typeId: 'nesting-attempt', class: 'item', name: 'Nesting attempt' });
  authoring.declareField({ id: 'entryLabelField', ownerClassId: 'entryClass', name: 'label', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'entryDesignField', ownerClassId: 'entryClass', name: 'design', descriptor: { base: 'ref' } });
  authoring.declareField({ id: 'entryCountField', ownerClassId: 'entryClass', name: 'count', descriptor: { base: 'quantity', unit: 'count' } });
  authoring.declareField({ id: 'orderNameField', ownerClassId: 'orderClass', name: 'name', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'attemptLabelField', ownerClassId: 'attemptClass', name: 'label', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'attemptResultField', ownerClassId: 'attemptClass', name: 'result', descriptor: { base: 'json' } });
  authoring.declareTypeRef({ id: 'xlsxRef', typeId: 'xlsx-workbook' });
  authoring.declareTypeRef({ id: 'csvRef', typeId: 'csv-table' });
  authoring.declareTypeRef({ id: 'cassetteRef', typeId: 'cassette-template' });
  authoring.declareTypeRef({ id: 'designRef', typeId: 'cassette-design' });
  authoring.declareTypeRef({ id: 'cassetteInstanceRef', typeId: 'cassette-instance' });
  authoring.declareTypeRef({ id: 'sheetRef', typeId: 'sheet-design' });
  authoring.declareTypeRef({ id: 'sheetInstanceRef', typeId: 'sheet-instance' });
  authoring.declareTypeRef({ id: 'cutPlanRef', typeId: 'sheet-cut-plan' });
  authoring.wireDeclaration('designRef', 'entryDesignField', 'targets');
  authoring.declareClass({ id: 'materialClass', typeId: 'sheet-material', class: 'file', name: 'Sheet material' });
  authoring.declareField({ id: 'materialCode', ownerClassId: 'materialClass', name: 'code', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'materialWidth', ownerClassId: 'materialClass', name: 'width', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'materialHeight', ownerClassId: 'materialClass', name: 'height', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'materialThickness', ownerClassId: 'materialClass', name: 'thickness', descriptor: { base: 'quantity', unit: 'mm' } });
  authoring.declareField({ id: 'tableField', ownerClassId: 'orderClass', name: 'table', descriptor: { base: 'ref' } });
  authoring.wireDeclaration('xlsxRef', 'tableField', 'targets');
  authoring.wireDeclaration('csvRef', 'tableField', 'targets');
  authoring.wireDeclaration('entryClass', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('cassetteInstanceRef', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('designRef', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('materialClass', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('attemptClass', 'orderClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('sheetRef', 'attemptClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('sheetInstanceRef', 'attemptClass', 'children', { key: 'contents' });
  authoring.wireDeclaration('cutPlanRef', 'attemptClass', 'children', { key: 'contents' });
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

  authoring.drop('recordField', { id: 'rowTemplate' });
  authoring.configure('rowTemplate', { path: 'right', type: { base: 'entityRef', typeId: 'cassette-template', nullable: true } });
  authoring.drop('recordField', { id: 'paramA' });
  authoring.configure('paramA', { path: 'A', type: { base: 'string', nullable: true } });
  authoring.drop('recordField', { id: 'paramB' });
  authoring.configure('paramB', { path: 'B', type: { base: 'string', nullable: true } });
  authoring.drop('constructRecord', { id: 'params' });
  authoring.configure('params', { fields: ['A', 'B'] });

  authoring.drop('allEntities', { id: 'templates' });
  authoring.wireDeclaration('cassetteRef', 'templates', 'binds');
  authoring.drop('joinByKey', { id: 'pairs' });
  authoring.configure('pairs', { leftKey: 'cassette', rightKey: 'name' });

  authoring.drop('construct', { id: 'bake' });
  authoring.wireDeclaration('designRef', 'bake', 'binds');
  authoring.configure('bake', { construction: { mode: 'render' } });

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

  authoring.drop('allEntities', { id: 'designs' });
  authoring.wireDeclaration('designRef', 'designs', 'binds');
  authoring.drop('extractProjection', { id: 'polygons' });
  authoring.configure('polygons', { typeId: 'cassette-design', projection: 'nesting-polygons' });
  authoring.drop('recordField', { id: 'rowCount' });
  authoring.configure('rowCount', { path: 'count', type: { base: 'number', nullable: true, unit: 'count' } });
  authoring.drop('coalesceValue', { id: 'countValue' });
  authoring.configure('countValue', { type: { base: 'number', nullable: false, unit: 'count' } });
  authoring.drop('literal', { id: 'one' });
  authoring.configure('one', { type: { base: 'number', nullable: false, unit: 'count' }, value: 1 });

  authoring.drop('construct', { id: 'mkEntry' });
  authoring.wireDeclaration('entryClass', 'mkEntry', 'binds');
  authoring.configure('mkEntry', { access: adminAccess });
  authoring.setInputDefault('mkEntry', 'fields.label', 'Queue entry');

  authoring.drop('childEntities', { id: 'orderChildren' });
  authoring.configure('orderChildren', { typeId: 'facade-order' });
  authoring.drop('getField', { id: 'entryType' });
  authoring.configure('entryType', { typeId: 'queue-entry', path: 'type' });
  authoring.drop('literal', { id: 'entryTypeLiteral' });
  authoring.configure('entryTypeLiteral', { type: { base: 'string', nullable: false }, value: 'queue-entry' });
  authoring.drop('compareValues', { id: 'entryMask' });
  authoring.configure('entryMask', { operation: 'eq' });
  authoring.drop('filterList', { id: 'entryList' });
  authoring.drop('joinByKey', { id: 'entryParts' });
  authoring.configure('entryParts', { leftKey: 'relations.design.id', rightKey: 'sourceId' });
  authoring.drop('recordField', { id: 'entrySourceId' });
  authoring.configure('entrySourceId', { path: 'right.sourceId', type: { base: 'string' } });
  authoring.drop('recordField', { id: 'entrySourceKey' });
  authoring.configure('entrySourceKey', { path: 'right.sourceKey', type: { base: 'string' } });
  authoring.drop('recordField', { id: 'entryPartsValue' });
  authoring.configure('entryPartsValue', { path: 'right.parts', type: { base: 'json' } });
  authoring.drop('recordField', { id: 'entryQuantity' });
  authoring.configure('entryQuantity', { path: 'left.fields.count', type: { base: 'number', nullable: false, unit: 'count' } });
  authoring.drop('constructRecord', { id: 'jobItems' });
  authoring.configure('jobItems', { fields: ['sourceId', 'sourceKey', 'parts', 'count'] });
  authoring.drop('getField', { id: 'entryDesign' });
  authoring.configure('entryDesign', { typeId: 'queue-entry' });
  authoring.setInputDefault('entryDesign', 'field', 'relations.design');
  authoring.drop('construct', { id: 'mkCassette' });
  authoring.wireDeclaration('cassetteInstanceRef', 'mkCassette', 'binds');
  authoring.configure('mkCassette', { access: adminAccess });
  authoring.setInputDefault('mkCassette', 'fields.name', 'Cassette');

  authoring.drop('forEachEntity', { id: 'loop' });
  authoring.configure('loop', { type: { base: 'entityRef', typeId: 'sheet-material' } });

  authoring.drop('getField', { id: 'matWidth' });
  authoring.configure('matWidth', { typeId: 'sheet-material' });
  authoring.setInputDefault('matWidth', 'field', 'fields.width');
  authoring.drop('getField', { id: 'matHeight' });
  authoring.configure('matHeight', { typeId: 'sheet-material' });
  authoring.setInputDefault('matHeight', 'field', 'fields.height');

  authoring.drop('service:nesting:nesting-solve', { id: 'solve' });
  authoring.drop('castValue', { id: 'solveRecord' });
  authoring.configure('solveRecord', { outputType: { base: 'record' } });
  authoring.drop('recordField', { id: 'solveLayouts' });
  authoring.configure('solveLayouts', { path: 'layouts', type: { base: 'json', nullable: true } });

  authoring.drop('construct', { id: 'attempt' });
  authoring.wireDeclaration('attemptClass', 'attempt', 'binds');
  authoring.configure('attempt', { access: adminAccess });
  authoring.setInputDefault('attempt', 'fields.label', 'Nesting run');

  authoring.drop('allEntities', { id: 'storedSheets' });
  authoring.wireDeclaration('sheetRef', 'storedSheets', 'binds');

  authoring.drop('forEachEntity', { id: 'layoutLoop' });
  authoring.configure('layoutLoop', { type: { base: 'json', nullable: true } });
  authoring.drop('castValue', { id: 'layoutRecord' });
  authoring.configure('layoutRecord', { outputType: { base: 'record' } });
  authoring.drop('joinByKey', { id: 'matchStored' });
  authoring.configure('matchStored', {
    leftKey: 'compositionKey', rightKey: 'fields.compositionKey', joinMode: 'left'
  });
  authoring.drop('recordField', { id: 'matchDesign' });
  authoring.configure('matchDesign', { path: 'right', type: { base: 'entityRef', typeId: 'sheet-design', nullable: true } });
  authoring.drop('literal', { id: 'matchNull' });
  authoring.configure('matchNull', {
    type: { base: 'entityRef', typeId: 'sheet-design', nullable: true },
    typeId: 'sheet-design',
    value: null
  });
  authoring.drop('compareValues', { id: 'matchFound' });
  authoring.configure('matchFound', {
    type: { base: 'entityRef', typeId: 'sheet-design', nullable: true },
    operation: 'neq'
  });

  authoring.drop('construct', { id: 'mkSheetInstance' });
  authoring.wireDeclaration('sheetInstanceRef', 'mkSheetInstance', 'binds');
  authoring.configure('mkSheetInstance', { access: adminAccess });
  authoring.setInputDefault('mkSheetInstance', 'fields.name', 'Sheet');

  authoring.drop('choosePath', { id: 'hasStoredBranch' });

  authoring.drop('construct', { id: 'mkCutPlanExisting' });
  authoring.wireDeclaration('cutPlanRef', 'mkCutPlanExisting', 'binds');
  authoring.configure('mkCutPlanExisting', { access: adminAccess });
  authoring.setInputDefault('mkCutPlanExisting', 'fields.name', 'Cut plan');

  authoring.drop('construct', { id: 'mkSheet' });
  authoring.wireDeclaration('sheetRef', 'mkSheet', 'binds');
  authoring.configure('mkSheet', { construction: { mode: 'fromLayout' }, access: adminAccess });
  authoring.setInputDefault('mkSheet', 'name', 'Sheet');

  authoring.drop('construct', { id: 'mkCutPlanNew' });
  authoring.wireDeclaration('cutPlanRef', 'mkCutPlanNew', 'binds');
  authoring.configure('mkCutPlanNew', { access: adminAccess });
  authoring.setInputDefault('mkCutPlanNew', 'fields.name', 'Cut plan');

  authoring.connect('order', 'control:completed', 'bake', 'control:in');
  authoring.connect('bake', 'control:completed', 'mkEntry', 'control:in');
  authoring.connect('mkEntry', 'control:completed', 'mkCassette', 'control:in');
  authoring.connect('mkCassette', 'control:completed', 'materials', 'control:in');
  authoring.connect('materials', 'control:completed', 'loop', 'control:in');
  authoring.connect('loop', 'control:each', 'solve', 'control:in');
  authoring.connect('solve', 'control:completed', 'attempt', 'control:in');
  authoring.connect('attempt', 'control:completed', 'layoutLoop', 'control:in');
  authoring.connect('layoutLoop', 'control:done', 'loopEnd', 'control:in');
  authoring.connect('layoutLoop', 'control:each', 'mkSheetInstance', 'control:in');
  authoring.connect('mkSheetInstance', 'control:completed', 'hasStoredBranch', 'control:in');
  authoring.connect('hasStoredBranch', 'control:true', 'mkCutPlanExisting', 'control:in');
  authoring.connect('hasStoredBranch', 'control:false', 'mkSheet', 'control:in');
  authoring.connect('mkSheet', 'control:completed', 'mkCutPlanNew', 'control:in');
  authoring.connect('mkCutPlanExisting', 'control:completed', 'layoutLoopEnd', 'control:in');
  authoring.connect('mkCutPlanNew', 'control:completed', 'layoutLoopEnd', 'control:in');

  authoring.connect('order', 'data:result', 'tables', 'data:entity');
  authoring.connect('tables', 'data:result', 'firstTable', 'data:items');
  authoring.connect('firstTable', 'data:item', 'rows', 'data:entity');

  authoring.connect('rows', 'data:result', 'pairs', 'data:left');
  authoring.connect('templates', 'data:result', 'pairs', 'data:right');
  authoring.connect('pairs', 'data:pairs', 'rowTemplate', 'data:value');
  authoring.connect('rows', 'data:result', 'paramA', 'data:value');
  authoring.connect('rows', 'data:result', 'paramB', 'data:value');
  authoring.connect('rows', 'data:result', 'rowCount', 'data:value');
  authoring.connect('paramA', 'data:value', 'params', 'data:A');
  authoring.connect('paramB', 'data:value', 'params', 'data:B');
  authoring.connect('rowCount', 'data:value', 'countValue', 'data:value');
  authoring.connect('one', 'data:value', 'countValue', 'data:fallback');
  authoring.connect('countValue', 'data:value', 'mkEntry', 'data:fields.count');
  authoring.connect('bake', 'data:result', 'mkEntry', 'data:relations.design');
  authoring.connect('order', 'data:result', 'mkEntry', `data:lineage.${ORDER_LINEAGE_KEY}`);
  authoring.connect('mkEntry', 'data:result', 'entryDesign', 'data:entity');
  authoring.connect('entryDesign', 'data:value', 'mkCassette', 'data:relations.design');
  authoring.connect('order', 'data:result', 'mkCassette', `data:lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('rowTemplate', 'data:value', 'bake', 'data:template');
  authoring.connect('params', 'data:record', 'bake', 'data:parameters');
  authoring.connect('order', 'data:result', 'bake', `data:lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('codes', 'data:value', 'materials', 'data:fields.code');
  authoring.connect('widths', 'data:value', 'materials', 'data:fields.width');
  authoring.connect('heights', 'data:value', 'materials', 'data:fields.height');
  authoring.connect('thicknesses', 'data:value', 'materials', 'data:fields.thickness');
  authoring.connect('order', 'data:result', 'materials', `data:lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('order', 'data:result', 'orderChildren', 'data:entity');
  authoring.connect('orderChildren', 'data:result', 'entryType', 'data:entity');
  authoring.connect('entryType', 'data:value', 'entryMask', 'data:left');
  authoring.connect('entryTypeLiteral', 'data:value', 'entryMask', 'data:right');
  authoring.connect('orderChildren', 'data:result', 'entryList', 'data:items');
  authoring.connect('entryMask', 'data:result', 'entryList', 'data:mask');
  authoring.connect('designs', 'data:result', 'polygons', 'data:entity');
  authoring.connect('entryList', 'data:items', 'entryParts', 'data:left');
  authoring.connect('polygons', 'data:result', 'entryParts', 'data:right');
  authoring.connect('entryParts', 'data:pairs', 'entrySourceId', 'data:value');
  authoring.connect('entryParts', 'data:pairs', 'entrySourceKey', 'data:value');
  authoring.connect('entryParts', 'data:pairs', 'entryPartsValue', 'data:value');
  authoring.connect('entryParts', 'data:pairs', 'entryQuantity', 'data:value');
  authoring.connect('entrySourceId', 'data:value', 'jobItems', 'data:sourceId');
  authoring.connect('entrySourceKey', 'data:value', 'jobItems', 'data:sourceKey');
  authoring.connect('entryPartsValue', 'data:value', 'jobItems', 'data:parts');
  authoring.connect('entryQuantity', 'data:value', 'jobItems', 'data:count');
  authoring.connect('materials', 'data:result', 'loop', 'data:items');
  authoring.connect('loop', 'data:item', 'matWidth', 'data:entity');
  authoring.connect('loop', 'data:item', 'matHeight', 'data:entity');
  authoring.connect('jobItems', 'data:record', 'solve', 'data:items');
  authoring.connect('matWidth', 'data:value', 'solve', 'data:sheetWidth');
  authoring.connect('matHeight', 'data:value', 'solve', 'data:sheetHeight');
  authoring.connect('solve', 'data:result', 'attempt', 'data:fields.result');
  authoring.connect('solve', 'data:result', 'solveRecord', 'data:value');
  authoring.connect('solveRecord', 'data:value', 'solveLayouts', 'data:value');
  authoring.connect('order', 'data:result', 'attempt', `data:lineage.${ORDER_LINEAGE_KEY}`);

  authoring.connect('solveLayouts', 'data:value', 'layoutLoop', 'data:items');
  authoring.connect('layoutLoop', 'data:item', 'layoutRecord', 'data:value');
  authoring.connect('layoutRecord', 'data:value', 'matchStored', 'data:left');
  authoring.connect('storedSheets', 'data:result', 'matchStored', 'data:right');
  authoring.connect('matchStored', 'data:pairs', 'matchDesign', 'data:value');
  authoring.connect('matchDesign', 'data:value', 'matchFound', 'data:left');
  authoring.connect('matchNull', 'data:value', 'matchFound', 'data:right');
  authoring.connect('matchFound', 'data:result', 'hasStoredBranch', 'data:condition');

  authoring.connect('attempt', 'data:result', 'mkSheetInstance', 'data:lineage.nestingAttemptId');
  authoring.connect('attempt', 'data:result', 'mkSheet', 'data:lineage.nestingAttemptId');
  authoring.connect('attempt', 'data:result', 'mkCutPlanExisting', 'data:lineage.nestingAttemptId');
  authoring.connect('attempt', 'data:result', 'mkCutPlanNew', 'data:lineage.nestingAttemptId');

  authoring.connect('layoutRecord', 'data:value', 'mkSheet', 'data:layout');
  authoring.connect('bake', 'data:result', 'mkSheet', 'data:designs');

  authoring.connect('matchDesign', 'data:value', 'mkCutPlanExisting', 'data:relations.design');
  authoring.connect('mkSheetInstance', 'data:result', 'mkCutPlanExisting', 'data:relations.sheet');
  authoring.connect('mkSheet', 'data:result', 'mkCutPlanNew', 'data:relations.design');
  authoring.connect('mkSheetInstance', 'data:result', 'mkCutPlanNew', 'data:relations.sheet');

  return authoring.definition();
}

export function createOrderProcessAuthoring(domain) {
  return composeOrderTree(createDefinitionAuthoring(domain));
}
