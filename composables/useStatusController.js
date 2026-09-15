import { ref } from 'vue';
import { emitStatusTransitionResult } from '~/utils/entity-events.js';
import { useOutboxStore } from '~/stores/outbox';
import { isOfflineQueuedError } from '~/utils/outbox.js';

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
    const intent = context?.intent || null;
    const producerOutputId = context?.producerOutputId || null;
    const region = context?.region || context?.machineRegion || context?.machine || null;
    const path = Array.isArray(context?.path) ? context.path : null;
    
    try {
      const response = await transitionOffline({
        entityType,
        targetId,
        body: {
          entityType,
          id: targetId,
          status: newState,
          intent,
          ...(producerOutputId ? { producerOutputId } : {}),
          statusMeta: {
            ...statusMeta,
            ...(region ? { region } : {}),
            ...(path ? { path } : {})
          }
        }
      });
      emitStatusTransitionResult({ entityType, targetId, response });
      return response;
    } catch (err) {
      transitionError.value = isOfflineQueuedError(err)
        ? err.message
        : (err.data?.message || 'Failed to update status');
      throw err;
    } finally {
      isTransitioning.value = false;
    }
  };

  async function transitionOffline({ entityType, targetId, body }) {
    if (typeof window === 'undefined') {
      return $fetch(getStatusEndpoint(), { method: 'POST', body });
    }
    const outbox = useOutboxStore();
    return outbox.mutate({
      url: getStatusEndpoint(),
      method: 'POST',
      body,
      meta: { kind: 'transition', entityType, entityId: targetId, reason: 'status-transition' }
    });
  }

  const fetchActions = async (entityType, targetId, context = {}) => {
    if (!entityType || !targetId) return [];

    const response = await $fetch(STATUS_ACTIONS_ENDPOINT, {
      query: {
        entityType,
        id: targetId,
        ...(context.producerOutputId ? { producerOutputId: context.producerOutputId } : {})
      }
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
