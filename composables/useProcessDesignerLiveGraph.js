import { computed, watch } from 'vue';
import { interpretDeclarationEdges } from '~/packages/processes/src/designer.js';

// The designer's live evaluation loop. Authoring state (canvas nodes minus
// presentation, edges, draft records) folds into one semantic signature;
// any change of that signature re-runs wire interpretation and the page's
// sync pass in the same tick — bindings, ports, palette options, and the
// tree overlay all follow. Position drags and selection churn never
// re-evaluate because the signature excludes them, and derived rewrites
// with identical content never re-trigger (the string is unchanged), so
// the loop converges instead of oscillating.
//
// Contract with the page:
// - `apply(mutations)` writes interpretation results and re-syncs every
//   dependent surface (tree overlay, registry, ports, palette options).
// - `resolveEntityBinding(recordId)` supplies the entity-input source type
//   of one record from the designer's port resolution, so plugging an
//   entity stream into an unbound consumer species (no Type pin) adapts
//   it to that type live.
// - `knownTypeIds` (array or getter) names every type the binding may
//   resolve to: the registry view. A binding to none of them is dangling
//   (its class left the tree in an earlier session) and is cleared.
// - `evaluateNow()` runs one pass synchronously (connect handlers want
//   instant feedback before the next gesture).
export function useProcessDesignerLiveGraph({ nodes, edges, draft, apply, resolveEntityBinding = null, knownTypeIds = null }) {
  let bindings = {};

  const signature = computed(() => JSON.stringify({
    nodes: (nodes.value || []).map(semanticNode),
    edges: (edges.value || []).map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      role: edge.role,
      label: edge.label,
      data: edge.data
    })),
    data: draft.value?.data ?? null
  }));

  function runPass() {
    const { mutations, bindings: nextBindings } = interpretDeclarationEdges(
      nodes.value || [],
      edges.value || [],
      draft.value?.data?.processNodes || {},
      bindings,
      resolveEntityBinding ? { entityInputType: resolveEntityBinding } : {},
      typeof knownTypeIds === 'function' ? knownTypeIds() : knownTypeIds || []
    );
    bindings = nextBindings;
    // Apply unconditionally: interpretation mutations are only the
    // declaration-level diffs. Renames, descriptor edits, and payload
    // changes alter no binding yet still require the sync pass — the
    // signature gate is what makes this converge.
    apply(mutations);
    return mutations;
  }

  watch(signature, () => runPass(), { flush: 'post', immediate: true });

  // Wire-binding memory is graph-local: switching drafts must not unbind
  // records whose ids coincidentally match the previous graph.
  function reset() {
    bindings = {};
  }

  return { evaluateNow: runPass, reset };
}

// Canvas projection for the signature: identity plus authored data.
// Presentation-only keys the sync pass rewrites (derived option lists,
// port specs, record references) are excluded — their content follows
// authoring state deterministically and re-including them would only
// make the signature more expensive.
function semanticNode(node) {
  const data = node.data || {};
  return {
    id: node.id,
    type: node.type,
    data: {
      refId: data.refId,
      typeId: data.typeId,
      class: data.class,
      name: data.name,
      value: data.value,
      descriptor: data.descriptor,
      initial: data.initial,
      terminal: data.terminal,
      payload: data.payload,
      operators: data.operators,
      label: typeof data.label === 'string' ? data.label : undefined
    }
  };
}
