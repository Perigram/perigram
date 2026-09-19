import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';

// The compiled CTS client bundle as first-class client state. The bundle is
// per-user access projection data: it rides auth hydration
// (`processPayload.bundle`, compiled fresh per request server-side), and
// `refresh()` re-hydrates through the auth store — there is no second
// registry fetch and no client-side compilation. The process designer keeps
// its own overlay-backed bundle view; this store is the runtime consumption
// contract shared by every non-designer surface.
export const useRegistryStore = defineStore('registry', () => {
  const authStore = useAuthStore();
  const bundle = computed(() => authStore.processPayload?.bundle || { types: [] });
  const loaded = computed(() => bundle.value.types?.length > 0);

  const typesById = computed(() => new Map((bundle.value.types || []).map(type => [type.id, type])));

  // Containment triples derived from declared children edges (SPEC §6):
  // { childType, parentType, lineageKey } — the static fallback under
  // compiled lineage bindings.
  const containment = computed(() => {
    const triples = [];
    for (const type of bundle.value.types || []) {
      for (const [key, edge] of Object.entries(type.edges?.children || {})) {
        for (const childType of edge?.types || []) {
          triples.push({ childType, parentType: type.id, lineageKey: key });
        }
      }
    }
    return triples;
  });

  function typeRecord(typeId = '') {
    return typesById.value.get(String(typeId)) || null;
  }

  function statesOf(typeId = '') {
    return typeRecord(typeId)?.states || null;
  }

  function operatorsOf(typeId = '') {
    return typeRecord(typeId)?.operators || {};
  }

  function renderOf(typeId = '') {
    return typeRecord(typeId)?.render || {};
  }

  // Render-policy icons are the single icon source; unknown types keep the
  // adapter-era default so pickers and inline refs never render a blank
  // glyph (class default from `renderPolicyFor`).
  function iconFor(typeId = '') {
    return renderOf(typeId).icon || 'pi pi-circle';
  }

  // Constructibility is declarative: a declared construct operator (species
  // `construct`) on the type. Types without declarations in the bundle are
  // not constructible from the client.
  function constructible(typeId = '') {
    return Object.values(operatorsOf(typeId)).some(operator => operator?.species === 'construct');
  }

  async function refresh() {
    await authStore.setUser();
  }

  return {
    bundle,
    loaded,
    typesById,
    containment,
    typeRecord,
    statesOf,
    operatorsOf,
    renderOf,
    iconFor,
    constructible,
    refresh
  };
});
