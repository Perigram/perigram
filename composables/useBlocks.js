import { computed, unref } from 'vue';

import { STATUS_MAPPINGS } from '~/utils/status-engine';

/**
 * Universal Block Composables - v24 Standardized
 */

export const useIdentity = (entity) => {
  const name = computed(() => {
    const e = unref(entity);
    return e?.identity?.name || e?.name || 'Unnamed';
  });
  const slug = computed(() => {
    const e = unref(entity);
    return e?.identity?.slug || e?.slug || e?.id || '';
  });
  const serial = computed(() => {
    const e = unref(entity);
    return e?.identity?.serial || e?.serial || '';
  });
  const reference = computed(() => {
    const e = unref(entity);
    return e?.identity?.reference || e?.reference || '';
  });
  
  return { name, slug, serial, reference };
};

export const useStatus = (entity) => {
  // If entity has 'state', it might be a status block already (e.g. from history array)
  // Otherwise try entity.status
  const statusBlock = computed(() => {
      const e = unref(entity);
      if (!e) return {};
      if (typeof e === 'string') return { state: e };
      if (e.state) return e;
      return e.status || {};
  });

  const state = computed(() => statusBlock.value.state || 'UNKNOWN');
  const timestamp = computed(() => statusBlock.value.timestamp ? new Date(statusBlock.value.timestamp) : null);
  const metadata = computed(() => statusBlock.value.metadata || {});
  
  const statusColor = computed(() => {
    // Try exact match in mappings
    const s = unref(state);
    const mapping = STATUS_MAPPINGS[s] || STATUS_MAPPINGS[s?.toLowerCase()];
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
    return colors[s] || 'secondary';
  });

  return { state, timestamp, metadata, statusColor };
};

export const useLineage = (entity) => {
  const lineage = computed(() => {
    const e = unref(entity);
    return e?.lineage || {};
  });
  
  const getAncestorId = (type) => lineage.value[`${type}Id`];
  
  return { lineage, getAncestorId };
};

export const useSpecs = (entity) => {
  const specs = computed(() => {
    const e = unref(entity);
    return e?.specs || {};
  });
  
  const formattedDimensions = computed(() => {
    const s = unref(specs);
    if (!s.width || !s.length) return '';
    return `${s.width} x ${s.length} mm`;
  });
  
  const formattedArea = computed(() => {
    const s = unref(specs);
    if (!s.area) return '0 m²';
    return `${s.area.toFixed(2)} m²`;
  });

  return { specs, formattedDimensions, formattedArea };
};
