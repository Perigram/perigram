<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const DESIGN_FIELDS = [
  { path: 'lineage.queueId', i18n: 'entities.queue' },
  { path: 'data.geometry.dxfId', i18n: 'file.name' }
];
</script>

<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-map" />
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="design" entity-type="sheet_design" variant="compact" class="card-interactive" :show-trace="false" />
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="design" entity-type="sheet_design" variant="card" class="card-interactive" :show-trace="false">
        <Divider />
        <SpecsBlock :entity="design" />
        <Divider />
        <DataBlock :entity="design" :fields="DESIGN_FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>
