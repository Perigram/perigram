<template>
  <EntityCard :entity="facadePattern" entity-type="facadePattern" :variant="variant">
    <template v-if="variant === 'card'"><DataBlock :entity="facadePattern" :fields="facadePatternCardFields" /></template>
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { facadePatternCardFields } from '~/utils/facade-display.js';
defineProps({ facadePattern: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
