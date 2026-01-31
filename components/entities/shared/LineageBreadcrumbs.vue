<template>
  <div class="flex items-center gap-2 overflow-x-auto" v-if="lineageItems.length > 0">
    <template v-for="(item, index) in visibleItems" :key="index">
      <template v-if="item.type !== 'separator'">
          <component 
            :is="item.component" 
            :project="item.type === 'project' ? item.data : null"
            :queue="item.type === 'queue' ? item.data : null"
            :organization="item.type === 'organization' ? item.data : null"
            :warehouse="item.type === 'warehouse' ? item.data : null"
            variant="inline" 
          />
      </template>

      <template v-else>
          <Button label="..." text @click="isExpanded = true" />
      </template>

      <span v-if="index < visibleItems.length - 1">/</span>
    </template>
  </div>
</template>

<script setup>
/**
 * Universal Lineage Breadcrumbs - v24 Standardized
 */
import OrganizationCard from '../Organization/OrganizationCard.vue';
import WarehouseCard from '../Warehouse/WarehouseCard.vue';
import ProjectCard from '../Project/ProjectCard.vue';
import QueueCard from '../Queue/QueueCard.vue';
import Button from 'primevue/button';
import { ref, computed } from 'vue';

const props = defineProps({
  entity: { type: Object, default: null },
  lineage: { type: Object, default: null },
  expandable: { type: Boolean, default: false }
});

const isExpanded = ref(!props.expandable);

const activeLineage = computed(() => {
    return props.lineage || props.entity?.lineage || {};
});

const lineageItems = computed(() => {
    const items = [];
    const lin = activeLineage.value;

    if (lin.organizationId) {
        items.push({ 
            type: 'organization', 
            component: OrganizationCard, 
            data: { _id: lin.organizationId, identity: { name: 'Org' } } 
        });
    }
    if (lin.warehouseId) {
        items.push({ 
            type: 'warehouse', 
            component: WarehouseCard, 
            data: { _id: lin.warehouseId, identity: { name: 'Warehouse' } } 
        });
    }
    if (lin.projectId) {
        items.push({ 
            type: 'project', 
            component: ProjectCard, 
            data: { _id: lin.projectId, identity: { name: 'Project' } } 
        });
    }
    if (lin.queueId) {
        items.push({ 
            type: 'queue', 
            component: QueueCard, 
            data: { _id: lin.queueId, identity: { name: 'Queue' } } 
        });
    }
    return items;
});

const visibleItems = computed(() => {
    if (isExpanded.value || lineageItems.value.length <= 2) return lineageItems.value;
    return [lineageItems.value[0], { type: 'separator' }, lineageItems.value[lineageItems.value.length - 1]];
});
</script>