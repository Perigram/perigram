export function resolveRelationOptionScope(creator = null) {
  if (!creator?.actionId) return { scoped: false, sourceInput: null };
  const fields = [
    ...(creator.inputPolicy?.fields || []),
    ...(creator.construction?.inputs || [])
  ];
  return {
    scoped: true,
    sourceInput: fields.find(field => field.type === 'entity' && field.typeId) || null
  };
}

export function resolveRelationOptionPath({ ownerType, sourceType, lineageBindings = [], actions = {} } = {}) {
  const bindings = lineageBindings.map(binding => ({
    parentType: binding.parentTypeId,
    childType: binding.childTypeId,
    lineageKey: binding.lineageKey
  }));
  const ownerParents = bindings.filter(item => item.childType === ownerType && item.lineageKey);
  const sourceParents = bindings.filter(item => item.childType === sourceType && item.lineageKey);
  if (ownerParents.length !== 1 || sourceParents.length !== 1) return null;

  const ownerParent = ownerParents[0];
  const sourceParent = sourceParents[0];
  const bridgeActions = Object.values(actions).filter(action => (
    action.typeId === ownerParent.parentType
    && action.relationMutation?.operation === 'link'
    && [].concat(action.relationMutation.targetTypes || []).includes(sourceParent.parentType)
  ));
  if (bridgeActions.length !== 1) return null;

  return {
    ownerParent,
    sourceParent,
    bridgeRelationKey: bridgeActions[0].relationMutation.key
  };
}
