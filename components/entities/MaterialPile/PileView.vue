<script setup>
/**
 * Material Pile View Component - v24 Standardized
 */
import EntityStatus from '../shared/EntityStatus.vue';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card, full
});

const { name, serial } = useIdentity(props.pile);
const { formattedDimensions, formattedArea } = useSpecs(props.pile);

const usagePercentage = computed(() => {
  if (!props.pile.stock?.total) return 0;
  return Math.round((props.pile.stock.used / props.pile.stock.total) * 100);
});
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <span class="font-mono text-xs">{{ serial }}</span>
      <EntityStatus :entity="pile" variant="inline" />
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <div class="flex items-center gap-3">
        <i class="pi pi-database text-surface-400"></i>
        <div class="flex flex-col">
          <span class="font-bold text-sm">{{ serial || name }}</span>
          <span class="text-xs text-surface-500">{{ formattedDimensions }}</span>
        </div>
      </div>
      <div class="text-right">
        <span class="text-xs font-bold">{{ pile.stock?.total - pile.stock?.used }} left</span>
      </div>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <div class="block-header">
        <div class="flex flex-col">
          <span class="text-[10px] uppercase text-surface-400 font-black tracking-widest">Material Pile</span>
          <span class="font-bold text-surface-900">{{ serial || name }}</span>
        </div>
        <EntityStatus :entity="pile" variant="inline" />
      </div>

      <div class="my-4 grid grid-cols-2 gap-2 p-3 bg-surface-50 rounded-lg">
        <div class="flex flex-col">
          <span class="text-[9px] text-surface-400 uppercase">Dimensions</span>
          <span class="text-xs font-bold">{{ formattedDimensions }}</span>
        </div>
        <div class="flex flex-col text-right">
          <span class="text-[9px] text-surface-400 uppercase">Thickness</span>
          <span class="text-xs font-bold">{{ pile.specs?.sheetThickness }}mm</span>
        </div>
      </div>

      <div class="mt-auto pt-4 flex flex-col gap-2">
        <div class="flex justify-between text-[10px]">
          <span class="text-surface-500 italic">Inventory Usage</span>
          <span class="font-bold">{{ pile.stock?.used }} / {{ pile.stock?.total }}</span>
        </div>
        <ProgressBar :value="usagePercentage" style="height: 4px" />
      </div>
    </template>

    <!-- Full View -->
    <template v-else-if="variant === 'full'">
      <!-- Full view implementation... -->
      <div class="text-center p-10 text-surface-400 italic border rounded-xl border-dashed">
        Detailed Pile View - Standard Specs & History would go here
      </div>
    </template>
  </div>
</template>
