import { ref } from 'vue';

/**
 * Status Controller Composable
 * Frontend bridge for the centralized State Machine engine
 */
export const useStatusController = () => {
  const isTransitioning = ref(false);
  const transitionError = ref(null);

  const transition = async (entityType, targetId, newState, metadata = {}) => {
    isTransitioning.value = true;
    transitionError.value = null;
    
    try {
      const response = await $fetch(`/api/${entityType}/${targetId}/status`, {
        method: 'PATCH',
        body: { status: newState, metadata }
      });
      return response;
    } catch (err) {
      transitionError.value = err.data?.message || 'Failed to update status';
      throw err;
    } finally {
      isTransitioning.value = false;
    }
  };

  return {
    transition,
    isTransitioning,
    transitionError
  };
};
