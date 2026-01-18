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

                // Stop polling if no runs are in NESTING status
                const hasNestingRuns = (data.runs || []).some(run => run.status === 'NESTING');
                if (!hasNestingRuns) {
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
            const hasNestingRuns = (batch.runs || []).some(run => run.status === 'NESTING');
            if (hasNestingRuns) {
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
            
            const hasNestingRuns = (data.runs || []).some(run => run.status === 'NESTING');
            if (hasNestingRuns) {
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
        try {
            const result = await $fetch(`/api/batch/${batchId}/nest`, {
                method: 'POST',
                body: nestingParams
            });
            pollBatchStatus(batchId);
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
        try {
            const result = await $fetch(`/api/batch/${batchId}/reset-status`, {
                method: 'POST'
            });
            stopPolling(batchId);
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function chooseRun(batchId, runId) {
        try {
            const result = await $fetch(`/api/batch/${batchId}/choose-run`, {
                method: 'POST',
                body: { runId }
            });
            
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value[index] = result.batch;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value = result.batch;
            }
            
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteRun(batchId, runId) {
        try {
            const updatedBatch = await $fetch(`/api/batch/${batchId}/run/${runId}`, {
                method: 'DELETE'
            });
            
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value[index] = updatedBatch;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value = updatedBatch;
            }
            
            return updatedBatch;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function markCut(batchId) {
        try {
            const result = await $fetch(`/api/batch/${batchId}/mark-cut`, {
                method: 'POST'
            });
            
            const index = batches.value.findIndex(b => b._id === batchId);
            if (index !== -1) {
                batches.value[index] = result.batch;
            }
            if (currentBatch.value?._id === batchId) {
                currentBatch.value = result.batch;
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
        resetStatus,
        chooseRun,
        markCut,
        stopPolling
    };
});
