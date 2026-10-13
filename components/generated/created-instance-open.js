import { detailRouteForInstance, instanceIdentifier } from '~/components/generated/instance-detail-routing.js';
import { createdEntity } from '~/utils/instance-run-results.js';

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

function displayName(entity = {}) {
  return entity?.name || '';
}
