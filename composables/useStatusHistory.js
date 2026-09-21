import { ref } from 'vue';

/**
 * Status History Composable
 * Fetches and manages the audit log for an entity
 */
export const useStatusHistory = (typeId, targetId) => {
  const events = ref([]);
  const isLoading = ref(false);
  const error = ref(null);

  const fetchHistory = async () => {
    if (!targetId) return;
    
    isLoading.value = true;
    error.value = null;
    
    try {
      const data = await $fetch(`/api/status/history`, {
        query: { targetId, targetType: typeId }
      });
      events.value = data;
    } catch (err) {
      error.value = err.data?.message || 'Failed to fetch history';
    } finally {
      isLoading.value = false;
    }
  };

  return {
    events,
    isLoading,
    error,
    fetchHistory
  };
};
