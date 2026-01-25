<script setup>
/**
 * Nesting Run View Component - v24 Standardized
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  run: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { state, statusColor } = useStatus(props.run);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-directions text-[10px] opacity-50"></i>
        <span class="font-bold text-xs">Run #{{ run._id?.toString().slice(-4) }}</span>
        <EntityStatus :entity="run" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="font-bold text-sm">Run #{{ run._id?.toString().slice(-4) }}</span>
              <small class="opacity-50 text-[10px]">{{ run.results?.sheetCount || 0 }} Sheets</small>
            </div>
            <EntityStatus :entity="run" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card class="h-full border-l-4" :style="{ borderLeftColor: `var(--p-${statusColor}-500)` }">
        <template #title>
          <div class="flex justify-between items-start">
            <span class="font-bold text-lg">Nesting Solution</span>
            <EntityStatus :entity="run" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="grid grid-cols-2 gap-4 pt-4">
            <div class="flex flex-col p-2 bg-surface-50 dark:bg-surface-900 rounded">
              <span class="text-[10px] font-bold opacity-40 uppercase">Efficiency</span>
              <span class="text-xl font-black">{{ run.results?.efficiency }}%</span>
            </div>
            <div class="flex flex-col p-2 bg-surface-50 dark:bg-surface-900 rounded">
              <span class="text-[10px] font-bold opacity-40 uppercase">Sheets</span>
              <span class="text-xl font-black">{{ run.results?.sheetCount }}</span>
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
