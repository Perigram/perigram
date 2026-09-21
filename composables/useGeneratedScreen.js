import { computed, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRequestHeaders } from '#app';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { hasProcessRequirement } from '~/utils/process-navigation.js';
import { onEntityChanged } from '~/utils/entity-events.js';
import { filterRootSourceItems } from '~/utils/generated-screen-source.js';

export function useGeneratedScreen(screenRef) {
  const authStore = useAuthStore();
  const instances = useInstancesStore();
  const { activePermissions } = storeToRefs(authStore);
  const sourceStates = ref({});
  const loading = ref(false);
  const error = ref(null);
  let loadSequence = 0;
  let refreshTimer = null;

  // Hydration ships projected screens (typeId vocabulary, normalized
  // server-side); the client reads them as-is — no second normalizer.
  const screen = computed(() => unrefScreen(screenRef) || {});

  const visibleSources = computed(() => screen.value.sources.filter(source => canReadSource(source, activePermissions.value)));

  function sourceTypeKey(source = {}) {
    return instances.canonicalTypeKey(source.typeId || '');
  }

  async function load({ initial = false } = {}) {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    const sequence = ++loadSequence;
    const sources = visibleSources.value;
    if (!sources.length) {
      sourceStates.value = {};
      loading.value = false;
      return;
    }

    const firstLoad = initial || !sources.some(source => sourceStates.value[source.id]);
    if (firstLoad) loading.value = true;
    if (firstLoad) error.value = null;
    try {
      const fetchOptions = entityFetchOptions();
      const loaded = await Promise.all(sources.map(async source => {
        const typeKey = sourceTypeKey(source);
        if (source.mode === 'single') {
          const identifier = resolveSourceIdentifier(source, screen.value);
          if (!identifier) {
            return [source.id, { ...emptyState(source), error: 'missing-identifier' }];
          }
          const entity = await instances.fetchInstance(typeKey, identifier, { fetchOptions });
          return [source.id, { ...emptyState(source), entity }];
        }
        const items = await instances.listInstances(typeKey, resolveSourceFilters(source, screen.value), { fetchOptions });
        return [source.id, { ...emptyState(source), items }];
      }));
      if (sequence !== loadSequence) return;
      sourceStates.value = Object.fromEntries(loaded);
      error.value = null;
    } catch (err) {
      if (sequence === loadSequence && firstLoad) error.value = err;
    } finally {
      if (sequence === loadSequence) loading.value = false;
    }
  }

  watch(screen, () => {
    sourceStates.value = {};
    load({ initial: true });
  }, { immediate: true, deep: true });

  const stopEntityChangeListener = onEntityChanged(change => {
    if (!entityChangeAffectsSources(change, visibleSources.value, screen.value)) return;
    if (change.change === 'deleted') {
      removeEntitySnapshot(change.type, change.id);
      return;
    }
    if (change.entity) {
      applyEntitySnapshot(change.type, change.entity);
      return;
    }
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      load();
    }, 80);
  });

  onUnmounted(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    stopEntityChangeListener();
  });

  function sourceState(sourceId) {
    const state = sourceStates.value[sourceId] || emptyState({ id: sourceId });
    if (state.source?.mode === 'single' || screen.value.template !== 'home') return state;
    return {
      ...state,
      rawItems: state.items,
      items: filterRootSourceItems(state.items, state.source, sourceStates.value)
    };
  }

  function applyEntitySnapshot(typeId, entity = null) {
    const id = entity?._id?.toString?.() || entity?._id || entity?.identity?.uid?.toString?.() || entity?.identity?.uid;
    if (!typeId || !id || !entity) return;
    sourceStates.value = Object.fromEntries(Object.entries(sourceStates.value).map(([sourceId, state]) => {
      if (state.source?.typeId !== typeId) return [sourceId, state];
      if (state.source.mode === 'single') {
        const sourceIdValue = resolveSourceIdentifier(state.source, screen.value);
        return String(sourceIdValue) === String(id) ? [sourceId, { ...state, entity }] : [sourceId, state];
      }
      const index = (state.items || []).findIndex(item => String(item?._id || item?.identity?.uid) === String(id));
      if (index < 0) {
        return entityMatchesSource(entity, state.source, screen.value)
          ? [sourceId, { ...state, items: [...(state.items || []), entity] }]
          : [sourceId, state];
      }
      const items = [...state.items];
      items[index] = entity;
      return [sourceId, { ...state, items }];
    }));
  }

  function removeEntitySnapshot(typeId, id) {
    if (!typeId || !id) return;
    sourceStates.value = Object.fromEntries(Object.entries(sourceStates.value).map(([sourceId, state]) => {
      if (state.source?.typeId !== typeId || state.source.mode === 'single') return [sourceId, state];
      return [sourceId, {
        ...state,
        items: (state.items || []).filter(item => String(item?._id || item?.identity?.uid) !== String(id))
      }];
    }));
  }

  return {
    screen,
    sourceStates,
    loading,
    error,
    visibleSources,
    load,
    applyEntitySnapshot,
    sourceState
  };
}

