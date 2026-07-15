import {
  createRelationRef,
  getLineageReference,
  isEntityReference
} from '#packages/core/src/index.js';

const REFERENCE_PATTERN = /^([^/@]+)\/([^@]+?)(?:@(.+))?$/;

export function formatEntityReference({ entityType, entityId, revisionId = '' } = {}) {
  if (!entityType || !entityId) return '';
  return `${entityType}/${entityId}${revisionId ? `@${revisionId}` : ''}`;
}

export function parseEntityReference(value = '') {
  const match = String(value).match(REFERENCE_PATTERN);
  if (!match) return null;
  return createRelationRef(match[1], match[2], match[3]);
}

export function lineageReference(lineage = {}, parentType = '') {
  return getLineageReference(lineage, parentType);
}

export { isEntityReference };
