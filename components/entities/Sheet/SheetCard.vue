<script setup>
/**
 * SheetCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import Divider from 'primevue/divider';

const SHEET_FIELDS = [
  { path: 'lineage.warehouseId', i18n: 'warehouse.title' }
];

const props = defineProps({
  sheet: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="sheet" entity-type="sheet" :variant="variant">
      <template #compact-content>
        <SpecsBlock :entity="sheet" variant="compact" />
      </template>
      <template v-if="variant === 'card'">
        <SpecsBlock :entity="sheet" />
        <Divider />
        <DataBlock :entity="sheet" :fields="SHEET_FIELDS" />
      </template>
    </EntityCard>
  </div>
</template>
