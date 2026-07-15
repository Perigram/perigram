export function filterRootSourceItems(items = [], rootLineageKeys = []) {
  if (!Array.isArray(rootLineageKeys) || !rootLineageKeys.length) return items;
  return items.filter(entity => rootLineageKeys.every(key => !hasEntityRefValue(entity?.lineage?.[key])));
}

function hasEntityRefValue(value) {
  return value !== undefined && value !== null && value !== '';
}
