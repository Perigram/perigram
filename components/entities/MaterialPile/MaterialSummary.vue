<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  pile: { type: Object, required: true }
});

const { t } = useI18n();
const stock = computed(() => props.pile.data?.stock || {});
const remaining = computed(() => Math.max((stock.value.total || 0) - (stock.value.used || 0), 0));
const stockMovements = computed(() => Array.isArray(props.pile.data?.stockMovements) ? props.pile.data.stockMovements : []);
const lastMovement = computed(() => stockMovements.value[stockMovements.value.length - 1] || null);
const lastMovementLabel = computed(() => {
  if (!lastMovement.value) return '';
  const quantity = Number(lastMovement.value.quantity || 0);
  const prefix = quantity > 0 ? '+' : '';
  return `${t(`piles.stockMovementTypes.${lastMovement.value.type}`, lastMovement.value.type)} ${prefix}${quantity}`;
});
</script>

<template>
  <div class="flex flex-col gap-3">
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
    <div v-if="lastMovementLabel" class="flex items-center justify-between gap-3">
      <small class="text-muted-color">{{ $t('piles.lastMovement') }}</small>
      <span class="text-right font-medium">{{ lastMovementLabel }}</span>
    </div>
  </div>
</template>
