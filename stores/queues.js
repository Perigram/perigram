import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useQueuesStore = defineStore('queues', () => {
    const queues = ref([]);
    const currentQueue = ref(null);
    const loading = ref(false);
    const error = ref(null);
    const pollingIntervals = ref({});

    function stopPolling(queueId) {
        if (pollingIntervals.value[queueId]) {
            clearInterval(pollingIntervals.value[queueId]);
            delete pollingIntervals.value[queueId];
        }
    }

    async function pollQueueStatus(queueId) {
        if (pollingIntervals.value[queueId]) return;

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

                // Stop polling if no runs are in NESTING status
                const hasNestingRuns = (data.runs || []).some(run => run.status === 'NESTING');
                if (!hasNestingRuns) {
                    stopPolling(queueId);
                }
            } catch (err) {
                console.error(`Polling error for queue ${queueId}:`, err);
                stopPolling(queueId);
            }
        }, 3000);
    }

    function checkTransientStatuses() {
        queues.value.forEach(queue => {
            const hasNestingRuns = (queue.runs || []).some(run => run.status === 'NESTING');
            if (hasNestingRuns) {
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
            
            const hasNestingRuns = (data.runs || []).some(run => run.status === 'NESTING');
            if (hasNestingRuns) {
                pollQueueStatus(queueId);
            }
            
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

    async function startNesting(queueId, nestingParams) {
        try {
            const result = await $fetch(`/api/queue/${queueId}/nest`, {
                method: 'POST',
                body: nestingParams
            });
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
            
            const index = queues.value.findIndex(q => q._id === queueId);
            if (index !== -1) {
                queues.value[index] = result.queue;
            }
            if (currentQueue.value?._id === queueId) {
                currentQueue.value = result.queue;
            }
            
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function deleteRun(queueId, runId) {
        try {
            const updatedQueue = await $fetch(`/api/queue/${queueId}/run/${runId}`, {
                method: 'DELETE'
            });
            
            const index = queues.value.findIndex(q => q._id === queueId);
            if (index !== -1) {
                queues.value[index] = updatedQueue;
            }
            if (currentQueue.value?._id === queueId) {
                currentQueue.value = updatedQueue;
            }
            
            return updatedQueue;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    async function markCut(queueId) {
        try {
            const result = await $fetch(`/api/queue/${queueId}/mark-cut`, {
                method: 'POST'
            });
            
            const index = queues.value.findIndex(q => q._id === queueId);
            if (index !== -1) {
                queues.value[index] = result.queue;
            }
            if (currentQueue.value?._id === queueId) {
                currentQueue.value = result.queue;
            }
            
            return result;
        } catch (err) {
            error.value = err.message;
            throw err;
        }
    }

    return {
        queues,
        currentQueue,
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
        markCut,
        deleteRun,
        stopPolling
    };
});
