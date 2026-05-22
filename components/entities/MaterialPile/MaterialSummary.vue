<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';

const props = defineProps({
  pile: { type: Object, required: true }
});

const material = computed(() => props.pile.data?.material || props.pile.data?.catalog?.material || '');
const specs = computed(() => props.pile.specs || props.pile.data?.specs || {});
const stock = computed(() => props.pile.data?.stock || {});
const remaining = computed(() => Math.max((stock.value.total || 0) - (stock.value.used || 0), 0));
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Tag v-if="material" :value="material" severity="secondary" size="small" />
      <Tag v-if="specs.sheetThickness" :value="`${specs.sheetThickness} mm`" severity="info" size="small" />
      <Tag v-if="specs.foilThickness" :value="`${specs.foilThickness} mm`" severity="secondary" size="small" />
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="flex flex-col">
        <small class="text-muted-color">{{ $t('piles.stockTotal') }}</small>
        <span class="font-medium">{{ stock.total ?? $t('common.notAvailable') }}</span>
      </div>
      <div class="flex flex-col">
        <small class="text-muted-color">{{ $t('piles.remaining') }}</small>
        <span class="font-medium">{{ remaining }}</span>
      </div>
    </div>
  </div>
</template>
