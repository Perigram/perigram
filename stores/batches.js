import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useBatchesStore = defineStore('batches', () => {
    const batches = ref([]);
    const currentBatch = ref(null);
    const loading = ref(false);
    const error = ref(null);
    const pollingIntervals = ref({});

    function stopPolling(batchId) {
        if (pollingIntervals.value[batchId]) {
            clearInterval(pollingIntervals.value[batchId]);
            delete pollingIntervals.value[batchId];
        }
    }

    async function pollBatchStatus(batchId) {
        if (pollingIntervals.value[batchId]) return;

        pollingIntervals.value[batchId] = setInterval(async () => {
            try {
                const data = await $fetch(`/api/batch/${batchId}`);
                
                // Update in list
                const index = batches.value.findIndex(b => b._id === batchId);
                if (index !== -1) {
                    batches.value[index] = data;
                }
                
                // Update current if active
                if (currentBatch.value?._id === batchId) {
                    currentBatch.value = data;
                }

                // Stop polling if reached final state
                if (!['NESTING', 'PROCESSING'].includes(data.status)) {
                    stopPolling(batchId);
                }
            } catch (err) {
                console.error(`Polling error for batch ${batchId}:`, err);
                stopPolling(batchId);
            }
        }, 3000);
    }

    function checkTransientStatuses() {
        batches.value.forEach(batch => {
            if (['NESTING', 'PROCESSING'].includes(batch.status)) {
                pollBatchStatus(batch._id);
            }
        });
    }

    async function fetchBatches(projectSlug) {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch(`/api/project/${projectSlug}/batches`);
            batches.value = data;
            checkTransientStatuses();
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
            
            if (['NESTING', 'PROCESSING'].includes(data.status)) {
                pollBatchStatus(batchId);
            }
            
            return data;
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch batch:', error);
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
        // Optimistic update
        const index = batches.value.findIndex(b => b._id === batchId);
        let previousStatus = 'DRAFT';
        if (index !== -1) {
            previousStatus = batches.value[index].status;
            batches.value[index].status = 'NESTING';
        }
        if (currentBatch.value?._id === batchId) {
            currentBatch.value.status = 'NESTING';
        }

        try {
            const result = await $fetch(`/api/batch/${batchId}/nest`, {
                method: 'POST',
                body: nestingParams
            });
            pollBatchStatus(batchId);
            return result;
        } catch (err) {
            // Rollback on error
            if (index !== -1) {
                batches.value[index].status = previousStatus;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value.status = previousStatus;
            }
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
        stopPolling(batchId);
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
        // Optimistic update
        const index = batches.value.findIndex(b => b._id === batchId);
        let previousStatus = 'FAILED';
        if (index !== -1) {
            previousStatus = batches.value[index].status;
            batches.value[index].status = 'DRAFT';
        }
        if (currentBatch.value?._id === batchId) {
            currentBatch.value.status = 'DRAFT';
        }

        try {
            const result = await $fetch(`/api/batch/${batchId}/reset-status`, {
                method: 'POST'
            });
            stopPolling(batchId);
            return result;
        } catch (err) {
            // Rollback on error
            if (index !== -1) {
                batches.value[index].status = previousStatus;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value.status = previousStatus;
            }
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
        resetStatus,
        stopPolling
    };
});
