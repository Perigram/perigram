// Palette section views: subgroups when the section declares them, with
// the section's root items (those outside every subgroup) as the leading
// unlabeled part. Shared by the palette dock popover and the context
// palette so one section shape renders everywhere.
export function paletteSectionView(group = {}) {
  const subgroups = Array.isArray(group.subgroups)
    ? group.subgroups.filter(subgroup => subgroup.items?.length)
    : [];
  if (!subgroups.length) return { rootItems: group.items || [], subgroups: [] };
  const grouped = new Set(subgroups.flatMap(subgroup => subgroup.items.map(item => item.id)));
  return {
    rootItems: (group.items || []).filter(item => !grouped.has(item.id)),
    subgroups
  };
}

export function paletteSectionParts(group = {}) {
  const { rootItems, subgroups } = paletteSectionView(group);
  return [
    { label: '', items: rootItems },
    ...subgroups.map(subgroup => ({ label: subgroup.label, items: subgroup.items }))
  ].filter(part => part.items.length);
}

export function filterPaletteSections(groups = [], matches) {
  return (groups || [])
    .map(group => ({
      id: group.id,
      label: group.label,
      parts: paletteSectionParts(group)
        .map(part => ({ ...part, items: part.items.filter(item => matches(item, group)) }))
        .filter(part => part.items.length)
    }))
    .filter(section => section.parts.length);
}
