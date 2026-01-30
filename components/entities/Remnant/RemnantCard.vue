<script setup>
/**
 * Remnant View Component - v24 Standardized
 * Model: identity, lineage, specs
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity, useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial } = useIdentity(props.remnant);
const { formattedArea } = useSpecs(props.remnant);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2 text-xs">
        <i class="pi pi-undo rotate-180 opacity-50"></i>
        <span class="font-mono font-bold">{{ serial }}</span>
        <EntityStatus :entity="remnant" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center justify-between gap-4 p-2 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg">
        <div class="flex flex-col">
          <span class="font-bold font-mono text-xs">{{ serial }}</span>
          <small class="text-[10px] opacity-50 uppercase font-bold tracking-tight">{{ formattedArea }}</small>
        </div>
        <EntityStatus :entity="remnant" variant="inline" />
      </div>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <div class="p-3 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl flex flex-col gap-3 h-full hover:border-primary transition-colors">
        <div class="flex justify-between items-center gap-2">
          <span class="font-bold font-mono text-sm text-primary truncate">{{ serial }}</span>
          <EntityStatus :entity="remnant" variant="inline" />
        </div>
        
        <div class="flex-1 flex flex-col gap-2">
            <div class="aspect-video bg-surface-50 dark:bg-surface-800 rounded-lg border border-surface-100 dark:border-surface-700 flex items-center justify-center opacity-20">
               <i class="pi pi-undo text-xl rotate-180"></i>
            </div>
            <div class="flex justify-between items-center mt-auto text-xs">
              <span class="opacity-50 uppercase font-bold text-[10px]">Area</span>
              <span class="font-medium">{{ formattedArea }}</span>
            </div>
        </div>
      </div>
    </template>
  </div>
</template>
