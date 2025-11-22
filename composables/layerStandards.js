/**
 * Layer Standards Composable
 */

import { reactive, readonly } from 'vue';

const state = reactive({
  standards: [],
  loading: false,
  error: null
});

export function useLayerStandards() {
  const fetchStandards = async (category = null) => {
    state.loading = true;
    state.error = null;
    
    try {
      const url = category 
        ? `/api/layer-standards?category=${category}`
        : '/api/layer-standards';
      
      const data = await $fetch(url);
      state.standards = data;
    } catch (error) {
      state.error = error.message;
      console.error('Failed to fetch layer standards:', error);
    } finally {
      state.loading = false;
    }
  };
  
  const getByCategory = (category) => {
    return state.standards.filter(s => s.category === category);
  };
  
  const getByCode = (code) => {
    return state.standards.find(s => s.code === code);
  };
  
  return {
    state: readonly(state),
    fetchStandards,
    getByCategory,
    getByCode
  };
}
