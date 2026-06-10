<script setup>
/**
 * SheetCard - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const warehouseId = computed(() => props.sheet.lineage?.warehouseId || null);
const pileId = computed(() => props.sheet.lineage?.pileId || null);
const runId = computed(() => props.sheet.lineage?.runId || null);
const thickness = computed(() => props.sheet.specs?.sheetThickness || props.sheet.data?.specs?.sheetThickness || null);
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="sheet" entity-type="sheet" :variant="variant">
      <template #before-identity>
        <i class="pi pi-file"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="thickness" :value="`${thickness} mm`" severity="secondary" size="small" />
          <Tag v-if="warehouseId" :value="$t('entities.warehouse')" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <SpecsBlock :entity="sheet" variant="compact" />
      </template>
      <div class="flex flex-col gap-3">
        <Divider />
        <SpecsBlock :entity="sheet" />
        <div v-if="warehouseId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
          <TraceLink type="warehouse" :id="warehouseId" />
        </div>
        <div v-if="pileId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.materialPile') }}</small>
          <TraceLink type="material_pile" :id="pileId" />
        </div>
        <div v-if="runId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.nestingRun') }}</small>
          <TraceLink type="nesting_run" :id="runId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>
