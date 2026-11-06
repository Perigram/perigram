import { detailRouteForInstance, instanceIdentifier } from '~/components/generated/instance-detail-routing.js';
import { createdEntity } from '~/utils/instance-run-results.js';

// Where a successfully created entity opens (SPEC §4): the record
// surface, whatever shape it takes for the type.
// 1. the home workspace pane tab — the "everything lives inside home"
//    rule: while the manifest carries a compiled home screen, a create
//    opens (or reuses) the created entity's tab in the same workspace
//    instead of routing out of it; an editor-bound record opens its
//    detail surface, whose body IS the editor (editor-protocol creates
//    included — opening the record is entering it);
// 2. its compiled detail route when no home workspace exists (orgs
//    without a compiled home still get the routed detail surface);
// 3. a toast fallback so a create without any destination is never
//    silent.
// The editor-protocol predicate (SPEC §4): unscoped editor creates open
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
  const hasHomeWorkspace = manifest.some(screen => screen?.template === 'home');
  if (hasHomeWorkspace) {
    return { kind: 'workspace', typeId, instanceId: identifier, name: displayName(entity) };
  }
  const route = detailRouteForInstance({ entity, typeId, screenKey, manifest });
  if (route) return { kind: 'route', route, typeId, instanceId: identifier };
  return { kind: 'toast', typeId, instanceId: identifier, name: displayName(entity) };
}

function displayName(entity = {}) {
  return entity?.name || '';
}
