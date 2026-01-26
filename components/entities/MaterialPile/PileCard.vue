<script setup>
/**
 * Material Pile View Component - v24 Standardized
 * Model: identity, specs, stock
 */
import Card from 'primevue/card';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { name, serial } = useIdentity(props.pile);
const { formattedDimensions } = useSpecs(props.pile);

const usagePercentage = computed(() => {
  if (!props.pile.stock?.total) return 0;
  return Math.round((props.pile.stock.used / props.pile.stock.total) * 100);
});
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-database opacity-50"></i>
        <span class="font-bold">{{ serial || name }}</span>
        <EntityStatus :entity="pile" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card>
        <template #content>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="font-bold">{{ serial || name }}</span>
              <small class="opacity-50 uppercase font-bold">{{ formattedDimensions }}</small>
            </div>
            <EntityStatus :entity="pile" variant="inline" />
          </div>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="h-full">
        <template #title>
          <div class="flex justify-between items-start gap-4">
            <span class="font-bold">{{ serial || name }}</span>
            <EntityStatus :entity="pile" variant="inline" />
          </div>
        </template>
        <template #content>
          <div class="flex flex-col gap-4 pt-4">
            <div class="flex justify-between text-sm">
              <span class="opacity-50">Thickness</span>
              <span class="font-bold">{{ pile.specs?.sheetThickness }} mm</span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex justify-between text-xs opacity-50 uppercase font-bold">
                <span>Usage</span>
                <span>{{ pile.stock?.used }} / {{ pile.stock?.total }}</span>
              </div>
              <ProgressBar :value="usagePercentage" :showValue="false" />
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>
