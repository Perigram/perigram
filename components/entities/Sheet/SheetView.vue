<script setup>
/**
 * Sheet View Component - v24 Standardized
 */
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'compact' } // inline, compact, card, full
});

const { serial } = useIdentity(props.sheet);
const { state } = useStatus(props.sheet);
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-file text-[10px]"></i>
        <span class="font-mono text-xs">{{ serial }}</span>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded border flex items-center justify-center bg-surface-50">
          <i class="pi pi-file text-surface-300"></i>
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm">{{ serial }}</span>
          <span class="text-[10px] text-surface-400 uppercase font-black">Lineage: {{ sheet.lineage?.pileId?.substring(0,8) }}...</span>
        </div>
      </div>
      <EntityStatus :entity="sheet" variant="inline" />
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <div class="flex items-center justify-between mb-4">
        <span class="text-xs font-black text-surface-400 uppercase tracking-tighter">Physical Sheet</span>
        <EntityStatus :entity="sheet" variant="inline" />
      </div>
      <div class="text-center py-6 border-2 border-dashed rounded-lg bg-surface-0 mb-4">
        <span class="font-black text-xl text-surface-900 tracking-widest">{{ serial }}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-[10px]">
        <div class="p-2 bg-surface-50 rounded">
          <div class="text-surface-400 uppercase">Run ID</div>
          <div class="font-bold truncate">{{ sheet.lineage?.runId }}</div>
        </div>
        <div class="p-2 bg-surface-50 rounded">
          <div class="text-surface-400 uppercase">Pile ID</div>
          <div class="font-bold truncate">{{ sheet.lineage?.pileId }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
