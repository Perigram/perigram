import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '~/stores/auth';
import { useEntity } from '~/composables/useEntity';
import { normalizeScreenContract } from '~/packages/processes/src/screen-contract.js';
import { hasProcessRequirement } from '~/utils/process-navigation.js';

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
        sourceStates.value[source.id] = { ...emptyState(source), items };
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

function resolveSourceFilters(source = {}, screen = {}) {
  return resolveValue(source.filters || {}, screen) || {};
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
