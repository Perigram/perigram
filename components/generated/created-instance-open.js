import { detailRouteForInstance, instanceIdentifier } from '~/components/generated/instance-detail-routing.js';

// Where a successfully created entity opens (SPEC §4 editor protocol):
// 1. the home workspace pane tab — the "everything lives inside home"
//    rule: while the manifest carries a compiled home screen, a create
//    opens (or reuses) the created entity's tab in the same workspace
//    instead of routing out of it; an editor-protocol create opens the
//    type's editor page directly (SPEC §UI file-creation law — the blank
//    instance whose first editor save fills the payload);
// 2. its compiled detail route when no home workspace exists (orgs
//    without a compiled home still get the routed detail surface — the
//    pane/route body mounts the type's editor surface through the
//    file-surface overload);
// 3. the home workspace pane when the create ran with the `editor`
//    protocol and no compiled route exists — the editor contract
//    guarantees the editor is reachable, not a silent close;
// 4. a toast fallback so a create without any destination is never
//    silent.
// The editor-protocol predicate (SPEC §UI): unscoped editor creates open
// the blank editor and the first save creates; context-scoped ones run
// the construct directly with their binding.
export function isEditorProtocolCreate(action = {}) {
  return (action.construction?.mode ?? action.via) === 'editor';
}

export function resolveCreatedInstanceOpen({ action = {}, result = null, screenKey = '', manifest = [] } = {}) {
  const entity = createdEntity(action, result);
  const typeId = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId || '';
  if (!entity || !typeId) return null;
  const identifier = instanceIdentifier(entity);
  if (!identifier) return null;
  const mode = action.construction?.mode ?? action.via;
  const editorCreate = mode === 'editor';
  const hasHomeWorkspace = manifest.some(screen => screen?.template === 'home');
  if (hasHomeWorkspace) {
    return { kind: 'workspace', typeId, instanceId: identifier, name: displayName(entity), ...(editorCreate ? { editor: true } : {}) };
  }
  const route = detailRouteForInstance({ entity, typeId, screenKey, manifest });
  if (route) return { kind: 'route', route, typeId, instanceId: identifier };
  if (editorCreate) {
    return { kind: 'workspace', typeId, instanceId: identifier, name: displayName(entity), editor: true };
  }
  return { kind: 'toast', typeId, instanceId: identifier, name: displayName(entity) };
}

// Every create host lands its created entity in the shared instances pool
// before opening the destination (the created-open contract's pool step,
// see the component README): the opened tab's single source, its label,
// and the type's list sections all read the pool, and the store's cached
// list observations refetch only after an upsert marks them stale.
export function landCreatedInstanceInPool(store = null, action = {}, result = null) {
  if (!store?.upsertRecord || typeof store.canonicalTypeKey !== 'function') return null;
  const entity = createdEntity(action, result);
  const id = entity?._id ?? entity?.id;
  const typeId = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId || '';
  if (!id || !typeId) return null;
  const typeKey = store.canonicalTypeKey(entity?.type || typeId);
  return typeKey ? store.upsertRecord(typeKey, entity) : null;
}

// The one create-result entity extractor (shared by the created-open
// contract and the editor surface mount's blank-create callback). A run
// may chain further constructs after the action's own — the result's
// created items are filtered to the action's target type first, so the
// chain's last step never binds a foreign record to the action's
// destination; a single item of another shape keeps the legacy behavior.
export function createdEntity(action = {}, result = null) {
  const preferredType = [].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId || '';
  const entityOf = item => item?.entity || item;
  const ofActionType = items => {
    if (!preferredType) return null;
    const matching = items.filter(item => entityOf(item)?.type === preferredType);
    return matching.length ? entityOf(matching[0]) : null;
  };
  if (!result || typeof result !== 'object') return null;
  const tree = Array.isArray(result?.branches) ? result : result?.result;
  if (Array.isArray(tree?.branches)) {
    const items = tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
    if (items.length === 1) return entityOf(items[0]);
    return ofActionType(items) || null;
  }
  const createdTree = Array.isArray(result?.created?.branches)
    ? result.created.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error)
    : null;
  if (createdTree) {
    if (createdTree.length === 1) return entityOf(createdTree[0]);
    return ofActionType(createdTree) || null;
  }
  if (result.created) return result.created;
  if (!result.owner) return result.entity || result;
  return null;
}

function displayName(entity = {}) {
  return entity?.name || '';
}
