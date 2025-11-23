/**
 * Pen Templates Composable
 */

import { reactive, readonly } from 'vue';

const state = reactive({
  pens: [],
  loading: false,
  error: null
});

export function usePenTemplates() {
  const fetchPens = async () => {
    state.loading = true;
    state.error = null;
    
    try {
      const data = await $fetch('/api/templates/pens');
      state.pens = data || [];
    } catch (error) {
      state.error = error.message;
      console.error('Failed to fetch pen templates:', error);
      state.pens = []; // Set empty array on error
    } finally {
      state.loading = false;
    }
  };
  
  const createPen = async (penData) => {
    try {
      const pen = await $fetch('/api/templates/pens', {
        method: 'POST',
        body: penData
      });
      state.pens.push(pen);
      return pen;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const updatePen = async (id, updates) => {
    try {
      const pen = await $fetch(`/api/templates/pens/${id}`, {
        method: 'PUT',
        body: updates
      });
      const index = state.pens.findIndex(p => p._id === id);
      if (index !== -1) {
        state.pens[index] = pen;
      }
      return pen;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const deletePen = async (id) => {
    try {
      await $fetch(`/api/templates/pens/${id}`, {
        method: 'DELETE'
      });
      state.pens = state.pens.filter(p => p._id !== id);
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const getSystemPens = () => {
    return state.pens.filter(p => !p.ownerId);
  };
  
  const getUserPens = () => {
    return state.pens.filter(p => p.ownerId);
  };
  
  return {
    state: readonly(state),
    fetchPens,
    createPen,
    updatePen,
    deletePen,
    getSystemPens,
    getUserPens
  };
}
