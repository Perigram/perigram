/**
 * Tool Profiles Composable
 */

import { reactive, readonly } from 'vue';

const state = reactive({
  tools: [],
  loading: false,
  error: null
});

export function useToolProfiles() {
  const fetchTools = async () => {
    state.loading = true;
    state.error = null;
    
    try {
      const data = await $fetch('/api/templates/tools');
      state.tools = data;
    } catch (error) {
      state.error = error.message;
      console.error('Failed to fetch tool profiles:', error);
    } finally {
      state.loading = false;
    }
  };
  
  const createTool = async (toolData) => {
    try {
      const tool = await $fetch('/api/templates/tools', {
        method: 'POST',
        body: toolData
      });
      state.tools.push(tool);
      return tool;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const updateTool = async (id, updates) => {
    try {
      const tool = await $fetch(`/api/templates/tools/${id}`, {
        method: 'PUT',
        body: updates
      });
      const index = state.tools.findIndex(t => t._id === id);
      if (index !== -1) {
        state.tools[index] = tool;
      }
      return tool;
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const deleteTool = async (id) => {
    try {
      await $fetch(`/api/templates/tools/${id}`, {
        method: 'DELETE'
      });
      state.tools = state.tools.filter(t => t._id !== id);
    } catch (error) {
      state.error = error.message;
      throw error;
    }
  };
  
  const getSystemTools = () => {
    return state.tools.filter(t => !t.ownerId);
  };
  
  const getUserTools = () => {
    return state.tools.filter(t => t.ownerId);
  };
  
  return {
    state: readonly(state),
    fetchTools,
    createTool,
    updateTool,
    deleteTool,
    getSystemTools,
    getUserTools
  };
}
