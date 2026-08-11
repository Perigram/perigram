export function normalizeHandle(handle = '') {
  return String(handle).replace(/^(input|output|data):/, '');
}

export function lineageKeyForEntityType(entityType = '') {
  const camel = String(entityType).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
  return camel ? `${camel}Id` : '';
}

export function lineageRelationsForParent(parentEntityType = '', lineageBindings = []) {
  const relations = (lineageBindings || [])
    .filter(binding => binding.ancestorEntityType === parentEntityType && binding.childEntityType && binding.lineageKey)
    .map(binding => ({ childType: binding.childEntityType, lineageKey: binding.lineageKey }));
  return relations.length ? relations : null;
}
