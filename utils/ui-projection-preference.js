// Projection preference persistence (user UI state): the user's last
// board/table choice per collection type, stored in localStorage so list
// surfaces return to the chosen projection across navigation and reloads.
// The resolver-derived layout applies when no preference exists; the
// preference never widens the switchable pair (a type without a served
// state vocabulary ignores a stored 'board' value).
const PREFIX = 'perigram:projection:';

export function loadProjectionPreference(scope = '') {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + scope);
    return raw === 'board' || raw === 'table' ? raw : null;
  } catch {
    return null;
  }
}

export function storeProjectionPreference(scope = '', projection = '') {
  if (!scope || typeof window === 'undefined') return;
  if (projection !== 'board' && projection !== 'table') return;
  try {
    window.localStorage.setItem(PREFIX + scope, projection);
  } catch {
    // Best-effort persistence: a full or blocked storage never breaks the view.
  }
}
