export function uniqueActionIds(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

export function actionFieldPaths(action = {}) {
  const fields = [
    ...(action.mutation?.fields || []),
    ...(action.inputPolicy?.fields || []),
    ...(action.inputs || [])
  ];

  return [...new Set(fields
    .flatMap(field => {
      if (typeof field === 'string') return [field];
      return [field?.dataPath, field?.path].filter(Boolean);
    })
    .map(normalizeFieldPath)
    .filter(Boolean))];
}

export function isProjectWorkspaceOperation(action = {}) {
  if (!['createEntity', 'updateEntity', 'runCommand', 'sendToOrganization'].includes(action.actionKind)) return false;
  return !(action.actionKind === 'updateEntity' && (action.status?.to || action.access?.statusTo));
}

export function relationKeysForAction(action = {}, entityType = '') {
  if (action.actionKind !== 'updateEntity') return [];
  if (entityType && action.entityType && action.entityType !== entityType) return [];

  return actionFieldPaths(action)
    .filter(path => path.startsWith('relations.'))
    .map(path => path.slice('relations.'.length).split('.')[0])
    .filter(Boolean);
}

export function relationValues(entity = {}, relation = {}) {
  const raw = entity?.relations?.[relation.key];
  const values = relation.cardinality === 'many'
    ? (Array.isArray(raw) ? raw : [])
    : (raw == null ? [] : [raw]);

  return values.map(value => normalizeRelationValue(value, relation.targetType)).filter(Boolean);
}

function normalizeFieldPath(path = '') {
  return String(path)
    .replace(/^data\.relations\./, 'relations.')
    .replace(/^entity\.relations\./, 'relations.');
}

function normalizeRelationValue(value, targetType) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return { type: targetType, id: String(value), entity: null };
  }

  const entity = value.entity || (value.identity || value._id ? value : null);
  const id = value.id || value._id || value.identity?.uid || entity?._id || entity?.identity?.uid;
  if (!id) return null;
  return {
    type: value.type || value.entityType || targetType,
    id: String(id),
    entity
  };
}
