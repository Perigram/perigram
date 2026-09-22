import { generatedDetailScreenForTypeId } from '~/components/generated/detail-screen-actions.js';
import { resolveSourceFilters } from '~/composables/useGeneratedScreen.js';
import { normalizeHierarchyType } from './instance-hierarchy.js';

export function linkedExplorerChildSources({ linkedItems = [], screens = [], containment = [] } = {}) {
  return linkedItems.flatMap(parent => {
    const parentId = instanceId(parent?.entity);
    if (!parentId || !parent?.type) return [];
    const detailScreen = generatedDetailScreenForTypeId({ screens, typeId: parent.type });
    if (!detailScreen) return [];
    const scopedScreen = {
      ...detailScreen,
      scope: {
        ...(detailScreen.scope || {}),
        instanceId: parentId,
        [`${parent.type}Id`]: parentId
      }
    };
    return (detailScreen.sources || [])
      .filter(source => source?.mode === 'list' && containedBy(parent.type, source.typeId, containment))
      .map(source => ({
        parentKey: parent.key,
        typeId: source.typeId,
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

function instanceId(entity = {}) {
  return entity?._id?.toString?.() || entity?.identity?.uid?.toString?.() || entity?.id?.toString?.() || '';
}