function entityMatchesSource(entity = {}, source = {}, screen = {}) {
  const filters = resolveSourceFilters(source, screen);
  return Object.entries(filters).every(([path, expected]) => {
    if (path === 'primaryStatus') return entity.status?.state?.primary === expected;
    if (path === 'primaryStatuses') return String(expected).split(',').includes(entity.status?.state?.primary);
    if (expected && typeof expected === 'object') return false;
    const actual = path.split('.').reduce((value, key) => value?.[key], entity);
    return String(actual ?? '') === String(expected ?? '');
  });
}

function entityChangeAffectsSources(change = {}, sources = [], screen = {}) {
  if (!change.type) return false;
  return sources.some(source => {
    if (source.typeId !== change.type) return false;
    if (source.mode !== 'single' || !change.id) return true;
    return String(resolveSourceIdentifier(source, screen)) === String(change.id);
  });
}

function canReadSource(source = {}, permissions = {}) {
  const requirement = source.required || {};
  return hasProcessRequirement({ permissions, requirement });
}

function emptyState(source = {}) {
  return {
    source,
    entity: null,
    items: [],
    error: null
  };
}

function resolveSourceIdentifier(source = {}, screen = {}) {
  return resolveValue(source.identifier, screen)
    || screen.scope?.entityId
    || screen.scope?.[`${source.typeId}Id`]
    || '';
}

export function resolveSourceFilters(source = {}, screen = {}) {
  const filters = resolveValue(source.filters || {}, screen) || {};
  const statuses = statusFiltersFromRequirement(source.required || screen.required || {});
  if (!statuses.length) return filters;
  if (statuses.length === 1) return { ...filters, primaryStatus: statuses[0] };
  return { ...filters, primaryStatuses: statuses.join(',') };
}

function statusFiltersFromRequirement(requirement = {}) {
  return [...new Set(statusesFromRule(requirement.rule))];
}

function statusesFromRule(rule) {
  if (!rule || typeof rule !== 'object') return [];
  if (Array.isArray(rule)) return rule.flatMap(statusesFromRule);
  if (Array.isArray(rule.any)) return rule.any.flatMap(statusesFromRule);
  if (Array.isArray(rule.all)) return rule.all.flatMap(statusesFromRule);
  if (rule.not) return [];
  if ((rule.fact === 'primaryStatus' || rule.fact === 'status.primary') && rule.equals) return [String(rule.equals)];
  if ((rule.fact === 'primaryStatus' || rule.fact === 'status.primary') && Array.isArray(rule.in)) return rule.in.map(String);
  return [];
}

function resolveValue(value, screen = {}) {
  if (Array.isArray(value)) return value.map(item => resolveValue(item, screen));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, screen)]));
  }
  if (typeof value !== 'string' || !value.startsWith('$screen.')) return value;
  return getByPath(screen, value.slice('$screen.'.length));
}

function getByPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function entityFetchOptions(options = {}) {
  if (!import.meta.server) return options;
  return {
    ...options,
    headers: {
      ...useRequestHeaders(['cookie']),
      ...(options.headers || {})
    }
  };
}

function unrefScreen(screenRef) {
  return typeof screenRef === 'function' ? screenRef() : screenRef?.value || screenRef;
}
