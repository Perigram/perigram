// Sort preference persistence (user UI state): the user's last sort choice
// per sortable scope (type id + surface), stored in localStorage so tables
// and card grids return to the chosen order across navigation and reloads.
// The declared default from the list-controls contract applies when no
// preference exists.
const PREFIX = 'cutkit:sort:';

export function loadSortPreference(scope = '') {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.name === 'string' && Number.isFinite(parsed.order)
      ? { name: parsed.name, order: parsed.order }
      : null;
  } catch {
    return null;
  }
}

export function storeSortPreference(scope = '', { name = '', order = 1 } = {}) {
  if (!scope || typeof window === 'undefined' || !name) return;
  try {
    window.localStorage.setItem(PREFIX + scope, JSON.stringify({ name, order }));
  } catch {
    // Best-effort persistence: a full or blocked storage never breaks sorting.
  }
}
