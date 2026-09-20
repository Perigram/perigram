import { ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

// Organization-scoped cached read of the served CTS type view
// (GET /api/admin/cts/types). One in-flight fetch per organization is
// shared by every consumer; components resolve type records by id and
// derive editor bindings and payload preview policy from declarations
// instead of hardcoded entity tables. The cache never serves another
// organization's view after an org switch.
const cache = new Map();

async function fetchTypeView(organizationId) {
  const response = await $fetch('/api/admin/cts/types');
  return {
    types: response.types || [],
    editors: response.editors || []
  };
}

export function useFileTypeView() {
  const authStore = useAuthStore();
  const organizationId = authStore.user?.organizationId || null;
  const cacheKey = organizationId ? String(organizationId) : 'system';

  if (!cache.has(cacheKey)) {
    const entry = { types: ref([]), editors: ref([]), loaded: ref(false), promise: null };
    cache.set(cacheKey, entry);
    entry.promise = fetchTypeView(organizationId)
      .then((view) => {
        entry.types.value = view.types;
        entry.editors.value = view.editors;
        entry.loaded.value = true;
      })
      .catch(() => {
        // Consumers keep their declaration-less fallbacks (no preview,
        // no editor surface) when the view cannot be loaded.
        entry.loaded.value = true;
      });
  }

  const entry = cache.get(cacheKey);

  function typeById(typeId = '') {
    return entry.types.value.find(type => type.id === typeId) || null;
  }

  return {
    types: entry.types,
    editors: entry.editors,
    loaded: entry.loaded,
    typeById
  };
}
