import { ref } from 'vue';

/**
 * useEntityList - Reactive list fetching for entity collections.
 *
 * @param {string} type - Entity type key (same as useEntity)
 * @param {object} filters - Query params as key/value pairs
 *
 * Usage:
 *   const { items, loading, error, refresh } = useEntityList('queue', { 'lineage.projectId': project._id })
 */
export const useEntityList = (type, filters = {}) => {
    const items = ref([]);
    const loading = ref(false);
    const error = ref(null);

    const endpointMap = {
        project:          '/api/projects',
        queue:            '/api/queues',
        requisition:      '/api/requisitions',
        pile:             '/api/material-piles',
        sheet:            '/api/sheets',
        remnant:          '/api/remnants',
        cassetteInstance: '/api/cassette-instances',
        cassetteDesign:   '/api/cassette-designs',
        sheetDesign:      '/api/sheet-designs',
        artifact:         '/api/artifacts',
        catalog:          '/api/catalogs',
        color:            '/api/colors',
        warehouse:        '/api/warehouses',
        user:             '/api/users',
        organization:     '/api/organizations',
        nesting_run:      '/api/nesting-runs',
    };

    const buildUrl = (currentFilters) => {
        const base = endpointMap[type] || `/api/${type}s`;
        const params = new URLSearchParams(currentFilters).toString();
        return params ? `${base}?${params}` : base;
    };

    const fetch = async (overrideFilters) => {
        loading.value = true;
        error.value = null;
        try {
            const url = buildUrl(overrideFilters ?? filters);
            const data = await $fetch(url);
            items.value = Array.isArray(data) ? data : data.items ?? data.data ?? [];
            return items.value;
        } catch (err) {
            error.value = err.data?.message || `Failed to fetch ${type} list`;
            console.error(`[useEntityList] Error fetching ${type}:`, err);
            throw err;
        } finally {
            loading.value = false;
        }
    };

    const refresh = () => fetch();

    return { items, loading, error, fetch, refresh };
};
