import { defineStore } from 'pinia';
import { ref } from 'vue';

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
        return standards.value.filter(s => s.category === category);
    }

    function getByCode(code) {
        return standards.value.find(s => s.code === code);
    }

    return {
        standards,
        loading,
        error,
        fetchStandards,
        getByCategory,
        getByCode
    };
});
