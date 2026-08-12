<template>
  <EntityCard :entity="facade" entity-type="facade" :variant="variant">
    <template v-if="variant === 'card'"><DataBlock :entity="facade" :fields="facadeCardFields" /></template>
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { facadeCardFields } from '~/utils/facade-display.js';
defineProps({ facade: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
