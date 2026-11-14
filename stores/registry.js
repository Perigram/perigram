import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';
import { useAuthStore } from './auth';
import { createTypeRegistry, projectDomainFromView } from '@perigram/cts';
import { registerDeclarationFieldAccess } from '#shared/instance-field-access.js';

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
  // { childType, parentType, lineageKey } — keyed by the edge's DECLARED
  // lineageKey (stamped at CTS normalize; the map key is authoring
  // identity), so explorer nesting matches the `lineage.<lineageKey>`
  // values instances actually store. The static fallback under
  // compiled lineage bindings.
  const containment = computed(() => {
    const triples = [];
    for (const type of bundle.value.types || []) {
      for (const [key, edge] of Object.entries(type.edges?.children || {})) {
        for (const childType of edge?.types || []) {
          triples.push({
            childType,
            parentType: type.id,
            lineageKey: edge?.lineageKey || key,
            // The declared stamp the process-mode containment filter reads:
            // org-authored edges participate beside compiled lineage
            // bindings, system pack edges stay non-authoritative.
            declared: type.scope === 'org' ? 'org' : 'system'
          });
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

  // Display-policy glyphs are the single icon source; unknown types keep
  // the adapter-era default so pickers and inline refs never render a
  // blank glyph (class default from `renderPolicyFor`).
  function iconFor(typeId = '') {
    return typeRecord(typeId)?.glyph || 'pi pi-circle';
  }

  // Constructibility is declarative: a declared construct operator (species
  // `construct`) on the type. Types without declarations in the bundle are
  // not constructible from the client.
  function constructible(typeId = '') {
    return Object.values(operatorsOf(typeId)).some(operator => operator?.species === 'construct');
  }

  // The compiler-domain projection over the bundle (the same projection the
  // server compiles with): client access previews consume it so the
  // resolver behaves exactly like auth hydration. Best-effort per type —
  // a malformed declaration is skipped, not thrown.
  const projectedDomain = computed(() => {
    const registry = createTypeRegistry({ id: 'client-view' });
    // The bundle serialization carries the organization once at its root;
    // org-scoped types re-take it here so the client registry keys them
    // exactly like the server's own org declarations (`id@org` — a bare
    // type never enters the tenancy view and projects nothing).
    const bundleOrgId = bundle.value.organizationId || null;
    for (const type of bundle.value.types || []) {
      try {
        registry.defineType(type.scope === 'org' && bundleOrgId && !type.organizationId
          ? { ...type, organizationId: bundleOrgId }
          : type);
      } catch {
        continue;
      }
    }
    return projectDomainFromView(registry, authStore.user?.organizationId || null, {});
  });

  // Fact-display access for declared types (Phase 6): the projected field
  // policies of bundle types with no legacy domain entry, re-featured to
  // the class-collection grant the server's instance access engine checks,
  // registered into the shared display-access resolver. One registration
  // per served view; org switches recompute the bundle and re-register.
  watchEffect(() => {
    const classByType = new Map((bundle.value.types || []).map(type => [type.id, type.class]));
    const entries = {};
    for (const [typeId, policy] of Object.entries(projectedDomain.value.fieldAccess || {})) {
      const typeClass = classByType.get(typeId);
      if (!typeClass) continue;
      entries[typeId] = {
        feature: ({ file: 'files', item: 'items', group: 'groups', process: 'processes' })[typeClass] || typeId,
        read: policy.read || [],
        write: policy.write || [],
        admin: policy.admin || []
      };
    }
    registerDeclarationFieldAccess(entries);
  });

  async function refresh() {
    await authStore.setUser();
  }

  return {
    bundle,
    loaded,
    typesById,
    containment,
    typeRecord,
    projectedDomain,
    statesOf,
    operatorsOf,
    iconFor,
    constructible,
    refresh
  };
});
