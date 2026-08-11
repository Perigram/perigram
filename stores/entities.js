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
    const pendingFetches = new Map();

    ensureSyncListener();

    /**
     * Fetch an entity and store it in the registry.
     */
    async function fetchEntity(type, id, force = false, options = {}) {
        if (!type || !id) return null;
        registry.value[type] ||= {};
        if (!force && registry.value[type][id]) return registry.value[type][id];

        const requestKey = `${normalizeHierarchyType(type)}:${id}`;
        if (!force && pendingFetches.has(requestKey)) return await pendingFetches.get(requestKey);

        loading.value = true;
        const request = resolveReadableReference(type, id, options)
            .then(data => {
                if (data) registry.value[type][id] = data;
                return data;
            })
            .catch(err => {
                if (!options.silent) {
                    console.error(`Failed to fetch ${type} with id ${id}:`, err);
                }
                error.value = err.message;
                return null;
            })
            .finally(() => {
                pendingFetches.delete(requestKey);
                loading.value = false;
            });
        pendingFetches.set(requestKey, request);
        return await request;
    }

    async function resolveReadableReference(type, id, options = {}) {
        const route = entityEndpoint(type)?.routes?.list;
        if (!route) return null;
        const query = new URLSearchParams({ _id: id.toString() });
        const { silent: _silent, ...fetchOptions } = options;
        const response = await $fetch(`${route}?${query}`, fetchOptions);
        return collectionItems(response).find(entity => entityIds(entity).includes(id.toString())) || null;
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

    function collectionItems(response) {
        if (Array.isArray(response)) return response;
        for (const key of ['items', 'projects', 'data']) {
            if (Array.isArray(response?.[key])) return response[key];
        }
        return [];
    }

    function entityIds(entity = {}) {
        return [entity._id, entity.id, entity.identity?.uid]
            .map(value => value?.toString?.() || value)
            .filter(Boolean);
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
