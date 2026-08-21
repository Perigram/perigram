<script setup>
import { computed } from 'vue';

const props = defineProps({
  pile: { type: Object, required: true }
});

const stock = computed(() => props.pile.data?.stock || {});
const remaining = computed(() => Math.max((stock.value.total || 0) - (stock.value.used || 0), 0));
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3 text-body">
      <div class="flex flex-col">
        <small class="text-muted-color">{{ $t('piles.stockTotal') }}</small>
        <span class="text-label">{{ stock.total ?? $t('common.notAvailable') }}</span>
      </div>
      <div class="flex flex-col">
        <small class="text-muted-color">{{ $t('piles.remaining') }}</small>
        <span class="text-label">{{ remaining }}</span>
      </div>
    </div>
  </div>
</template>
