import { defineStore } from 'pinia';
import { ref } from 'vue';
import { onEntityChanged } from '~/utils/entity-events.js';
import { cncDomain } from '@cutkit/domain-cnc';
import { useAuthStore } from './auth';
import { containmentAncestors, hierarchyTypeAlias, normalizeHierarchyType } from '~/utils/entity-hierarchy.js';

let syncListenerAttached = false;

/**
 * Universal Entity Store
 * Centralized registry and cache for all 13 system entities.
 * Manages relationships and provides a unified fetching interface.
 */
export const useEntityStore = defineStore('entities', () => {
    // Cache structure: { [entityType]: { [id]: data } }
    const registry = ref(Object.fromEntries((cncDomain.entities || []).map(entity => [entity.type, {}])));

    const loading = ref(false);
    const error = ref(null);

    ensureSyncListener();

    /**
     * Fetch an entity and store it in the registry.
     */
    async function fetchEntity(type, id, force = false, options = {}) {
        if (!type || !id) return null;
        registry.value[type] ||= {};
        if (!force && registry.value[type][id]) return registry.value[type][id];

        loading.value = true;
        try {
            const route = entityEndpoint(type)?.routes?.single;
            const url = route ? route.replace(':id', encodeURIComponent(id)) : `/api/${normalizeHierarchyType(type)}/${encodeURIComponent(id)}`;
            const data = await $fetch(url);
            
            registry.value[type][id] = data;
            return data;
        } catch (err) {
            if (!options.silent) {
                console.error(`Failed to fetch ${type} with id ${id}:`, err);
            }
            error.value = err.message;
            return null;
        } finally {
            loading.value = false;
        }
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
        return cncDomain.containment || [];
    }

    function entityEndpoint(type = '') {
        const normalized = normalizeHierarchyType(type);
        return (cncDomain.ui?.endpoints || []).find(endpoint => normalizeHierarchyType(endpoint.type) === normalized);
    }

    function ensureSyncListener() {
        if (syncListenerAttached || typeof window === 'undefined') return;
        syncListenerAttached = true;
        onEntityChanged(({ type, id, entity, change }) => {
            const normalizedId = id?.toString?.() || id || entity?._id?.toString?.() || entity?._id;
            if (!type || !normalizedId) return;
            registry.value[type] ||= {};
            if (change === 'deleted') {
                delete registry.value[type][normalizedId];
                return;
            }
            if (entity) {
                registry.value[type][normalizedId] = entity;
                return;
            }
            delete registry.value[type][normalizedId];
        });
    }

    return {
        registry,
        loading,
        error,
        fetchEntity,
        getAncestry
    };
});
