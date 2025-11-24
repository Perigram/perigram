/**
 * Artifacts Composable/Store
 */

import { reactive, readonly, computed } from 'vue';

const state = reactive({
  artifacts: [],
  loading: false,
  error: null
});

/**
 * Fetches all artifacts for a given batch and updates the store state.
 * @param {string} batchId - The ID of the batch to fetch artifacts for.
 */
const fetchArtifacts = async (batchId) => {
  state.loading = true;
  state.error = null;
  
  if (!batchId) {
    state.error = 'Batch ID is required to fetch artifacts.';
    state.loading = false;
    state.artifacts = [];
    return;
  }
  
  try {
    const data = await $fetch(`/api/batch/${batchId}/artifacts`);
    state.artifacts = data || [];
  } catch (error) {
    state.error = error.message;
    console.error(`Failed to fetch artifacts for batch ${batchId}:`, error);
    state.artifacts = []; // Clear artifacts on error
  } finally {
    state.loading = false;
  }
};

/**
 * Clears the artifacts list from the state.
 */
const clearArtifacts = () => {
  state.artifacts = [];
  state.error = null;
  state.loading = false;
};

const getters = {
  artifacts: computed(() => state.artifacts),
  loading: computed(() => state.loading),
  error: computed(() => state.error)
};

const actions = {
  fetchArtifacts,
  clearArtifacts
};

export const artifactsStore = readonly({
  getters,
  actions
});
