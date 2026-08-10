import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from './useCutkitDomainUi.js';

/**
 * Returns the effective hierarchy containment contract.
 *
 * When the active process compiles graph-derived lineage bindings, those
 * bindings are authoritative: a connected Compose Lineage block is the only
 * authored parentage source. Without bindings (or outside process mode) the
 * static domain containment registry is used as the fallback so existing
 * screens keep working until their processes are recompiled.
 */
export function useEffectiveContainment() {
  const authStore = useAuthStore();
  const domainUi = useCutkitDomainUi();
  return () => {
    const bindings = authStore.lineageBindings || [];
    if (bindings.length) {
      return bindings.map(binding => ({
        childType: binding.childEntityType,
        parentType: binding.ancestorEntityType,
        lineageKey: binding.lineageKey
      }));
    }
    return domainUi.containment || [];
  };
}
