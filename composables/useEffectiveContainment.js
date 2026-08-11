import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from './useCutkitDomainUi.js';

/**
 * Returns the effective hierarchy containment contract.
 *
 * Active processes use only graph-derived lineage bindings. Static domain
 * containment remains available outside process mode for non-authored legacy
 * application routes, but it never creates process hierarchy.
 */
export function useEffectiveContainment() {
  const authStore = useAuthStore();
  const domainUi = useCutkitDomainUi();
  return () => {
    const bindings = authStore.lineageBindings || [];
    if (authStore.processActive) {
      return bindings.map(binding => ({
        childType: binding.childEntityType,
        parentType: binding.ancestorEntityType,
        lineageKey: binding.lineageKey
      }));
    }
    return domainUi.containment || [];
  };
}
