import { containmentParent, normalizeHierarchyType } from './entity-hierarchy.js';

export function projectExplorerHierarchy({ projectItem = null, items = [], linkedItemKeys = [], containment = null } = {}) {
  if (!projectItem) return { childrenByKey: new Map(), rootItems: [], linkedRootItems: [], orphanItems: [] };
  const uniqueItems = [...new Map(items.filter(item => item?.key).map(item => [item.key, item])).values()];
  const byIdentity = new Map(uniqueItems.map(item => [identityKey(item.type, entityId(item.entity)), item]));
  const childrenByKey = new Map();
  const roots = [];
  const linkedRoots = [];
  const orphans = [];
  const linkedKeys = new Set(linkedItemKeys);

  for (const item of uniqueItems) {
    if (item.key === projectItem.key) continue;
    const parent = containmentParent(item.type, item.entity?.lineage || {}, containment);
    const parentId = parent && item.entity?.lineage?.[parent.lineageKey];
    const parentItem = parentId ? byIdentity.get(identityKey(parent.parentType, parentId)) : null;
    if (parentItem) {
      if (parentItem.key === projectItem.key) roots.push(item);
      else appendChild(childrenByKey, parentItem.key, item);
      continue;
    }
    if (linkedKeys.has(item.key)) linkedRoots.push(item);
    else if (parent && normalizeHierarchyType(parent.parentType) === normalizeHierarchyType(projectItem.type)
      && String(parentId) === String(entityId(projectItem.entity))) roots.push(item);
    else orphans.push(item);
  }

  return { childrenByKey, rootItems: roots, linkedRootItems: linkedRoots, orphanItems: orphans };
}

function appendChild(childrenByKey, parentKey, item) {
  const children = childrenByKey.get(parentKey) || [];
  children.push(item);
  childrenByKey.set(parentKey, children);
}

function identityKey(type, id) {
  return `${normalizeHierarchyType(type)}:${String(id || '')}`;
}

function entityId(entity = {}) {
  return entity?._id?.toString?.() || entity?.identity?.uid?.toString?.() || entity?.id?.toString?.() || '';
}
