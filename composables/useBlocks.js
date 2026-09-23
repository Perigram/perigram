import { computed, unref } from 'vue';

import { getPrimaryState, getStatusRegions, normalizeStatusState } from '~/packages/core/src/index.js';

/**
 * Universal Block Composables - v24 Standardized
 */

export const useStatus = (entity) => {
  // If entity has 'state', it might be a status block already (e.g. from history array)
  // Otherwise try entity.status
  const statusBlock = computed(() => {
      const e = unref(entity);
      if (!e) return {};
      if (typeof e === 'string') return { state: e };
      return e.status || {};
  });

  const stateObject = computed(() => normalizeStatusState(statusBlock.value.state || 'UNKNOWN'));
  const state = computed(() => getPrimaryState(statusBlock.value, 'UNKNOWN'));
  const regions = computed(() => getStatusRegions(statusBlock.value));
  const timestamp = computed(() => statusBlock.value.timestamp ? new Date(statusBlock.value.timestamp) : null);
  const metadata = computed(() => statusBlock.value.metadata || {});
  const lifecycle = computed(() => {
    const source = statusBlock.value.lifecycle || {};
    return {
      actors: Array.isArray(source.actors) ? source.actors : [],
      attachments: source.attachments || {},
      data: source.data || {}
    };
  });

  return { state, stateObject, regions, timestamp, metadata, lifecycle };
};

export const useLineage = (entity) => {
  const lineage = computed(() => {
    const e = unref(entity);
    return e?.lineage || {};
  });
  
  const getAncestorId = (type) => lineage.value[`${type}Id`];
  
  return { lineage, getAncestorId };
};
