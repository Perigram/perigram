// Filter view-state persistence (user UI state): the user's composed
// filter tree per collection scope, stored in localStorage so generated
// surfaces return to it across navigation and reloads. View state is
// presentation data — it layers over the derived contract and is never a
// process contract. Stored trees re-validate through normalizeFilter, so
// a stale or hand-edited entry that no longer speaks the vocabulary
// drops to no-ops instead of failing the surface.
import { normalizeFilter } from '#shared/instance-filters/index.js';

const PREFIX = 'perigram:filter:';

export function loadFilterViewState(scope = '') {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + scope);
    if (!raw) return null;
    return normalizeFilter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storeFilterViewState(scope = '', filter = null) {
  if (!scope || typeof window === 'undefined') return;
  try {
    if (!filter) {
      window.localStorage.removeItem(PREFIX + scope);
      return;
    }
    window.localStorage.setItem(PREFIX + scope, JSON.stringify(filter));
  } catch {
    // Best-effort persistence: a full or blocked storage never breaks
    // filtering.
  }
}
