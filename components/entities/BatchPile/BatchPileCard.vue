<template>
  <div>
    <InstanceCard :entity="pile" type-id="material_pile" :variant="variant" :show-status="false">
      <template #before-identity>
        <i class="pi pi-box"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap items-center gap-2">
          <Tag v-if="serial" :value="serial" severity="secondary" size="small" />
          <small v-if="stock">{{ remaining }} / {{ stock.total }}</small>
        </div>
      </template>
      <template #compact-content>
        <BatchPileSummary :pile="pile" />
      </template>
      <Divider />
      <div class="flex flex-col gap-4">
        <BatchPileSummary :pile="pile" />
        <SpecsBlock type-id="batchPile" :entity="pile" />
        <DataBlock type-id="batchPile" :entity="pile" :fields="BATCH_PILE_FIELDS" />
        <div v-if="requisitionId" class="flex flex-col gap-1 text-body">
          <small class="text-muted">{{ $t('entities.requisition') }}</small>
          <InstanceInlineRef type="requisition" :id="requisitionId" />
        </div>
      </div>
    </InstanceCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import BatchPileSummary from '~/components/entities/BatchPile/BatchPileSummary.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

const BATCH_PILE_FIELDS = resolveInstanceDisplayFields({ typeId: 'batchPile', surface: 'card' })
  .filter(field => field.display !== 'entityRef');

const props = defineProps({
    pile: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});

const stock = computed(() => props.pile.data?.stock || null);
const serial = computed(() => props.pile.data?.serial || props.pile.identity?.serial || '');
const remaining = computed(() => (stock.value?.total || 0) - (stock.value?.used || 0));
const requisitionId = computed(() => props.pile.lineage?.requisitionId || null);
</script>
