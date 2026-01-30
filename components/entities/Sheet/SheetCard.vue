<script setup>
/**
 * Sheet View Component - v24 Standardized
 * Model: identity, lineage, specs
 */
import Card from 'primevue/card';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'compact' }
});

const { serial } = useIdentity(props.sheet);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-file text-xs opacity-50"></i>
        <span class="font-mono font-bold text-xs">{{ serial }}</span>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center justify-between gap-4 p-2 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg">
        <div class="flex flex-col">
          <span class="font-bold font-mono text-xs">{{ serial }}</span>
          <small class="text-[10px] opacity-50 uppercase font-bold tracking-tight">
            PILE: {{ String(sheet.lineage?.pileId ?? "").slice(-8) }}
          </small>
        </div>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <div class="p-3 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl flex flex-col gap-3 h-full hover:border-primary transition-colors">
        <div class="flex justify-between items-center gap-2">
          <span class="font-bold font-mono text-sm text-primary truncate">{{ serial }}</span>
          <EntityStatus :entity="sheet" variant="inline" />
        </div>
        
        <div class="flex flex-col gap-1.5 pt-2 border-t border-surface-50 dark:border-surface-800 border-dashed text-xs">
          <div class="flex justify-between items-center">
            <span class="opacity-50 uppercase font-bold text-[10px]">Size</span>
            <span class="font-medium">{{ sheet.specs?.width }}x{{ sheet.specs?.length }}</span>
          </div>
          <div v-if="sheet.lineage?.runId" class="flex flex-col gap-0.5">
             <span class="opacity-50 uppercase font-bold text-[10px]">Run</span>
             <span class="font-mono text-[10px] opacity-60 truncate">{{ sheet.lineage.runId }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
