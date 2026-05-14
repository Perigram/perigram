<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="design" variant="inline" icon="pi pi-clone" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="design" entity-type="cassette_design" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
          <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="design" variant="compact" />
            <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
          </div>
        </template>
      </EntityCard>
    </template>

    <template v-else>
      <EntityCard :entity="design" entity-type="cassette_design" variant="card" :show-trace="false" :show-status="false">
        <template #title>
          <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="design" />
            <Badge :value="Object.keys(design.parameters || {}).length" severity="secondary" size="small" />
          </div>
        </template>
        <Divider />
        <DataBlock :entity="design" :fields="DESIGN_FIELDS" />
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses EntityCard with status disabled.
 */
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const DESIGN_FIELDS = [
  { path: 'data.parameters.A', i18n: 'cassette.rootDim', suffix: ' mm' },
  { path: 'data.parameters.C', i18n: 'cassette.faceDepth', suffix: ' mm' },
  { path: 'data.geometry.dxfId', i18n: 'file.name' }
];
</script>
