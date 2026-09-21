import { detailRouteForEntity, entityIdentifier } from '~/components/generated/entity-detail-routing.js';

// Where a successfully created entity opens (SPEC §4 editor protocol):
// 1. its compiled detail route when the manifest has a screen for the
//    type (the pane/route body mounts the type's editor surface through
//    the file-surface overload);
// 2. the home workspace pane when the create ran with the `editor`
//    protocol and no compiled route exists — the editor contract ("blank
//    instance whose first editor save fills the payload") guarantees the
//    editor is reachable, not a silent close;
// 3. a toast fallback so a create without any destination is never
//    silent.
export function resolveCreatedEntityOpen({ action = {}, result = null, screenKey = '', manifest = [] } = {}) {
  const entity = createdEntity(action, result);
  const entityType = action.relationMutation?.targetType || action.entityType || action.typeId || '';
  if (!entity || !entityType) return null;
  const identifier = entityIdentifier(entity);
  if (!identifier) return null;
  const route = detailRouteForEntity({ entity, entityType, screenKey, manifest });
  if (route) return { kind: 'route', route, entityType, entityId: identifier };
  const mode = action.construction?.mode ?? action.via;
  if (mode === 'editor') {
    return { kind: 'workspace', entityType, entityId: identifier, name: displayName(entity) };
  }
  return { kind: 'toast', entityType, entityId: identifier, name: displayName(entity) };
}

function createdEntity(action = {}, result = null) {
  if (!result || typeof result !== 'object') return null;
  const tree = Array.isArray(result?.branches) ? result : result?.result;
  if (Array.isArray(tree?.branches)) {
    const items = tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
    return items.length === 1 ? (items[0].entity || items[0]) : null;
  }
  const createdTree = Array.isArray(result?.created?.branches)
    ? result.created.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error)
    : null;
  if (createdTree) return createdTree.length === 1 ? (createdTree[0].entity || createdTree[0]) : null;
  if (result.created) return result.created;
  if (!result.owner) return result.entity || result;
  return null;
}

function displayName(entity = {}) {
  return entity?.identity?.name || entity?.name || '';
}
