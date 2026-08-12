import { canonicalEntityType } from '@cutkit/domain-cnc';
import { resolveEntityRelationRefs } from './entity-relations.js';

export function linkedExplorerPreviewRefs({ linkedItems = [], containment = [] } = {}) {
  const result = [];
  for (const parent of linkedItems) {
    const parentType = canonicalEntityType(parent?.type);
    if (!parentType) continue;
    for (const [key, value] of Object.entries(parent?.entity?.summary || {})) {
      if (!key.endsWith('Preview')) continue;
      for (const reference of resolveEntityRelationRefs(value)) {
        if (!isDirectContainedPreview(parentType, reference.entityType, containment)) continue;
        result.push(reference);
      }
    }
  }
  return Array.from(new Map(result.map(reference => [`${reference.entityType}:${reference.id}`, reference])).values());
}

function isDirectContainedPreview(parentType, childType, containment = []) {
  const normalizedChildType = canonicalEntityType(childType);
  return containment.some(relation => (
    canonicalEntityType(relation?.parentType) === parentType
    && canonicalEntityType(relation?.childType) === normalizedChildType
  ));
}
