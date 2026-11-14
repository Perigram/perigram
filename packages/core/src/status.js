export function normalizeStatusLifecycle(lifecycle = {}) {
  const source = lifecycle && typeof lifecycle === 'object' ? lifecycle : {};
  return {
    actors: Array.isArray(source.actors) ? source.actors : [],
    attachments: source.attachments && typeof source.attachments === 'object' ? source.attachments : {},
    data: source.data && typeof source.data === 'object' ? source.data : {}
  };
}

export function normalizeStatusState(state, { region = 'main' } = {}) {
  if (state && typeof state === 'object' && state.schemaVersion === 2) {
    const primary = state.primary || getFirstActiveState(state.active) || 'UNKNOWN';
    const active = normalizeActiveStates(state.active || { [region]: primary });
    const regions = normalizeStateRegions(state.regions || {}, active);
    return {
      schemaVersion: 2,
      primary,
      active,
      regions
    };
  }

  const primary = typeof state === 'string' ? state : String(state || 'UNKNOWN');
  return {
    schemaVersion: 2,
    primary,
    active: { [region]: primary },
    regions: {
      [region]: { state: primary, path: [primary] }
    }
  };
}

export function createStatusState(primary, options = {}) {
  return normalizeStatusState({
    schemaVersion: 2,
    primary,
    active: options.active || { [options.region || 'main']: primary },
    regions: options.regions || {
      [options.region || 'main']: {
        state: primary,
        path: Array.isArray(options.path) && options.path.length ? options.path : [primary]
      }
    }
  });
}

export function getPrimaryState(statusOrState, fallback = 'UNKNOWN') {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return state || fallback;
  if (state && typeof state === 'object') {
    if (typeof state.main === 'string') return state.main || fallback;
    return state.primary || getFirstActiveState(state.active) || fallback;
  }
  return fallback;
}

export function getRegionState(statusOrState, region = 'main', fallback = null) {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return region === 'main' ? state : fallback;
  if (!state || typeof state !== 'object') return fallback;
  return state.active?.[region] || state.regions?.[region]?.state || (region === 'main' ? getPrimaryState(state, fallback) : fallback);
}

export function getStatusRegions(statusOrState) {
  const state = normalizeStatusState(statusOrState?.state ?? statusOrState);
  return Object.entries(state.regions || {}).map(([id, region]) => ({
    id,
    state: region.state || state.active?.[id] || state.primary,
    path: Array.isArray(region.path) ? region.path : [region.state || state.active?.[id] || state.primary],
    label: region.label || id
  }));
}

function normalizeActiveStates(active = {}) {
  return Object.fromEntries(Object.entries(active)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]));
}

function normalizeStateRegions(regions = {}, active = {}) {
  const entries = Object.entries(regions)
    .filter(([key]) => key)
    .map(([key, value]) => {
      const regionState = value?.state || active[key] || 'UNKNOWN';
      return [key, {
        ...(value && typeof value === 'object' ? value : {}),
        state: regionState,
        path: Array.isArray(value?.path) && value.path.length ? value.path : [regionState]
      }];
    });
  const normalized = Object.fromEntries(entries);
  for (const [key, value] of Object.entries(active)) {
    if (!normalized[key]) normalized[key] = { state: value, path: [value] };
  }
  return normalized;
}

function getFirstActiveState(active = {}) {
  return Object.values(active || {}).find(Boolean) || null;
}

const STATUS_EVIDENCE_KEYS = new Set(['userId', 'timestamp', 'metadata', 'eventId', 'lifecycle']);

export function stateAxesFromStorage(states = {}) {
  return Object.fromEntries(Object.entries(states || {})
    .filter(([key, value]) => key && !STATUS_EVIDENCE_KEYS.has(key) && typeof value === 'string' && value));
}

export function statusStateFromStorage(states = {}) {
  const active = stateAxesFromStorage(states);
  if (!Object.keys(active).length) return null;
  const primary = active.main || Object.values(active)[0];
  return {
    schemaVersion: 2,
    primary,
    active,
    regions: Object.fromEntries(Object.entries(active).map(([region, value]) => [region, {
      state: value,
      path: value.split('.').filter(Boolean)
    }]))
  };
}
