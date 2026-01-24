import { computed } from 'vue';

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
  const state = computed(() => entity?.status?.state || 'UNKNOWN');
  const timestamp = computed(() => entity?.status?.timestamp ? new Date(entity.status.timestamp) : null);
  const metadata = computed(() => entity?.status?.metadata || {});
  
  const statusColor = computed(() => {
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
