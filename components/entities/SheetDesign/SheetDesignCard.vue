<script setup>
/**
 * Sheet Design View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

</script>

<template>
  <div>
    <EntityCard :entity="design" entity-type="sheet_design" :variant="variant" class="card-interactive" :show-status="false">
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <GeometryPreview :entity="design" />
        <SpecsBlock :entity="design" />
      </div>
    </EntityCard>
  </div>
</template>
