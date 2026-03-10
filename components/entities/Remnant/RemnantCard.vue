<script setup>
/**
 * RemnantCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  remnant: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <div class="h-full">
    <EntityCard :entity="remnant" entity-type="remnant" :variant="variant">
      <template #compact-content>
        <SpecsBlock :entity="remnant" variant="compact" />
      </template>
      <SpecsBlock v-if="variant === 'card'" :entity="remnant" />
    </EntityCard>
  </div>
</template>
