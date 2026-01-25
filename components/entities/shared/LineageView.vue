<script setup>
/**
 * Universal Lineage Breadcrumbs - v24 Standardized
 */
import OrganizationView from '../Organization/OrganizationView.vue';
import WarehouseView from '../Warehouse/WarehouseView.vue';
import ProjectView from '../Project/ProjectView.vue';
import QueueView from '../Queue/QueueView.vue';
import CassetteDesignView from '../CassetteDesign/CassetteDesignView.vue';
import Button from 'primevue/button';
import { ref } from 'vue';

const props = defineProps({
  lineage: { type: Object, required: true },
  expandable: { type: Boolean, default: false }
});

const isExpanded = ref(!props.expandable);

const lineageItems = computed(() => {
    const items = [];
    if (props.lineage.organizationId) {
        items.push({ 
            type: 'organization', 
            component: OrganizationView, 
            data: { _id: props.lineage.organizationId, identity: { name: 'Org' } } 
        });
    }
    if (props.lineage.warehouseId) {
        items.push({ 
            type: 'warehouse', 
            component: WarehouseView, 
            data: { _id: props.lineage.warehouseId, identity: { name: 'Warehouse' } } 
        });
    }
    if (props.lineage.projectId) {
        items.push({ 
            type: 'project', 
            component: ProjectView, 
            data: { _id: props.lineage.projectId, identity: { name: 'Project' } } 
        });
    }
    if (props.lineage.queueId) {
        items.push({ 
            type: 'queue', 
            component: QueueView, 
            data: { _id: props.lineage.queueId, identity: { name: 'Queue' } } 
        });
    }
    return items;
});

const visibleItems = computed(() => {
    if (isExpanded.value || lineageItems.value.length <= 2) return lineageItems.value;
    return [lineageItems.value[0], { type: 'separator' }, lineageItems.value[lineageItems.value.length - 1]];
});
</script>

<template>
  <div class="flex items-center gap-2 overflow-x-auto py-2">
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
          <Button label="..." size="small" text @click="isExpanded = true" />
      </template>

      <i v-if="index < visibleItems.length - 1" class="pi pi-angle-right"></i>
    </template>
  </div>
</template>
