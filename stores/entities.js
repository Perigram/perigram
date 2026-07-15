import { defineStore } from 'pinia';
import { ref } from 'vue';
import { onEntityChanged } from '~/utils/entity-events.js';

let syncListenerAttached = false;

/**
 * Universal Entity Store
 * Centralized registry and cache for all 13 system entities.
 * Manages relationships and provides a unified fetching interface.
 */
export const useEntityStore = defineStore('entities', () => {
    // Cache structure: { [entityType]: { [id]: data } }
    const registry = ref({
        organization: {},
        project: {},
        queue: {},
        sheetDesign: {},
        cassetteDesign: {},
        cassetteInstance: {},
        warehouse: {},
        catalog: {},
        requisition: {},
        batch: {},
        batchPile: {},
        sheet: {},
        remnant: {},
        cassetteTemplate: {},
        library: {}
    });

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
            const endpointMap = {
                organization: `/api/organizations/${id}`,
                project: `/api/project/${id}`,
                queue: `/api/queue/${id}`,
                warehouse: `/api/warehouses/${id}`,
                requisition: `/api/requisitions/${id}`,
                batch: `/api/material-piles/${id}`,
                cassetteInstance: `/api/cassette-instances/${id}`,
                cassetteTemplate: `/api/cassettes/${id}`,
                cassetteDesign: `/api/cassette-designs/${id}`,
                sheetDesign: `/api/sheet-designs/${id}`,
                library: `/api/libraries/${id}`,
                // ... others as endpoints are implemented
            };

            const url = endpointMap[type] || `/api/${type}/${id}`;
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
    function getAncestry(type, entity) {
        return Object.values(entity?.lineage || {})
            .filter(ref => ref?.entityType && ref?.entityId)
            .map(ref => ({
                type: String(ref.entityType).replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase()),
                id: String(ref.entityId),
                ...(ref.revisionId ? { revisionId: String(ref.revisionId) } : {})
            }));
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
