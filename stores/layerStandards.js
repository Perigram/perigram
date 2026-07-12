import { defineStore } from 'pinia';
import { ref } from 'vue';

const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const standardCategory = (standard) => standard?.data?.category || standard?.category || null;

export const useLayerStandardsStore = defineStore('layerStandards', () => {
    const standards = ref([]);
    const loading = ref(false);
    const error = ref(null);

    async function fetchStandards(category = null) {
        loading.value = true;
        error.value = null;
        try {
            const url = category 
                ? `/api/layer-standards?category=${category}`
                : '/api/layer-standards';
            
            const data = await $fetch(url);
            standards.value = data;
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch layer standards:', err);
        } finally {
            loading.value = false;
        }
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
        getByCategory,
        getByCode,
        setOrgPenOverride,
        removeOrgPenOverride
    };
});
