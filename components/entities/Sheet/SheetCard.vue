<script setup>
/**
 * SheetCard - v24 Standardized
 */
import SpecsBlock from '~/components/shared/blocks/SpecsBlock.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

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
      </template>
    </EntityCard>
  </div>
</template>
