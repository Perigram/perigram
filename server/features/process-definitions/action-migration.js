export function migrateStatusAction(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', entityType, required: true });
  }
  if (!inputs.some(input => input.id === 'status')) {
    inputs.push({
      id: 'status',
      kind: 'status',
      statusRef: action.statusRef || null,
      status: action.status?.to || action.access?.statusTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    entityType,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      statusFrom: action.access?.statusFrom || action.status?.from || '',
      statusTo: action.access?.statusTo || action.status?.to || ''
    }
  };
}

export function normalizeLegacyProcessActions(data = {}) {
  const actions = Object.fromEntries(
    Object.entries(data.actions || {}).map(([id, action]) => [id, migrateStatusAction(action)])
  );
  const changed = JSON.stringify(actions) !== JSON.stringify(data.actions || {});
  const compiledHasLegacyActions = Object.values(data.compiled?.actions || {})
    .some(action => action.actionKind === 'changeStatus');
  if (!changed && !compiledHasLegacyActions) return { data, changed: false };

  return {
    data: { ...data, actions, compiled: null },
    changed: true
  };
}
