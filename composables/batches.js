/**
 * Batches Composable
 */

import { reactive, readonly } from 'vue';

const state = reactive({
  batches: [],
  currentBatch: null,
  loading: false,
  error: null
});

export function useBatches() {
  const fetchBatches = async (projectSlug) => {
    state.loading = true;
    state.error = null;
    
    try {
      const data = await $fetch(`/api/project/${projectSlug}/batches`);
      state.batches = data;
    } catch (error) {
      state.error = error.message;
      console.error('Failed to fetch batches:', error);
    } finally {
      state.loading = false;
    }
  };
  
  const getBatch = async (batchId) => {
    state.loading = true;
    state.error = null;
    
    try {
      const data = await $fetch(`/api/batch/${batchId}`);
      state.currentBatch = data;
      return data;
    } catch (error) {
      state.error = error.message;
      console.error('Failed to fetch batch:', error);
      throw error;
    } finally {
      state.loading = false;
    }
  };
  
  const createBatch = async (projectSlug, batchData) => {
    try {
      const batch = await $fetch(`/api/project/${projectSlug}/batches`, {
        method: 'POST',
        body: batchData
      });
      state.batches.push(batch);
      return batch;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const updateBatch = async (batchId, updates) => {
    try {
      const batch = await $fetch(`/api/batch/${batchId}`, {
        method: 'PUT',
        body: updates
      });
      const index = state.batches.findIndex(b => b._id === batchId);
      if (index !== -1) {
        state.batches[index] = batch;
      }
      if (state.currentBatch?._id === batchId) {
        state.currentBatch = batch;
      }
      return batch;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const startNesting = async (batchId, nestingParams) => {
    try {
      const result = await $fetch(`/api/batch/${batchId}/nest`, {
        method: 'POST',
        body: nestingParams
      });
      
      // Refresh batch to get updated status
      await getBatch(batchId);
      
      return result;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const getArtifacts = async (batchId) => {
    try {
      return await $fetch(`/api/batch/${batchId}/artifacts`);
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  return {
    state: readonly(state),
    fetchBatches,
    getBatch,
    createBatch,
    updateBatch,
    startNesting,
    getArtifacts
  };
}
