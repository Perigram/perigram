import { computed, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';
import { normalizeScreenContract } from '~/packages/processes/src/screen-contract.js';
import { hasProcessRequirement } from '~/utils/process-navigation.js';
import { onEntityChanged } from '~/utils/entity-events.js';
import { filterRootSourceItems } from '~/utils/generated-screen-source.js';

export function useGeneratedScreen(screenRef) {
  const authStore = useAuthStore();
  const { activePermissions } = storeToRefs(authStore);
  const sourceStates = ref({});
  const loading = ref(false);
  const error = ref(null);

  const screen = computed(() => normalizeScreenContract(unrefScreen(screenRef) || {}));

  const visibleSources = computed(() => screen.value.sources.filter(source => canReadSource(source, activePermissions.value)));

  async function load() {
    const sources = visibleSources.value;
    sourceStates.value = Object.fromEntries(sources.map(source => [source.id, emptyState(source)]));
    if (!sources.length) return;

    loading.value = true;
    error.value = null;
    try {
      for (const source of sources) {
        const entityApi = useEntity(source.entityType);
        if (source.mode === 'single') {
          const identifier = resolveSourceIdentifier(source, screen.value);
          if (!identifier) {
            sourceStates.value[source.id] = { ...emptyState(source), error: 'missing-identifier' };
            continue;
          }
          const entity = await entityApi.fetch(identifier, { silent: true });
          sourceStates.value[source.id] = { ...emptyState(source), entity };
          continue;
        }
        const items = await entityApi.list(resolveSourceFilters(source, screen.value));
        const visibleItems = filterRootSourceItems(items, source.rootLineageKeys);
        sourceStates.value[source.id] = { ...emptyState(source), items: visibleItems };
      }
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  watch(screen, () => {
    load();
  }, { immediate: true, deep: true });

  const stopEntityChangeListener = onEntityChanged(({ type }) => {
    if (!type || !visibleSources.value.some(source => source.entityType === type)) return;
    load();
  });

  onUnmounted(() => {
    stopEntityChangeListener();
  });

  function sourceState(sourceId) {
    return sourceStates.value[sourceId] || emptyState({ id: sourceId });
  }

  return {
    screen,
    sourceStates,
    loading,
    error,
    visibleSources,
    load,
    sourceState
  };
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
    || screen.scope?.[`${source.entityType}Id`]
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

function unrefScreen(screenRef) {
  return typeof screenRef === 'function' ? screenRef() : screenRef?.value || screenRef;
}
