import { reactive, ref } from 'vue';
import { compileTreeDeclarations, createProcessDesignerContract } from '#packages/processes';
import { createTypeRegistry, projectDomainFromView, renderPolicyFor, frameworkTypes } from '#packages/cts';
import { clearTypeMigrationSteps, declarationPostFailure } from '~/utils/processDesignerTypeMigrations.js';

// The CTS declaration layer's lifecycle: the organization's type registry
// view (system pack extracted from the domain content plus authored org
// types, stored by the cts-types feature), the projected designer contract
// derived from it, and the live tree overlay that folds in-tree
// declarations into both before APPLY persists them. One registry
// generation per overlay signature; caches reset only through
// `resetCtsRegistry`, and every refresh re-derives the designer option
// lists from the same projection the compiler consumes.
//
// Authoring a type happens on the canvas declaration nodes; the canvas
// composes instances.
export function useProcessDesignerTypes({
  nodes,
  edges,
  t,
  toast,
  activeOrganizationId,
  records = () => ({}),
  syncNow = () => {}
}) {
  const ctsOrgTypes = ref([]);
  const servedEditors = ref([]);
  const servedPreviewChannels = ref([]);
  const servedClientEngines = ref([]);
  const servedClientRuntimes = ref([]);
  const servedCommands = ref([]);
  const servedSystemTypes = ref([]);
  const designer = reactive({});
  let designerCapabilities = null;
  let servedDomain = { commands: {}, events: {}, construction: {}, serviceContracts: {} };
  let servedServices = null;
  let ctsRegistryCache = null;
  let ctsDomainCache = null;
  let treeOverlaySignature = '';

  function resetCtsRegistry() {
    ctsRegistryCache = null;
    ctsDomainCache = null;
  }

  // One projection per registry generation: node syncing resolves ports
  // against the same projected domain object instead of rebuilding it per
  // node per pass. The base domain and service list come from the served
  // organization projection (mounted packs + installed plugins — the
  // /api/admin/domain route); before that fetch answers, the documents
  // pack alone seeds the local fallback.
  function ctsProjectedDomain() {
    if (!ctsDomainCache) {
      ctsDomainCache = projectDomainFromView(ctsRegistry(), activeOrganizationId(), servedDomain, {
        packServices: servedServices || []
      });
    }
    return ctsDomainCache;
  }

  // The registry view as the authoring catalog, with constructibility: a
  // type is drag-constructible only when it has a construction contract (org
  // types synthesize one) — derived products (sheet designs, nesting runs)
  // enter graphs as operator outputs, not constructs; framework/meta types
  // (revisions, process definitions, machines) are configuration, never
  // authorable instances. Party types join as flagged read-only entries:
  // legal relation targets and instance-source bindings, never constructs.
  // `via` carries the type's actual default
  // constructor, not a blanket generic.
  function ctsTypeView() {
    const domain = ctsProjectedDomain();
    return ctsRegistry().listTypes(activeOrganizationId())
      .filter(type => !type.framework)
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
          // Authored name (null only for carrier-less stored org types);
          // the designer palette is an authoring surface, so the raw id is
          // the honest fallback there.
          label: policy.name || type.id,
          icon: policy.glyph,
          description: `${type.class} type${payload}`,
          constructible: Boolean(construction),
          via: construction?.defaultMode || (construction?.modes || [])[0] || 'genericCreate',
          // Every declared construct mode: the type catalog lists one
          // variant per mode (creation protocols for payload types).
          modes: [...(construction?.modes || [])],
          constructOperators,
          ...(type.class === 'party' ? { party: true } : {})
        };
      });
  }

  // One joint: rebuild the designer option lists from the registry view.
  // The services group and editor registry come from the served
  // organization projection (SPEC §8/§21: mounted packs and installed
  // plugins). The palette is operation
  // vocabulary only: registry types (pack or organization-declared) are
  // never palette entries — construction happens through the unbound
  // `construct` operation plus a Type pin wire to a class or
  // type-reference node, so construction modes never project items and
  // declaring a type never changes the palette.

  function refreshDesignerFromTypes() {
    const refreshed = createProcessDesignerContract(ctsProjectedDomain(), designerCapabilities, {
      editors: servedEditors.value
    });
    Object.assign(designer, refreshed);
  }

  const designerContract = createProcessDesignerContract(ctsProjectedDomain(), null, {
    editors: servedEditors.value
  });
  Object.assign(designer, {
    ...designerContract
  });

  // The tree is LIVE authoring state, not a draft-to-apply detour: in-tree
  // declarations overlay the registry view immediately, so a construct bound
  // to a class node gains its field sockets the moment a Field node wires
  // in — no apply round trip. APPLY persists the same declarations.
  // Transition-node target statuses ride the records accessor (the draft's
  // processNodes) so the overlay sees statuses authored on transition
  // nodes, not only on state nodes.
  function treeOverlayDeclarations() {
    if (!nodes.value?.some(node => node.type === 'ctsClass')) return [];
    const { declarations } = compileTreeDeclarations(nodes.value, edges.value, records() || {});
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
    // System types: the same composed view the server registry compiles
    // (framework + mounted packs in dependency order) — the designer tree
    // shows every pack type, not only the editors' trio. The installed
    // plugins' system types arrive with the served type view (they have
    // no local composition source) and overlay nothing — their ids are
    // disjoint from the mounted packs'.
    const composedIds = new Set();
    for (const declaration of frameworkTypes) {
      composedIds.add(declaration.id);
      registry.defineType(declaration);
    }
    for (const declaration of servedSystemTypes.value) {
      if (composedIds.has(declaration.id)) continue;
      try {
        registry.defineType(declaration);
      } catch {
        // invalid served declaration: the served view's diagnostics own it
      }
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
  // without the type store when the fetch fails. A refresh re-seats the
  // designer's contract, so nodes already on the canvas re-sync against the
  // new vocabulary (their ports may only resolve once these arrive).
  function loadOrgTypes() {
    return $fetch('/api/admin/cts/types')
      .then(response => {
        ctsOrgTypes.value = (response.types || []).filter(type => type.scope === 'org');
        servedSystemTypes.value = (response.types || []).filter(type => type.scope === 'system');
        servedEditors.value = response.editors || [];
        servedPreviewChannels.value = response.previewChannels || [];
        servedClientEngines.value = response.clientEngines || [];
        servedClientRuntimes.value = response.clientRuntimes || [];
        resetCtsRegistry();
        refreshDesignerFromTypes();
        syncNow();
      })
      .catch(() => {});
  }

  function loadProcessCapabilities() {
    return $fetch('/api/admin/domain')
      .then(response => {
        const capabilities = response?.processCapabilities || null;
        if (!capabilities) return;
        designerCapabilities = capabilities;
        servedDomain = response.domain && typeof response.domain === 'object'
          ? response.domain
          : servedDomain;
        servedServices = Array.isArray(response.services) ? response.services : servedServices;
        servedCommands.value = response.commands || [];
        resetCtsRegistry();
        refreshDesignerFromTypes();
        // The served domain carries the installed plugins' services: a graph
        // loaded before this fetch must re-resolve its service node ports.
        syncNow();
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
  //
  // Every surfaced failure names classes, never raw registry ids: tree
  // class nodes and the org type view supply an id -> authored-label map
  // that rewrites both the failure prefix and the ids embedded in the
  // server's compile messages.
  function classNameMap() {
    const labels = new Map();
    for (const node of nodes.value || []) {
      if (node.type !== 'ctsClass' || !node.data?.typeId) continue;
      const name = String(node.data.name || '').trim();
      if (name) labels.set(node.data.typeId, name);
    }
    for (const type of ctsTypeView()) {
      if (!labels.has(type.id) && type.label) labels.set(type.id, type.label);
    }
    return labels;
  }

  function namedDeclarationFailures(message = '', labels = new Map()) {
    return message.replace(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g, token => (
      labels.has(token) ? `${labels.get(token)} (${token})` : token
    ));
  }

  async function persistTreeDeclarations() {
    const hasClasses = nodes.value.some(node => node.type === 'ctsClass');
    if (!hasClasses) return { failures: [] };
    const { declarations, diagnostics } = compileTreeDeclarations(nodes.value, edges.value, records() || {});
    if (diagnostics.length) {
      toast.add({ severity: 'error', summary: t('processDesigner.declarationErrors'), detail: diagnostics.join('; '), life: 8000 });
    }
    const labels = classNameMap();
    const failures = [];
    for (const declaration of declarations) {
      try {
        await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
        // Declared migration steps are one-time (SPEC §11): the post
        // consumed whatever the class node carried — clear now so the next
        // apply can never re-post a stale step set.
        clearTypeMigrationSteps(nodes.value, declaration.id);
      } catch (error) {
        const name = labels.get(declaration.id) || declaration.id;
        // Structured plan failures keep their shape (the step dialog opens
        // on them); everything else flattens with the real cause.
        failures.push(declarationPostFailure(error, {
          typeId: declaration.id,
          typeName: name,
          labeler: text => namedDeclarationFailures(text, labels)
        }));
      }
    }
    if (failures.length) {
      // A declaration that cannot land in the registry is a broken apply:
      // stop here with the real cause instead of letting validation report
      // downstream phantoms ("unknown type ...").
      for (const failure of failures) {
        // Structured refusals surface in the step dialog and the persistent
        // validation feedback, not as expiring id-soup toasts.
        if (typeof failure !== 'string') continue;
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
    classNameMap,
    ctsOrgTypes,
    servedCommands,
    servedPreviewChannels,
    servedClientEngines,
    servedClientRuntimes,
    resetCtsRegistry,
    refreshTreeOverlay,
    refreshDesignerFromTypes,
    loadOrgTypes,
    loadProcessCapabilities,
    persistTreeDeclarations
  };
}
