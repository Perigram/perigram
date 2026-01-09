import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useBatchesStore = defineStore('batches', () => {
    const batches = ref([]);
    const currentBatch = ref(null);
    const loading = ref(false);
    const error = ref(null);

    async function fetchBatches(projectSlug) {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch(`/api/project/${projectSlug}/batches`);
            batches.value = data;
        } catch (err) {
            error.value = err.message;
            console.error('fetchBatches error:', err);
        } finally {
            loading.value = false;
        }
    }

    async function getBatch(batchId) {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch(`/api/batch/${batchId}`);
            currentBatch.value = data;
            return data;
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch batch:', err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    async function createBatch(projectSlug, batchData) {
        try {
            const batch = await $fetch(`/api/project/${projectSlug}/batches`, {
                method: 'POST',
                body: batchData
            });
            batches.value.push(batch);
            return batch;
        } catch (err) {
            error.value = err.message;
            console.error('createBatch error:', err);
            throw err;
        }
    }

    async function updateBatch(batchId, updates) {
        try {
            const batch = await $fetch(`/api/batch/${batchId}`, {
                method: 'PUT',
                body: updates
            });
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value[index] = batch;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value = batch;
            }
            return batch;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function startNesting(batchId, nestingParams) {
        try {
            const result = await $fetch(`/api/batch/${batchId}/nest`, {
                method: 'POST',
                body: nestingParams
            });
            await getBatch(batchId);
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function getArtifacts(batchId) {
        try {
            return await $fetch(`/api/batch/${batchId}/artifacts`);
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteBatch(batchId) {
        try {
            await $fetch(`/api/batch/${batchId}`, {
                method: 'DELETE'
            });
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value.splice(index, 1);
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value = null;
            }
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function resetStatus(batchId) {
        try {
            const result = await $fetch(`/api/batch/${batchId}/reset-status`, {
                method: 'POST'
            });
            await getBatch(batchId);
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value[index] = currentBatch.value;
            }
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    return {
        batches,
        currentBatch,
        loading,
        error,
        fetchBatches,
        getBatch,
        createBatch,
        updateBatch,
        deleteBatch,
        startNesting,
        getArtifacts,
        resetStatus
    };
});
