import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Universal Entity Store
 * Centralized registry and cache for all 13 system entities.
 * Manages relationships and provides a unified fetching interface.
 */
export const useEntityStore = defineStore('entities', () => {
    // Cache structure: { [entityType]: { [id]: data } }
    const registry = ref({
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
        cassetteTemplate: {}
    });

    const loading = ref(false);
    const error = ref(null);

    /**
     * Map of how entities relate to their parents (The Ancestry Tree)
     */
    const ancestryMap = {
        cassetteInstance: (data) => [
            { type: 'cassetteDesign', id: data.cassetteDesignId },
            { type: 'sheet', id: data.sheetId },
            { type: 'project', id: data.projectSlug, isSlug: true }
        ],
        sheet: (data) => [
            { type: 'batchPile', id: data.pileId },
            { type: 'batch', id: data.batchId },
            { type: 'warehouse', id: data.warehouseId }
        ],
        batch: (data) => [
            { type: 'requisition', id: data.requisitionId }
        ],
        batchPile: (data) => [
            { type: 'batch', id: data.batchId }
        ],
        queue: (data) => [
            { type: 'project', id: data.projectSlug, isSlug: true }
        ],
        requisition: (data) => [
            { type: 'catalog', id: data.catalogId }
        ],
        remnant: (data) => [
            { type: 'sheet', id: data.sheetId }
        ]
    };

    /**
     * Fetch an entity and store it in the registry.
     */
    async function fetchEntity(type, id, force = false) {
        if (!type || !id) return null;
        if (!force && registry.value[type][id]) return registry.value[type][id];

        loading.value = true;
        try {
            // Mapping UI types to actual API endpoints
            const endpointMap = {
                project: `/api/project/${id}`,
                queue: `/api/queue/${id}`,
                requisition: `/api/requisitions/${id}`,
                batch: `/api/material-batches/${id}`,
                cassetteInstance: `/api/cassette-instances/${id}`,
                // ... others as endpoints are implemented
            };

            const url = endpointMap[type] || `/api/${type}/${id}`;
            const data = await $fetch(url);
            
            registry.value[type][id] = data;
            return data;
        } catch (err) {
            console.error(`Failed to fetch ${type} with id ${id}:`, err);
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
        if (!ancestryMap[type]) return [];
        return ancestryMap[type](data).filter(ref => ref.id);
    }

    return {
        registry,
        loading,
        error,
        fetchEntity,
        getAncestry
    };
});
