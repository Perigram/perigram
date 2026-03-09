import { ref, computed } from 'vue';
import { useIdentity, useStatus, useLineage, useSpecs } from './useBlocks';
import { useStatusController } from './useStatusController';

/**
 * Unified Entity Composable - v24 Standardized
 * Provides a reactive bridge for interacting with v24 Block-based entities.
 * 
 * @param {string} type - Entity type (e.g., 'project', 'queue')
 * @param {string} identifier - UID or ID or Slug
 */
export const useEntity = (type, identifier = null) => {
  const entity = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const { transition, isTransitioning } = useStatusController();

  // 1. Block Helpers (Reactive to the entity ref)
  const { name, slug, serial, reference } = useIdentity(entity);
  const { state, statusColor, timestamp: statusTime, metadata: statusMeta } = useStatus(entity);
  const { lineage, getAncestorId } = useLineage(entity);
  const { specs, formattedDimensions, formattedArea } = useSpecs(entity);

  /**
   * Fetch entity data from API
   */
  const fetch = async (id = identifier) => {
    if (!id) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch(`/api/${type}/${id}`);
      entity.value = data;
      return data;
    } catch (err) {
      error.value = err.data?.message || `Failed to fetch ${type}`;
      console.error(`[useEntity] Error fetching ${type}:`, err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Update entity data
   */
  const update = async (updates) => {
    loading.value = true;
    try {
      const data = await $fetch(`/api/${type}/${identifier || entity.value?.id}`, {
        method: 'PATCH',
        body: updates
      });
      entity.value = data;
      return data;
    } catch (err) {
      error.value = err.data?.message || `Failed to update ${type}`;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Perform status transition
   */
  const changeStatus = async (newState, metadata = {}) => {
    const id = entity.value?._id || entity.value?.id || identifier;
    const result = await transition(type, id, newState, metadata);
    if (result) {
      // Refresh to get latest state
      await fetch(id);
    }
    return result;
  };

  return {
    // State
    entity,
    loading,
    error,
    isTransitioning,

    // Blocks
    name,
    slug,
    serial,
    reference,
    state,
    statusColor,
    statusTime,
    statusMeta,
    lineage,
    specs,
    formattedDimensions,
    formattedArea,

    // Methods
    fetch,
    update,
    changeStatus,
    getAncestorId
  };
};
