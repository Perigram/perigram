import { defineStore } from 'pinia';
import { ref } from 'vue';
import { onEntityChanged } from '~/utils/entity-events.js';
import { useAuthStore } from './auth';
import { useInstancesStore } from './instances';
import { containmentAncestors, hierarchyTypeAlias } from '~/utils/entity-hierarchy.js';

/**
 * Delegated legacy entity contract (see stores/README.md): the handwritten
 * card/detail/editor surfaces still consume wire DTOs keyed by legacy type
 * keys. This store owns no transport and no endpoint table — reads resolve
 * through the instances store, reconciliation happens there, and this
 * registry is the per-surface DTO projection. Gains no new callers.
 */
export const useEntityStore = defineStore('entities', () => {
    const instances = useInstancesStore();
    // { [entityType]: { [id]: dto } } — writable so internal demo pages can
    // pre-seed mock DTOs for shared trace components.
    const registry = ref({});

    ensureSyncListener();

    /**
     * Resolve an optional entity reference and cache the wire DTO.
     */
    async function fetchEntity(type, id, force = false, options = {}) {
        if (!type || !id) return null;
        const typeKey = instances.canonicalTypeKey(type);
        if (!force && registry.value[typeKey]?.[id]) return registry.value[typeKey][id];
        const dto = await instances.resolveReadableReference(typeKey, id, options);
        if (dto) {
            registry.value[typeKey] ||= {};
            registry.value[typeKey][id] = dto;
            return dto;
        }
        delete registry.value[typeKey]?.[id];
        return null;
    }

    /**
     * Resolves the chain of parent references for an entity.
     */
    function getAncestry(type, data) {
        return containmentAncestors(data, type, effectiveContainment()).map(ref => ({ ...ref, type: hierarchyTypeAlias(ref.type) }));
    }

    function effectiveContainment() {
        try {
            const authStore = useAuthStore();
            const bindings = authStore.lineageBindings || [];
            if (authStore.processActive) {
                return bindings.map(binding => ({
                    childType: binding.childEntityType,
                    parentType: binding.ancestorEntityType,
                    lineageKey: binding.lineageKey
                }));
            }
        } catch {
            // Auth store unavailable outside app context.
        }
        return [];
    }

    function ensureSyncListener() {
        if (typeof window === 'undefined') return;
        onEntityChanged(({ type, id, entity, change }) => {
            const typeKey = instances.canonicalTypeKey(type);
            const normalizedId = id?.toString?.() || id || entity?._id?.toString?.() || entity?._id;
            if (!typeKey || !normalizedId) return;
            registry.value[typeKey] ||= {};
            if (change === 'deleted') {
                delete registry.value[typeKey][normalizedId];
                return;
            }
            if (entity) {
                registry.value[typeKey][normalizedId] = entity;
                return;
            }
            delete registry.value[typeKey][normalizedId];
        });
    }

    return {
        registry,
        fetchEntity,
        getAncestry
    };
});
