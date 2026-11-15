export function entityLabelOf(domain = {}, typeId = '') {
  return (domain.entities || []).find(entity => entity.type === typeId)?.label || null;
}
