export function workspaceFilePresentation(item = {}, { icon = '', label = '', modified = false } = {}) {
  const entityType = item.entityType || item.type || '';
  return {
    ...item,
    entityType,
    label,
    icon,
    modified: Boolean(modified),
    lifecycleState: item.kind === 'entity' ? item.entity?.status?.state || null : null
  };
}
