import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPrimaryState } from '~/packages/core/src/index.js';

export const useQueuesStore = defineStore('queues', () => {
    const queues = ref([]);
    const currentQueue = ref(null);
    const runs = ref({});
    const loading = ref(false);
    const error = ref(null);
    const nestingCompleted = ref(null);
    const pollingIntervals = ref({});

    function stopPolling(queueId) {
        if (pollingIntervals.value[queueId]) {
            clearInterval(pollingIntervals.value[queueId]);
            delete pollingIntervals.value[queueId];
        }
    }

    function hasActiveNestingRun(queueRuns = []) {
        const latest = sortQueueRuns(queueRuns).at(-1);
        if (!latest) return false;
        const state = getPrimaryState(latest.status);
        if (state === 'NESTING') return true;
        if (['COMPLETE', 'CHOSEN', 'ERROR'].includes(state)) return false;
        return !hasNestingResults(latest);
    }

    function hasNestingResults(run = {}) {
        return Boolean(run.data?.results) || Boolean(run.data?.sheetDesignIds?.length);
    }

    function sortQueueRuns(queueRuns = []) {
        return [...queueRuns].sort((left, right) => runOrder(left) - runOrder(right));
    }

    function runOrder(run = {}) {
        return Number(run.data?.runNumber ?? run.runNumber ?? Number.MAX_SAFE_INTEGER);
    }

    async function pollQueueStatus(queueId) {
        if (pollingIntervals.value[queueId]) return;
        if (!hasActiveNestingRun(runs.value[queueId] || [])) return;

        pollingIntervals.value[queueId] = setInterval(async () => {
            try {
                const data = await $fetch(`/api/queue/${queueId}`);
                
                // Update in list
                const index = queues.value.findIndex(q => q._id === queueId);
                if (index !== -1) {
                    queues.value[index] = data;
                }
                
                // Update current if active
                if (currentQueue.value?._id === queueId) {
                    currentQueue.value = data;
                }

                const queueRuns = await fetchRuns(queueId);
                if (!hasActiveNestingRun(queueRuns)) {
                    stopPolling(queueId);
                    // Nesting just completed; use a fresh object so repeated
                    // runs for the same queue still trigger Vue watchers.
                    nestingCompleted.value = { queueId, completedAt: Date.now() };
                }
            } catch (err) {
                console.error(`Polling error for queue ${queueId}:`, err);
                stopPolling(queueId);
            }
        }, 3000);
    }

    function checkTransientStatuses() {
        queues.value.forEach(queue => {
            const queueRuns = runs.value[queue._id] || [];
            if (hasActiveNestingRun(queueRuns)) {
                pollQueueStatus(queue._id);
            }
        });
    }

    async function fetchQueues(projectSlug) {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch(`/api/project/${projectSlug}/queues`);
            queues.value = data;
            checkTransientStatuses();
        } catch (err) {
            error.value = err.message;
            console.error('fetchQueues error:', err);
        } finally {
            loading.value = false;
        }
    }

    async function getQueue(queueId) {
        loading.value = true;
        error.value = null;
        try {
            const data = await $fetch(`/api/queue/${queueId}`);
            currentQueue.value = data;
            await fetchRuns(queueId);
            pollQueueStatus(queueId);
            
            return data;
        } catch (err) {
            error.value = err.message;
            console.error('Failed to fetch queue:', error);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    async function createQueue(projectSlug, queueData) {
        try {
            const queue = await $fetch(`/api/project/${projectSlug}/queues`, {
                method: 'POST',
                body: queueData
            });
            queues.value.push(queue);
            return queue;
        } catch (err) {
            error.value = err.message;
            console.error('createQueue error:', err);
            throw err;
        }
    }

    async function updateQueue(queueId, updates) {
        try {
            const queue = await $fetch(`/api/queue/${queueId}`, {
                method: 'PUT',
                body: updates
            });
            const index = queues.value.findIndex(q => q._id === queueId);
            if (index !== -1) {
                queues.value[index] = queue;
            }
            if (currentQueue.value?._id === queueId) {
                currentQueue.value = queue;
            }
            return queue;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function startNesting(queueId, payload = {}) {
        try {
            const result = await $fetch(`/api/queue/${queueId}/nest`, {
                method: 'POST',
                body: payload
            });
            await fetchRuns(queueId);
            pollQueueStatus(queueId);
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function getArtifacts(queueId) {
        try {
            return await $fetch(`/api/queue/${queueId}/artifacts`);
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteQueue(queueId) {
        stopPolling(queueId);
        try {
            await $fetch(`/api/queue/${queueId}`, {
                method: 'DELETE'
            });
            const index = queues.value.findIndex(q => q._id === queueId);
            if (index !== -1) {
                queues.value.splice(index, 1);
            }
            if (currentQueue.value?._id === queueId) {
                currentQueue.value = null;
            }
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function resetStatus(queueId) {
        try {
            const result = await $fetch(`/api/queue/${queueId}/reset-status`, {
                method: 'POST'
            });
            stopPolling(queueId);
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function chooseRun(queueId, runId) {
        try {
            const result = await $fetch(`/api/queue/${queueId}/choose-run`, {
                method: 'POST',
                body: { runId }
            });
            await fetchRuns(queueId);
            if (result.queue) {
                const index = queues.value.findIndex(q => q._id === queueId);
                if (index !== -1) {
                    queues.value[index] = result.queue;
                }
                if (currentQueue.value?._id === queueId) {
                    currentQueue.value = result.queue;
                }
            }
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteRun(queueId, runId) {
        try {
            await $fetch(`/api/queue/${queueId}/run/${runId}`, {
                method: 'DELETE'
            });
            await fetchRuns(queueId);
            return runs.value[queueId] || [];
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function fetchRuns(queueId) {
        try {
            const data = await $fetch(`/api/nesting-runs`, { query: { queueId } });
            const sorted = sortQueueRuns(data);
            runs.value[queueId] = sorted;
            return sorted;
        } catch (err) {
            error.value = err.message;
            return [];
        }
    }

    return {
        queues,
        currentQueue,
        runs,
        nestingCompleted,
        loading,
        error,
        fetchQueues,
        getQueue,
        createQueue,
        updateQueue,
        deleteQueue,
        startNesting,
        getArtifacts,
        resetStatus,
        chooseRun,
        deleteRun,
        stopPolling,
        pollQueueStatus,
        fetchRuns
    };
});
