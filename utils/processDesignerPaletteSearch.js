// One search contract for the canvas dock and socket-context palette.
// Indexes user-facing copy, stable operation identity, provider/group ids,
// and provider-authored aliases without changing what the palette displays.
export function matchesPaletteSearch(item = {}, query = '', groupId = '') {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return true;
  const terms = [
    item.label,
    item.description,
    item.id,
    item.kind,
    groupId,
    ...(Array.isArray(item.keywords) ? item.keywords : []),
    ...(Array.isArray(item.searchTerms) ? item.searchTerms : [])
  ];
  return terms.some(term => String(term || '').toLocaleLowerCase().includes(needle));
}
