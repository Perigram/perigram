<script setup>
/**
 * RemnantCard - v24 Standardized
 * Browsing flow: judge recoverable material (geometry + area) at a glance.
 * Sheet provenance lives on the detail page, not in grid cards.
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import Divider from 'primevue/divider';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';

defineProps({
    remnant: { type: Object, required: true },
    variant: { type: String, default: 'card' }
});
</script>

<template>
  <div class="h-full">
    <InstanceCard :entity="remnant" type-id="remnant" :variant="variant">
      <template #before-identity>
        <i class="ck-entity-icon ck-entity-icon-remnant"></i>
      </template>
      <template #compact-content>
        <div class="mt-3 flex flex-col gap-3">
          <GeometryPreview :entity="remnant" />
          <SpecsBlock type-id="remnant" :entity="remnant" variant="compact" />
        </div>
      </template>
      <div class="flex flex-col gap-3">
        <GeometryPreview :entity="remnant" />
        <Divider />
        <SpecsBlock type-id="remnant" :entity="remnant" />
      </div>
    </InstanceCard>
  </div>
</template>
