import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { containmentAncestors, hierarchyTypeAlias } from '~/utils/instance-hierarchy.js';

export const useTraceability = () => {
    const authStore = useAuthStore();
    const instances = useInstancesStore();

    function effectiveContainment() {
        const bindings = authStore.lineageBindings || [];
        if (authStore.processActive) {
            return bindings.map(binding => ({
                childType: binding.childTypeId,
                parentType: binding.parentTypeId,
                lineageKey: binding.lineageKey
            }));
        }
        return [];
    }

    /**
     * Resolves the full ancestry chain for an entity.
     * @param {string} type - Entity type
     * @param {object} entity - Entity data
     * @returns {Promise<Array>} - Array of { type, id, label, slug, data }
     */
    const resolveChain = async (type, entity) => {
        const rawAncestry = containmentAncestors(entity, type, effectiveContainment())
            .map(ref => ({ ...ref, type: hierarchyTypeAlias(ref.type) }));
        const chain = [];

        for (const item of rawAncestry) {
            const data = await instances.resolveReadableReference(instances.canonicalTypeKey(item.type), item.id);
            chain.push({
                ...item,
                data,
                label: data?.identity?.name || data?.data?.requisitionNumber || data?.data?.batchNumber || item.id
            });
        }

        return chain;
    };

    return {
        resolveChain
    };
};
