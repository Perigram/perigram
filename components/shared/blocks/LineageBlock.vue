<script setup>
/**
 * LineageBlock - v24 Standardized
 * Displays breadcrumbs for entity lineage.
 */
import { computed } from 'vue';
import { useLineage } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true }
});

const { lineage } = useLineage(props.entity);

const items = computed(() => {
    const list = [];
    if (lineage.value.organizationId) list.push({ label: 'Organization', id: lineage.value.organizationId });
    if (lineage.value.warehouseId) list.push({ label: 'Warehouse', id: lineage.value.warehouseId });
    if (lineage.value.projectId) list.push({ label: 'Project', id: lineage.value.projectId });
    if (lineage.value.queueId) list.push({ label: 'Queue', id: lineage.value.queueId });
    return list;
});
</script>

<template>
  <div v-if="items.length > 0" class="flex items-center gap-1 flex-wrap">
    <template v-for="(item, index) in items" :key="item.id">
      <small>{{ item.label }}</small>
      <span v-if="index < items.length - 1" class="mx-1">/</span>
    </template>
  </div>
</template>