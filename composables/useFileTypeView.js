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
  if (!organizationId) return { types: [], editors: [], surfaces: [], previews: [] };
  const response = await $fetch('/api/admin/cts/types');
  return {
    types: response.types || [],
    editors: response.editors || [],
    surfaces: response.surfaces || [],
    previews: response.previews || []
  };
}

export function useFileTypeView() {
  const authStore = useAuthStore();
  const organizationId = authStore.user?.organizationId || null;
  const cacheKey = organizationId ? String(organizationId) : 'system';

  if (!cache.has(cacheKey)) {
    const entry = { types: ref([]), editors: ref([]), surfaces: ref([]), previews: ref([]), loaded: ref(false), promise: null };
    entry.refresh = () => fetchTypeView(organizationId).then((view) => {
      entry.types.value = view.types;
      entry.editors.value = view.editors;
      entry.surfaces.value = view.surfaces;
      entry.previews.value = view.previews;
      entry.loaded.value = true;
      return view;
    });
    cache.set(cacheKey, entry);
    entry.promise = entry.refresh()
      .catch(() => {
        // Consumers keep their declaration-less fallbacks (no preview,
        // no editor surface) when the view cannot be loaded, and the
        // failed entry is dropped so the next consumer retries instead
        // of serving an empty view for the rest of the session.
        entry.loaded.value = true;
        cache.delete(cacheKey);
      });
  }

  const entry = cache.get(cacheKey);

  // Bundle ids are kebab CTS ids; callers hold kebab, snake, or legacy
  // camel spellings of the same type. One normalization home for the
  // display seam.
  const kebab = (value) => String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

  function typeById(typeId = '') {
    const exact = entry.types.value.find(type => type.id === typeId);
    if (exact || !typeId) return exact || null;
    const normalized = kebab(typeId);
    return entry.types.value.find(type => type.id === normalized) || null;
  }

  return {
    types: entry.types,
    editors: entry.editors,
    surfaces: entry.surfaces,
    previews: entry.previews,
    loaded: entry.loaded,
    typeById,
    refresh: entry.refresh
  };
}

// The contract-change seam: served declarations are the input of every
// open screen's editor and surface resolution, so the organization's
// cached view refreshes in place; mounted consumers hold the entry refs
// and see the new declarations through normal reactivity.
export async function refreshFileTypeView(organizationId = '') {
  const entry = cache.get(organizationId ? String(organizationId) : 'system');
  if (!entry) return null;
  return await entry.refresh().catch(() => null);
}
