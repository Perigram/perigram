// Process-action run results: the one extractor for the created entity a
// run carries. A run may chain further constructs after the action's own
// — the result's created items are filtered to the action's target type
// first, so the chain's last step never binds a foreign record to the
// action's destination. Consumed by the instances store (a create run
// lands its created entity in the pool — see the stores README) and by
// the created-open contract (which surface the record opens on).
export function createdEntity(action = {}, result = null) {
  const preferredType = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId || '';
  const entityOf = item => item?.entity || item;
  const ofActionType = items => {
    if (!preferredType) return null;
    const matching = items.filter(item => entityOf(item)?.type === preferredType);
    return matching.length ? entityOf(matching[0]) : null;
  };
  if (!result || typeof result !== 'object') return null;
  const tree = Array.isArray(result?.branches) ? result : result?.result;
  if (Array.isArray(tree?.branches)) {
    const items = tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
    if (items.length === 1) return entityOf(items[0]);
    return ofActionType(items) || null;
  }
  const createdTree = Array.isArray(result?.created?.branches)
    ? result.created.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error)
    : null;
  if (createdTree) {
    if (createdTree.length === 1) return entityOf(createdTree[0]);
    return ofActionType(createdTree) || null;
  }
  if (result.created) return result.created;
  if (!result.owner) return result.entity || result;
  return null;
}
