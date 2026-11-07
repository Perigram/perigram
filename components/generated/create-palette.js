import { isCreateAction } from '~/utils/action-visibility.js';

// The create palette's groups (SPEC §4): every compiled create action the
// user may run, grouped by type label through the caller's one
// type-label chain; entries label through the caller's create-caption
// chain (the projection applies the create-label law). One search string
// filters by type label and action label — a type-label match keeps the
// whole group. `pinnedGroup` (the New page entry) rides above the type
// groups under the same needle.
export function createPaletteGroups(actions = [], { query = '', typeLabelOf = () => '', actionLabelOf = action => action.label || action.id, pinnedGroup = null } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  const byType = new Map();
  for (const action of actions || []) {
    if (!isCreateAction(action) || !action.typeId) continue;
    const list = byType.get(action.typeId) || [];
    list.push(action);
    byType.set(action.typeId, list);
  }
  const groups = [...byType.entries()].map(([typeId, entries]) => ({
    label: typeLabelOf(typeId),
    typeId,
    items: entries.map(action => ({ typeId, label: actionLabelOf(action), action }))
  }));
  const needleMatches = group => (group.label.toLowerCase().includes(needle)
    ? group
    : { ...group, items: group.items.filter(item => item.label.toLowerCase().includes(needle)) });
  const filtered = needle
    ? groups.map(needleMatches).filter(group => group.items.length)
    : groups;
  const sorted = filtered.sort((a, b) => a.label.localeCompare(b.label));
  if (!pinnedGroup) return sorted;
  const pinned = needle ? [needleMatches(pinnedGroup)].filter(group => group.items.length) : [pinnedGroup];
  return [...pinned, ...sorted];
}
