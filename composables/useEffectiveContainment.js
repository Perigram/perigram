import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';

/**
 * Returns the effective hierarchy containment contract.
 *
 * Active processes merge both hierarchy sources, keyed by child+parent
 * pair: compiled lineage bindings (graph-authored composition) are
 * authoritative, declared containment — the org's children edges in the
 * registry bundle — fills every pair the graph never composed. Without a
 * process, the declared registry containment stands alone.
 */
export function useEffectiveContainment() {
  const authStore = useAuthStore();
  const registry = useRegistryStore();
  return () => {
    const bindings = (authStore.lineageBindings || []).map(binding => ({
      childType: binding.childTypeId,
      parentType: binding.parentTypeId,
      lineageKey: binding.lineageKey
    }));
    if (!authStore.processActive) return registry.containment;
    const byPair = new Map();
    for (const triple of registry.containment) {
      // Org-authored children edges participate beside compiled bindings;
      // system pack containment stays non-authoritative in process mode.
      if (triple.declared !== 'org') continue;
      byPair.set(`${triple.childType}:${triple.parentType}`, triple);
    }
    for (const triple of bindings) {
      byPair.set(`${triple.childType}:${triple.parentType}`, triple);
    }
    return [...byPair.values()];
  };
}
