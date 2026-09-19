import { reactive, ref } from 'vue';
import { compileTreeDeclarations, createProcessDesignerContract, typeCatalogPaletteGroups } from '~/packages/processes/src/index.js';
import { createTypeRegistry, projectDomainFromView, renderPolicyFor, frameworkTypes } from '~/packages/cts/src/index.js';

// The CTS declaration layer's lifecycle: the organization's type registry
// view (system pack extracted from the domain content plus authored org
// types, stored by the cts-types feature), the projected designer contract
// derived from it, and the live tree overlay that folds in-tree
// declarations into both before APPLY persists them. One registry
// generation per overlay signature; caches reset only through
// `resetCtsRegistry`, and every refresh re-derives the designer option
// lists from the same projection the compiler consumes.
//
// Authoring a type happens in the types pane (pages/organization/types.vue)
// or on the canvas declaration nodes; the canvas composes instances.
export function useProcessDesignerTypes({
  nodes,
  edges,
  t,
  toast,
  activeOrganizationId,
  baseDomain,
  packContent,
  syncNow = () => {}
}) {
  const ctsOrgTypes = ref([]);
  const designer = reactive({});
  let designerCapabilities = null;
  let ctsRegistryCache = null;
  let ctsDomainCache = null;
  let treeOverlaySignature = '';

  function resetCtsRegistry() {
    ctsRegistryCache = null;
    ctsDomainCache = null;
  }

  // One projection per registry generation: node syncing resolves ports
  // against the same projected domain object instead of rebuilding it per
  // node per pass.
  function ctsProjectedDomain() {
    if (!ctsDomainCache) {
      ctsDomainCache = projectDomainFromView(ctsRegistry(), activeOrganizationId(), baseDomain, {
        packServices: packContent.services
      });
    }
    return ctsDomainCache;
  }

  // The registry view as the authoring catalog, with constructibility: a
  // type is drag-constructible only when it has a construction contract (org
  // types synthesize one) — derived products (sheet designs, nesting runs)
  // enter graphs as operator outputs, not constructs; framework/meta types
  // (revisions, process definitions, machines) are configuration, never
  // authorable instances. `via` carries the type's actual default
  // constructor, not a blanket generic.
  function ctsTypeView() {
    const domain = ctsProjectedDomain();
    return ctsRegistry().listTypes(activeOrganizationId())
      .filter(type => type.class !== 'party')
      .map(type => {
        const policy = renderPolicyFor(type);
        // Synthesized entities and construction are keyed by the type id —
        // the projection has no legacy casing variants.
        const construction = domain.construction?.[type.id] || null;
        const payload = type.payload?.mime ? ` · ${[].concat(type.payload.mime).join(', ')}` : '';
        const constructOperators = Object.values(type.operators || {})
          .filter(operator => operator.species === 'construct')
          .map(operator => operator.id);
        return {
          id: type.id,
          class: type.class,
          label: policy.label,
          icon: policy.icon,
          description: `${type.class} type${payload}`,
          constructible: Boolean(construction),
          via: construction?.defaultMode || (construction?.modes || [])[0] || 'genericCreate',
          constructOperators
        };
      });
  }

  // One joint: rebuild the designer option lists from the registry view.
  // The services group and editor registry come from the mounted pack's
  // operator registrations (SPEC §8/§21). The type catalog lives inside the
  // Types group (SPEC §20/§21 L2): declaration authoring first, then one
  // bound construct per constructible registry type plus one variant per
  // declared construct operator.
  function paletteWithTypeCatalog(contract) {
    const catalogItems = typeCatalogPaletteGroups(ctsTypeView())[0]?.items || [];
    return contract.paletteGroups.map(group => (
      group.id === 'types' ? { ...group, items: [...group.items, ...catalogItems] } : group
    ));
  }

  function refreshDesignerFromTypes() {
    const refreshed = createProcessDesignerContract(ctsProjectedDomain(), designerCapabilities, {
      editors: packContent.editors
    });
    Object.assign(designer, refreshed);
    designer.paletteGroups = paletteWithTypeCatalog(refreshed);
  }

  const designerContract = createProcessDesignerContract(ctsProjectedDomain(), null, {
    editors: packContent.editors
  });
  Object.assign(designer, {
    ...designerContract,
    paletteGroups: paletteWithTypeCatalog(designerContract)
  });

  // The tree is LIVE authoring state, not a draft-to-apply detour: in-tree
  // declarations overlay the registry view immediately, so a construct bound
  // to a class node gains its field sockets the moment a Field node wires
  // in — no apply round trip. APPLY persists the same declarations.
  function treeOverlayDeclarations() {
    if (!nodes.value?.some(node => node.type === 'ctsClass')) return [];
    const { declarations } = compileTreeDeclarations(nodes.value, edges.value);
    return declarations;
  }

  function refreshTreeOverlay() {
    const signature = JSON.stringify(treeOverlayDeclarations());
    if (signature === treeOverlaySignature) return;
    treeOverlaySignature = signature;
    resetCtsRegistry();
    refreshDesignerFromTypes();
  }

  function ctsRegistry() {
    if (ctsRegistryCache) return ctsRegistryCache;
    const registry = createTypeRegistry({ id: 'designer-cts' });
    // System types: framework party declarations plus mounted pack types
    // (SPEC §21). No converted legacy entity tables.
    for (const declaration of [...frameworkTypes, ...packContent.types]) {
      registry.defineType(declaration);
    }
    for (const declaration of ctsOrgTypes.value) {
      registry.defineType(declaration);
    }
    // Live tree declarations overlay the posted org types (same ids update
    // in place; invalid ones are skipped — save/apply surfaces them).
    for (const declaration of treeOverlayDeclarations()) {
      try {
        registry.defineType({ ...declaration, scope: 'org', organizationId: activeOrganizationId() });
      } catch {
        // invalid tree state: the declaration diagnostics own the report
      }
    }
    ctsRegistryCache = registry;
    return registry;
  }

  // The org's stored declarations overlay the pack-seeded system types
  // (defining a bundle-shaped system record over the pack would drift the
  // client view from the server registry); the designer keeps compiling
  // without the type store when the fetch fails.
  function loadOrgTypes() {
    return $fetch('/api/admin/cts/types')
      .then(response => {
        ctsOrgTypes.value = (response.types || []).filter(type => type.scope === 'org');
        resetCtsRegistry();
        refreshDesignerFromTypes();
      })
      .catch(() => {});
  }

  function loadProcessCapabilities() {
    return $fetch('/api/admin/domain')
      .then(response => {
        const capabilities = response?.processCapabilities || null;
        if (!capabilities) return;
        designerCapabilities = capabilities;
        refreshDesignerFromTypes();
      })
      .catch(() => {
        // keep the domain-derived options when the projection cannot be loaded
      });
  }

  // Declarations authored in the tree compile into registry types before the
  // process saves (SPEC §20/§21: one tree, declarations are nodes). Valid
  // declarations post to the registry; named diagnostics surface as errors
  // without blocking — activation still fails closed through
  // checkDeclarationsAgainstCts and the registry compile. After the registry
  // refresh, canvas nodes re-sync so constructs bound to just-authored types
  // immediately gain their typed row-field sockets. This runs on APPLY, not
  // on save: saving persists the tree with the draft; applying compiles it.
  async function persistTreeDeclarations() {
    const hasClasses = nodes.value.some(node => node.type === 'ctsClass');
    if (!hasClasses) return { failures: [] };
    const { declarations, diagnostics } = compileTreeDeclarations(nodes.value, edges.value);
    if (diagnostics.length) {
      toast.add({ severity: 'error', summary: t('processDesigner.declarationErrors'), detail: diagnostics.join('; '), life: 8000 });
    }
    const failures = [];
    for (const declaration of declarations) {
      try {
        await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
      } catch (error) {
        failures.push(`${declaration.id}: ${error?.data?.message || error?.message}`);
      }
    }
    if (failures.length) {
      // A declaration that cannot land in the registry is a broken apply:
      // stop here with the real cause instead of letting validation report
      // downstream phantoms ("unknown type ...").
      for (const failure of failures) {
        toast.add({ severity: 'error', summary: t('processDesigner.declarationErrors'), detail: failure, life: 10000 });
      }
      return { failures };
    }
    ctsOrgTypes.value = (await $fetch('/api/admin/cts/types')).types.filter(type => type.scope === 'org');
    resetCtsRegistry();
    refreshDesignerFromTypes();
    syncNow();
    return { failures: [] };
  }

  return {
    designer,
    ctsRegistry,
    ctsProjectedDomain,
    ctsTypeView,
    resetCtsRegistry,
    refreshTreeOverlay,
    refreshDesignerFromTypes,
    loadOrgTypes,
    loadProcessCapabilities,
    persistTreeDeclarations
  };
}
