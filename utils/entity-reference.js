const REFERENCE_PATTERN = /^([^/@]+)\/([^@]+?)(?:@(.+))?$/;

export function formatEntityReference({ entityType, entityId, revisionId = '' } = {}) {
  if (!entityType || !entityId) return '';
  return `${entityType}/${entityId}${revisionId ? `@${revisionId}` : ''}`;
}

export function parseEntityReference(value = '') {
  const match = String(value).match(REFERENCE_PATTERN);
  if (!match) return null;
  return {
    entityType: match[1],
    entityId: match[2],
    ...(match[3] ? { revisionId: match[3] } : {})
  };
}

export function lineageReference(lineage = {}, parentType = '') {
  if (!parentType) return null;
  const entityId = lineage[`${parentType}Id`];
  if (!entityId) return null;
  return {
    entityType: parentType,
    entityId: entityId.toString?.() || String(entityId),
    ...(lineage[`${parentType}RevisionId`]
      ? { revisionId: lineage[`${parentType}RevisionId`].toString?.() || String(lineage[`${parentType}RevisionId`]) }
      : {})
  };
}
