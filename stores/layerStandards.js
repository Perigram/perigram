import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const standardCategory = (standard) => standard?.data?.category || standard?.category || null;

export const useLayerStandardsStore = defineStore('layerStandards', () => {
    const authStore = useAuthStore();
    const standards = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const pendingFetches = new Map();
    let loadedScope = null;

    const currentScope = () => {
        const user = authStore.userData || {};
        const userId = user.userId || user.id || 'anonymous';
        const organizationId = user.organizationId || authStore.organizationData?._id || 'none';
        return `${userId}:${organizationId}`;
    };

    async function fetchStandards(category = null) {
        const scope = currentScope();
        const requestKey = `${scope}:${category || 'all'}`;
        if (pendingFetches.has(requestKey)) return pendingFetches.get(requestKey);

        loading.value = true;
        error.value = null;
        const request = (async () => {
            try {
                const url = category
                    ? `/api/layer-standards?category=${category}`
                    : '/api/layer-standards';

                const data = await $fetch(url);
                if (currentScope() === scope) {
                    standards.value = data || [];
                    if (!category) loadedScope = scope;
                }
                return data || [];
            } catch (err) {
                if (currentScope() === scope) {
                    error.value = err.message;
                    if (!category) loadedScope = null;
                }
                console.error('Failed to fetch layer standards:', err);
            } finally {
                pendingFetches.delete(requestKey);
                loading.value = pendingFetches.size > 0;
            }
        })();

        pendingFetches.set(requestKey, request);
        return request;
    }

    async function ensureStandards() {
        const scope = currentScope();
        if (loadedScope === scope) return standards.value;
        if (loadedScope !== null) standards.value = [];
        return fetchStandards();
    }

    function getByCategory(category) {
        return standards.value.filter(s => standardCategory(s) === category);
    }

    function getByCode(code) {
        return standards.value.find(s => standardCode(s) === code);
    }

    async function setOrgPenOverride(standardId, penId) {
        await $fetch(`/api/layer-standards/${standardId}/pen`, {
            method: 'PATCH',
            body: { penId }
        });
        const std = standards.value.find(s => s._id === standardId);
        if (std) {
            std.orgPenId = penId;
            std.data = { ...(std.data || {}), orgPenId: penId };
        }
    }

    async function removeOrgPenOverride(standardId) {
        await $fetch(`/api/layer-standards/${standardId}/pen`, { method: 'DELETE' });
        const std = standards.value.find(s => s._id === standardId);
        if (std) {
            std.orgPenId = null;
            std.data = { ...(std.data || {}), orgPenId: null };
        }
    }

    return {
        standards,
        loading,
        error,
        fetchStandards,
        ensureStandards,
        getByCategory,
        getByCode,
        setOrgPenOverride,
        removeOrgPenOverride
    };
});
