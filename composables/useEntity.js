import { useRequestHeaders } from '#app';
import { ref, computed } from 'vue';
import { useIdentity, useStatus, useLineage, useSpecs } from './useBlocks';
import { useStatusController } from './useStatusController';
import { useCutkitDomainUi } from './useCutkitDomainUi';
import { emitEntityCreated, emitEntityDeleted, emitEntityUpdated } from '~/utils/entity-events.js';
import { useOutboxStore } from '~/stores/outbox';
import { isOfflineQueuedError } from '~/utils/outbox.js';

/**
 * Unified Entity Composable - v24 Standardized
 * Provides a reactive bridge for interacting with v24 Block-based entities.
 * Covers both single-entity operations and collection listing.
 *
 * @param {string} type - Entity type key (e.g., 'project', 'queue')
 * @param {string} [identifier] - UID, ID, or slug for single-entity operations
 */
export const useEntity = (type, identifier = null) => {
  const domainUi = useCutkitDomainUi();
  const entity = ref(null);
  const items = ref([]);
  const loading = ref(false);
  const error = ref(null);

  const { transition, isTransitioning } = useStatusController();

  // Block helpers — reactive to entity ref
  const { name, slug, serial, reference } = useIdentity(entity);
  const { state, stateObject, regions: statusRegions, statusColor, timestamp: statusTime, metadata: statusMeta, lifecycle: statusLifecycle } = useStatus(entity);
  const { lineage, getAncestorId } = useLineage(entity);
  const { specs, formattedDimensions, formattedArea } = useSpecs(entity);

  const getSingleEndpoint = (id = identifier || entity.value?._id) => {
    return domainUi.getSingleEndpoint(type, id);
  };

  const getListEndpoint = (filters = {}) => {
    return domainUi.getListEndpoint(type, filters);
  };

  /**
   * Fetch a single entity by ID or slug
   */
  const fetch = async (id = identifier, options = {}) => {
    if (!id) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch(getSingleEndpoint(id), entityFetchOptions());
      entity.value = data;
      return data;
    } catch (err) {
      error.value = err.data?.message || `Failed to fetch ${type}`;
      if (!options.silent) {
        console.error(`[useEntity] Error fetching ${type}:`, err);
      }
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
  const list = async (filters, options = {}) => {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch(getListEndpoint(filters), entityFetchOptions());
      items.value = Array.isArray(data) ? data : data.items ?? data.projects ?? data.data ?? [];
      return items.value;
    } catch (err) {
      error.value = err.data?.message || `Failed to fetch ${type} list`;
      if (!options.silent) {
        console.error(`[useEntity] Error listing ${type}:`, err);
      }
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Update entity data (PATCH)
   */
  const update = async (updates, id = identifier || entity.value?._id) => {
    loading.value = true;
    try {
      const data = await mutateOffline({
        url: getSingleEndpoint(id),
        method: 'PATCH',
        body: updates,
        meta: { kind: 'entity', entityType: type, entityId: id, change: 'updated', reason: 'update' }
      });
      entity.value = data;
      emitEntityUpdated({ type, id: data?._id || id, entity: data });
      publishEntityMutation({ type, id: data?._id || id, change: 'updated', reason: 'update' });
      return data;
    } catch (err) {
      error.value = queuedOrErrorMessage(err, `Failed to update ${type}`);
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
      const url = domainUi.getListEndpoint(type);
      const result = await mutateOffline({
        url,
        method: 'POST',
        body: data,
        meta: { kind: 'entity', entityType: type, change: 'created', reason: 'create' }
      });
      entity.value = result;
      emitEntityCreated({ type, id: result?._id, entity: result });
      publishEntityMutation({ type, id: result?._id, change: 'created', reason: 'create' });
      return result;
    } catch (err) {
      error.value = queuedOrErrorMessage(err, `Failed to create ${type}`);
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
      const removedId = id || entity.value?._id;
      const removedEntity = entity.value;
      await mutateOffline({
        url: getSingleEndpoint(id),
        method: 'DELETE',
        meta: { kind: 'entity', entityType: type, entityId: removedId, change: 'deleted', reason: 'delete' }
      });
      entity.value = null;
      emitEntityDeleted({ type, id: removedId, entity: removedEntity });
      publishEntityMutation({ type, id: removedId, change: 'deleted', reason: 'delete' });
    } catch (err) {
      error.value = queuedOrErrorMessage(err, `Failed to delete ${type}`);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Perform a state machine status transition
   */
  const changeStatus = async (newState, context = {}) => {
    const id = entity.value?._id || identifier;
    const result = await transition(type, id, newState, context);
    if (result?.entity) {
      entity.value = result.entity;
    } else if (result) {
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
    stateObject,
    statusRegions,
    statusColor,
    statusTime,
    statusMeta,
    statusLifecycle,
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

function entityFetchOptions(options = {}) {
  if (!import.meta.server) return options;
  return {
    ...options,
    headers: {
      ...useRequestHeaders(['cookie']),
      ...(options.headers || {})
    }
  };
}

async function mutateOffline({ url, method, body, meta }) {
  if (typeof window === 'undefined') {
    return $fetch(url, entityFetchOptions({ method, body }));
  }
  const outbox = useOutboxStore();
  return outbox.mutate({ url, method, body, meta });
}

function queuedOrErrorMessage(err, fallback) {
  if (isOfflineQueuedError(err)) return err.message;
  return err.data?.message || fallback;
}

function publishEntityMutation(detail = {}) {
  if (import.meta.server || !detail.type || !detail.id) return;
  $fetch('/api/entity-events', {
    method: 'POST',
    body: detail
  }).catch(() => null);
}
