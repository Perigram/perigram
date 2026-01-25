<script setup>
/**
 * Warehouse View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Badge from 'primevue/badge';

const props = defineProps({
  warehouse: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name } = useIdentity(props.warehouse);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 whitespace-nowrap">
        <i class="pi pi-building text-xs opacity-50"></i>
        <span class="font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card class="shadow-none border border-surface">
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col min-w-0">
              <span class="font-bold truncate leading-none mb-1 text-base">{{ name }}</span>
              <span class="text-[10px] opacity-50 uppercase font-black">{{ warehouse.type }}</span>
            </div>
            <Badge value="Active" severity="success" class="text-[8px]" />
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="h-full shadow-none border border-surface">
        <template #title>
          <div class="flex justify-between items-start gap-4 min-w-0">
            <span class="font-black text-xl leading-tight truncate">{{ name }}</span>
            <span class="text-[9px] font-black uppercase opacity-40 flex-shrink-0 italic">{{ warehouse.type }}</span>
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4 border-t border-surface border-dashed">
            <div class="p-3 border border-surface border-dashed rounded-xl flex items-start gap-2 opacity-80">
               <i class="pi pi-map-marker mt-1 text-xs opacity-50 flex-shrink-0"></i>
               <span class="text-xs">{{ warehouse.address }}</span>
            </div>
            <div class="flex justify-between items-center border-t border-surface pt-2 mt-auto text-[9px] uppercase font-black opacity-40">
               <span>Org ID</span>
               <span class="font-mono">{{ warehouse.lineage?.organizationId }}</span>
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
