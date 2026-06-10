<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const hasPreview = computed(() => Boolean(props.design.data?.geometry?.preview));
const dxfId = computed(() => props.design.data?.geometry?.dxfId || props.design.geometry?.dxfId || null);
</script>

<template>
  <div>
    <EntityCard :entity="design" entity-type="sheet_design" :variant="variant" class="card-interactive" :show-status="false">
      <template #before-identity>
        <i class="pi pi-map"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="hasPreview" :value="$t('cassette.preview')" severity="success" size="small" />
          <Tag v-if="dxfId" value="DXF" severity="secondary" size="small" />
        </div>
      </template>
      <template #compact-content>
        <SpecsBlock :entity="design" variant="compact" />
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <GeometryPreview :entity="design" />
        <SpecsBlock :entity="design" />
      </div>
    </EntityCard>
  </div>
</template>
