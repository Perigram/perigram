// Org1's nesting flow as one seam-authored fixture: a manual solve over
// the attempt's designs, the result patched onto the attempt, and sheet
// designs constructed from the solved layouts (fromLayout). Shared by the
// e2e; mirrors what organizations compose over the facade vocabulary.
import { createDefinitionAuthoring } from '#packages/processes/authoring';

export function composeNestingAttemptTree(authoring) {
  authoring.declareClass({ id: 'attemptClass', typeId: 'nesting-attempt', class: 'item', name: 'Nesting attempt' });
  authoring.declareField({ id: 'attemptLabelField', ownerClassId: 'attemptClass', name: 'label', descriptor: { base: 'string', identifier: true } });
  authoring.declareField({ id: 'attemptResultField', ownerClassId: 'attemptClass', name: 'result', descriptor: { base: 'json' } });
  authoring.declareTypeRef({ id: 'designRef', typeId: 'cassette-design' });
  authoring.declareTypeRef({ id: 'sheetRef', typeId: 'sheet-design' });
  authoring.declareTypeRef({ id: 'dxfRef', typeId: 'sheet-dxf' });
  return authoring;
}

export function composeNestingAttemptGraph(authoring, { adminAccess = null } = {}) {
  authoring.drop('contextEntity', { id: 'attemptCtx' });
  authoring.configure('attemptCtx', { typeId: 'nesting-attempt', select: 'current' });

  authoring.drop('allEntities', { id: 'designs' });
  authoring.wireDeclaration('designRef', 'designs', 'binds');

  authoring.drop('extractProjection', { id: 'polygons' });
  authoring.configure('polygons', { typeId: 'cassette-design', projection: 'nesting-polygons' });

  authoring.drop('recordField', { id: 'sourceId' });
  authoring.configure('sourceId', { path: 'sourceId', type: { base: 'string' } });
  authoring.drop('recordField', { id: 'sourceKey' });
  authoring.configure('sourceKey', { path: 'sourceKey', type: { base: 'string' } });
  authoring.drop('recordField', { id: 'parts' });
  authoring.configure('parts', { path: 'parts', type: { base: 'list', itemType: { base: 'record' } } });
  authoring.drop('constructRecord', { id: 'jobItems' });
  authoring.configure('jobItems', { fields: ['sourceId', 'sourceKey', 'parts', 'count'] });
  authoring.drop('literal', { id: 'one' });
  authoring.configure('one', { type: { base: 'number', nullable: false, unit: 'count' }, value: 1 });

  authoring.drop('service:nesting:nesting-solve', { id: 'solve' });
  authoring.setInputDefault('solve', 'sheetWidth', 1220);
  authoring.setInputDefault('solve', 'sheetHeight', 2440);
  if (adminAccess) authoring.configure('solve', { access: adminAccess });

  authoring.drop('flattenTree', { id: 'solveItems' });

  authoring.drop('mutate', { id: 'patchAttempt' });
  if (adminAccess) authoring.configure('patchAttempt', { access: adminAccess });

  authoring.drop('castValue', { id: 'solveAsRecord' });

  authoring.drop('recordField', { id: 'solveLayouts' });
  authoring.configure('solveLayouts', { path: 'layouts', type: { base: 'json' } });

  authoring.drop('construct', { id: 'mkSheets' });
  authoring.wireDeclaration('sheetRef', 'mkSheets', 'binds');
  authoring.configure('mkSheets', { construction: { mode: 'fromLayout' }, ...(adminAccess ? { access: adminAccess } : {}) });

  authoring.drop('construct', { id: 'mkDxf' });
  authoring.wireDeclaration('dxfRef', 'mkDxf', 'binds');
  authoring.configure('mkDxf', { construction: { mode: 'fromSheet' }, ...(adminAccess ? { access: adminAccess } : {}) });

  authoring.drop('mutate', { id: 'attachDxf' });
  if (adminAccess) authoring.configure('attachDxf', { access: adminAccess });

  authoring.connect('designs', 'data:result', 'polygons', 'data:entity');
  authoring.connect('polygons', 'data:result', 'sourceId', 'data:value');
  authoring.connect('polygons', 'data:result', 'sourceKey', 'data:value');
  authoring.connect('polygons', 'data:result', 'parts', 'data:value');
  authoring.connect('sourceId', 'data:value', 'jobItems', 'data:sourceId');
  authoring.connect('sourceKey', 'data:value', 'jobItems', 'data:sourceKey');
  authoring.connect('parts', 'data:value', 'jobItems', 'data:parts');
  authoring.connect('one', 'data:value', 'jobItems', 'data:count');
  authoring.connect('jobItems', 'data:record', 'solveItems', 'data:value');
  authoring.connect('solveItems', 'data:value', 'solve', 'data:items');

  // The entity wire types the mutate first; its control port follows.
  authoring.connect('attemptCtx', 'data:result', 'patchAttempt', 'data:entity');
  authoring.connect('solve', 'control:completed', 'patchAttempt', 'control:in');
  authoring.connect('solve', 'data:result', 'patchAttempt', 'data:fields.result');
  authoring.connect('solve', 'data:result', 'solveAsRecord', 'data:value');
  authoring.connect('solveAsRecord', 'data:value', 'solveLayouts', 'data:value');

  authoring.connect('patchAttempt', 'control:completed', 'mkSheets', 'control:in');
  authoring.connect('solveLayouts', 'data:value', 'mkSheets', 'data:layout');

  authoring.connect('mkSheets', 'control:completed', 'mkDxf', 'control:in');
  authoring.connect('mkSheets', 'data:result', 'mkDxf', 'data:sheet');

  // The sheet carries its cut file as the declared `dxf` relation.
  authoring.connect('mkSheets', 'data:result', 'attachDxf', 'data:entity');
  authoring.connect('mkDxf', 'control:completed', 'attachDxf', 'control:in');
  authoring.connect('mkDxf', 'data:result', 'attachDxf', 'data:relations.dxf');

  return authoring.definition();
}

export function createNestingAttemptAuthoring(domain) {
  return composeNestingAttemptTree(createDefinitionAuthoring(domain));
}
