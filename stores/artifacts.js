import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useArtifactsStore = defineStore('artifacts', () => {
    const artifacts = ref([]);
    const loading = ref(false);
    const error = ref(null);

    async function fetchArtifacts(batchId, revisionId = null) {
        loading.value = true;
        error.value = null;

        if (!batchId) {
            error.value = 'Batch ID is required to fetch artifacts.';
            loading.value = false;
            artifacts.value = [];
            return;
        }

        try {
            const url = revisionId
                ? `/api/queue/${batchId}/artifacts?revisionId=${revisionId}`
                : `/api/queue/${batchId}/artifacts`;
            const data = await $fetch(url);
            artifacts.value = data || [];
        } catch (err) {
            error.value = err.message;
            console.error(`Failed to fetch artifacts for queue ${batchId}:`, err);
            artifacts.value = [];
        } finally {
            loading.value = false;
        }
    }

    function clearArtifacts() {
        artifacts.value = [];
        error.value = null;
        loading.value = false;
    }

    return {
        artifacts,
        loading,
        error,
        fetchArtifacts,
        clearArtifacts
    };
});
