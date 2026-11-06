import { isCreateAction } from '~/utils/action-visibility.js';

// The create palette's groups (SPEC §4): every compiled create action the
// user may run, grouped by type label through the caller's one
// type-label chain; entries keep the manifest's procedural create label
// (the projection applies the create-label law). One search string
// filters by type label and action label — a type-label match keeps the
// whole group.
export function createPaletteGroups(actions = [], { query = '', typeLabelOf = () => '' } = {}) {
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
    items: entries.map(action => ({ typeId, label: action.label || action.id, action }))
  }));
  const filtered = needle
    ? groups
      .map(group => (group.label.toLowerCase().includes(needle)
        ? group
        : { ...group, items: group.items.filter(item => item.label.toLowerCase().includes(needle)) }))
      .filter(group => group.items.length)
    : groups;
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}
