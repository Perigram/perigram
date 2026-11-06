import { actionAppliesToEntity } from '~/utils/action-visibility.js';

// The inbox surface's rows (SPEC §4): the query's items crossed with live
// pool state. A row renders while its type's list transport has hydrated
// and its instance is pooled (unreadable or deleted instances drop) and
// while the instance's live state still admits at least one of the
// row's actions under the shared per-entity law — action runs reconcile
// rows away through the store's shared entity-event invalidation.
export function deriveInboxRows(items = [], { dtoFor = () => null, actions = {}, hydratedTypes = new Set() } = {}) {
  const rows = [];
  for (const item of items || []) {
    if (!item?.typeId || !item?.instanceId) continue;
    if (!hydratedTypes.has(item.typeId)) continue;
    const dto = dtoFor(item.typeId, item.instanceId);
    if (!dto) continue;
    const admissible = (item.actionIds || [])
      .map(id => actions[id])
      .filter(Boolean)
      .filter(action => actionAppliesToEntity(action, dto, item.typeId));
    if (!admissible.length) continue;
    rows.push({ typeId: item.typeId, instanceId: item.instanceId, dto, actions: admissible });
  }
  return rows;
}
