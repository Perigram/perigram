import { ref } from 'vue';

export const STATUS_ACTIONS_ENDPOINT = '/api/status/actions';
export const STATUS_TRANSITION_ENDPOINT = '/api/status/transition';

export const getStatusEndpoint = () => STATUS_TRANSITION_ENDPOINT;

/**
 * Status Controller Composable
 * Frontend bridge for the centralized State Machine engine
 */
export const useStatusController = () => {
  const isTransitioning = ref(false);
  const transitionError = ref(null);

  const transition = async (entityType, targetId, newState, context = {}) => {
    isTransitioning.value = true;
    transitionError.value = null;
    const statusMeta = context && typeof context === 'object' && ('metadata' in context || 'lifecycle' in context)
      ? context
      : { metadata: context || {} };
    
    try {
      const response = await $fetch(getStatusEndpoint(), {
        method: 'POST',
        body: { entityType, id: targetId, status: newState, statusMeta }
      });
      return response;
    } catch (err) {
      transitionError.value = err.data?.message || 'Failed to update status';
      throw err;
    } finally {
      isTransitioning.value = false;
    }
  };

  const fetchActions = async (entityType, targetId) => {
    if (!entityType || !targetId) return [];

    const response = await $fetch(STATUS_ACTIONS_ENDPOINT, {
      query: { entityType, id: targetId }
    });

    return response?.actions || [];
  };

  return {
    transition,
    fetchActions,
    isTransitioning,
    transitionError
  };
};
