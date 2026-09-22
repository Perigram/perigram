export function migrateStatusAction(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', typeId, required: true });
  }
  if (!inputs.some(input => input.id === 'status')) {
    inputs.push({
      id: 'status',
      kind: 'status',
      stateRef: action.stateRef || null,
      status: action.state?.to || action.access?.stateTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    typeId,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      stateFrom: action.access?.stateFrom || action.state?.from || '',
      stateTo: action.access?.stateTo || action.state?.to || ''
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
