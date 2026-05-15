import { ref, computed } from 'vue';
import { useIdentity, useStatus, useLineage, useSpecs } from './useBlocks';
import { useStatusController } from './useStatusController';
import { createEndpointMap, getSingleEndpoint as resolveSingleEndpoint, getListEndpoint as resolveListEndpoint } from '~/packages/vue/src/index.js';
import { cncFrontendEntities } from '~/packages/domain-cnc/src/index.js';

const endpointMap = createEndpointMap(cncFrontendEntities);

/**
 * Unified Entity Composable - v24 Standardized
 * Provides a reactive bridge for interacting with v24 Block-based entities.
 * Covers both single-entity operations and collection listing.
 *
 * @param {string} type - Entity type key (e.g., 'project', 'queue')
 * @param {string} [identifier] - UID, ID, or slug for single-entity operations
 */
export const useEntity = (type, identifier = null) => {
  const entity = ref(null);
  const items = ref([]);
  const loading = ref(false);
  const error = ref(null);

  const { transition, isTransitioning } = useStatusController();

  // Block helpers — reactive to entity ref
  const { name, slug, serial, reference } = useIdentity(entity);
  const { state, statusColor, timestamp: statusTime, metadata: statusMeta } = useStatus(entity);
  const { lineage, getAncestorId } = useLineage(entity);
  const { specs, formattedDimensions, formattedArea } = useSpecs(entity);

  const getSingleEndpoint = (id = identifier || entity.value?._id || entity.value?.id) => {
    return resolveSingleEndpoint(endpointMap, type, id);
  };

  const getListEndpoint = (filters = {}) => {
    return resolveListEndpoint(endpointMap, type, filters);
  };

  /**
   * Fetch a single entity by ID or slug
   */
  const fetch = async (id = identifier) => {
    if (!id) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch(getSingleEndpoint(id));
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
   * Fetch a collection of entities, optionally filtered.
   * Results are stored in `items` ref.
   * @param {object} [filters] - Query params as key/value pairs
   */
  const list = async (filters) => {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch(getListEndpoint(filters));
      items.value = Array.isArray(data) ? data : data.items ?? data.projects ?? data.data ?? [];
      return items.value;
    } catch (err) {
      error.value = err.data?.message || `Failed to fetch ${type} list`;
      console.error(`[useEntity] Error listing ${type}:`, err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Update entity data (PATCH)
   */
  const update = async (updates) => {
    loading.value = true;
    try {
      const data = await $fetch(getSingleEndpoint(), {
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
   * Create a new entity (POST to list endpoint)
   */
  const create = async (data = {}) => {
    loading.value = true;
      error.value = null;
    try {
      const url = resolveListEndpoint(endpointMap, type);
      const result = await $fetch(url, { method: 'POST', body: data });
      entity.value = result;
      return result;
    } catch (err) {
      error.value = err.data?.message || `Failed to create ${type}`;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Delete an entity (DELETE to single endpoint)
   */
  const remove = async (id = identifier) => {
    loading.value = true;
    error.value = null;
    try {
      await $fetch(getSingleEndpoint(id), { method: 'DELETE' });
      entity.value = null;
    } catch (err) {
      error.value = err.data?.message || `Failed to delete ${type}`;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Perform a state machine status transition
   */
  const changeStatus = async (newState, metadata = {}) => {
    const id = entity.value?._id || entity.value?.id || identifier;
    const result = await transition(type, id, newState, metadata);
    if (result) {
      await fetch(id);
    }
    return result;
  };

  return {
    // Single entity state
    entity,
    loading,
    error,
    isTransitioning,

    // Collection state
    items,

    // Block computed refs
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
    list,
    create,
    update,
    remove,
    changeStatus,
    getAncestorId
  };
};
