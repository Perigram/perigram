import { computed } from 'vue';

import { STATUS_MAPPINGS } from '~/utils/status-engine';

/**
 * Universal Block Composables - v24 Standardized
 */

export const useIdentity = (entity) => {
  const name = computed(() => entity?.identity?.name || 'Unnamed');
  const slug = computed(() => entity?.identity?.slug || '');
  const serial = computed(() => entity?.identity?.serial || '');
  const reference = computed(() => entity?.identity?.reference || '');
  
  return { name, slug, serial, reference };
};

export const useStatus = (entity) => {
  // If entity has 'state', it might be a status block already (e.g. from history array)
  // Otherwise try entity.status
  const statusBlock = computed(() => {
      if (!entity) return {};
      if (typeof entity === 'string') return { state: entity };
      if (entity.state) return entity;
      return entity.status || {};
  });

  const state = computed(() => statusBlock.value.state || 'UNKNOWN');
  const timestamp = computed(() => statusBlock.value.timestamp ? new Date(statusBlock.value.timestamp) : null);
  const metadata = computed(() => statusBlock.value.metadata || {});
  
  const statusColor = computed(() => {
    // Try exact match in mappings
    const mapping = STATUS_MAPPINGS[state.value] || STATUS_MAPPINGS[state.value.toLowerCase()];
    if (mapping) return mapping.severity;

    const colors = {
      DRAFT: 'secondary',
      PENDING: 'warn',
      ACTIVE: 'primary',
      READY: 'success',
      CLOSED: 'info',
      MILLED: 'success',
      SCRAP: 'danger',
      FAILED: 'danger'
    };
    return colors[state.value] || 'secondary';
  });

  return { state, timestamp, metadata, statusColor };
};

export const useLineage = (entity) => {
  const lineage = computed(() => entity?.lineage || {});
  
  const getAncestorId = (type) => lineage.value[`${type}Id`];
  
  return { lineage, getAncestorId };
};

export const useSpecs = (entity) => {
  const specs = computed(() => entity?.specs || {});
  
  const formattedDimensions = computed(() => {
    if (!specs.value.width || !specs.value.length) return '';
    return `${specs.value.width} x ${specs.value.length} mm`;
  });
  
  const formattedArea = computed(() => {
    if (!specs.value.area) return '0 m²';
    return `${specs.value.area.toFixed(2)} m²`;
  });

  return { specs, formattedDimensions, formattedArea };
};
