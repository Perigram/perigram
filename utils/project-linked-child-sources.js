import { generatedDetailScreenForEntityType } from '~/components/generated/detail-screen-actions.js';
import { resolveSourceFilters } from '~/composables/useGeneratedScreen.js';
import { normalizeHierarchyType } from './entity-hierarchy.js';

export function linkedExplorerChildSources({ linkedItems = [], screens = [], containment = [] } = {}) {
  return linkedItems.flatMap(parent => {
    const parentId = entityId(parent?.entity);
    if (!parentId || !parent?.type) return [];
    const detailScreen = generatedDetailScreenForEntityType({ screens, entityType: parent.type });
    if (!detailScreen) return [];
    const scopedScreen = {
      ...detailScreen,
      scope: {
        ...(detailScreen.scope || {}),
        entityId: parentId,
        [`${parent.type}Id`]: parentId
      }
    };
    return (detailScreen.sources || [])
      .filter(source => source?.mode === 'list' && containedBy(parent.type, source.entityType, containment))
      .map(source => ({
        parentKey: parent.key,
        entityType: source.entityType,
        filters: resolveSourceFilters(source, scopedScreen)
      }));
  });
}

function containedBy(parentType, childType, containment = []) {
  return containment.some(relation => (
    normalizeHierarchyType(relation?.parentType) === normalizeHierarchyType(parentType)
    && normalizeHierarchyType(relation?.childType) === normalizeHierarchyType(childType)
  ));
}

function entityId(entity = {}) {
  return entity?._id?.toString?.() || entity?.identity?.uid?.toString?.() || entity?.id?.toString?.() || '';
}
