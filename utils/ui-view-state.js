// Per-scope UI view-state persistence (user presentation data layered
// over the derived contract): one localStorage mechanism behind the sort,
// filter, and projection preferences generated collection surfaces persist
// per type. Storage stays best-effort, and every reader validates what it
// revives — a stale or hand-edited entry drops to no-ops.
function readScoped(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : raw;
  } catch {
    return null;
  }
}

function writeScoped(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence.
  }
}

// --- Sort -------------------------------------------------------------------

// The user's last sort choice per sortable scope (type id + surface); the
// declared default from the list-controls contract applies when no
// preference exists.
const SORT_PREFIX = 'perigram:sort:';

export function loadSortPreference(scope = '') {
  const raw = readScoped(SORT_PREFIX + scope);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.name === 'string' && Number.isFinite(parsed.order)
      ? { name: parsed.name, order: parsed.order }
      : null;
  } catch {
    return null;
  }
}

export function storeSortPreference(scope = '', { name = '', order = 1 } = {}) {
  if (!name) return;
  writeScoped(SORT_PREFIX + scope, JSON.stringify({ name, order }));
}

// --- Projection -------------------------------------------------------------

// The user's last board/table choice per collection type; the preference
// never widens the switchable pair (a type without a served state
// vocabulary ignores a stored 'board' value).
const PROJECTION_PREFIX = 'perigram:projection:';

export function loadProjectionPreference(scope = '') {
  const raw = readScoped(PROJECTION_PREFIX + scope);
  return raw === 'board' || raw === 'table' ? raw : null;
}

export function storeProjectionPreference(scope = '', projection = '') {
  if (projection !== 'board' && projection !== 'table') return;
  writeScoped(PROJECTION_PREFIX + scope, projection);
}

// --- Field selection --------------------------------------------------------

// The user's explicit column set per collection scope (SPEC §26 view
// setup): the keys a view shows; absent means the derived budget decides.
const FIELDS_PREFIX = 'perigram:fields:';

export function loadFieldPreference(scope = '') {
  const raw = readScoped(FIELDS_PREFIX + scope);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(key => typeof key === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function storeFieldPreference(scope = '', keys = null) {
  if (!Array.isArray(keys)) {
    writeScoped(FIELDS_PREFIX + scope, null);
    return;
  }
  writeScoped(FIELDS_PREFIX + scope, JSON.stringify(keys));
}

// --- Filter trees -----------------------------------------------------------

// The user's composed filter tree per collection scope. Stored trees
// re-validate through normalizeFilter, so entries that no longer speak the
// vocabulary drop to no-ops.
import { normalizeFilter } from '#shared/instance-filters/index.js';

const FILTER_PREFIX = 'perigram:filter:';

export function loadFilterViewState(scope = '') {
  const raw = readScoped(FILTER_PREFIX + scope);
  if (raw === null) return null;
  try {
    return normalizeFilter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function storeFilterViewState(scope = '', filter = null) {
  writeScoped(FILTER_PREFIX + scope, filter ? JSON.stringify(filter) : null);
}
