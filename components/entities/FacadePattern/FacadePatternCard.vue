<template>
  <EntityCard :entity="facadePattern" entity-type="facadePattern" :variant="variant">
    <template v-if="variant === 'card'"><DataBlock :entity="facadePattern" :fields="fields" /></template>
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
defineProps({ facadePattern: { type: Object, required: true }, variant: { type: String, default: 'card' } });
const fields = [{ path: 'data.graph.nodes.length', i18n: 'facadePattern.nodes', display: 'count' }];
</script>
