<template>
  <div>
    <EntityCard :entity="design" entity-type="cassette_design" :variant="variant" :show-trace="false" :show-status="false">
      <template #subtitle>
        <Badge v-if="parameterCount" :value="parameterCount" severity="secondary" size="small" />
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="design" />
        <DataBlock :entity="design" :fields="DESIGN_FIELDS" />
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses EntityCard with status disabled.
 */
import { computed } from 'vue';
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const DESIGN_FIELDS = [
  { path: 'data.parameters.A', i18n: 'cassette.rootDim', suffix: ' mm' },
  { path: 'data.parameters.C', i18n: 'cassette.faceDepth', suffix: ' mm' }
];

const parameterCount = computed(() => Object.keys(props.design.data?.parameters || {}).length);
</script>
