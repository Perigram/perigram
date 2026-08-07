<template>
  <EntityCard :entity="facade" entity-type="facade" :variant="variant">
    <template v-if="variant === 'card'"><DataBlock :entity="facade" :fields="fields" /></template>
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
defineProps({ facade: { type: Object, required: true }, variant: { type: String, default: 'card' } });
const fields = [{ path: 'data.parts.length', i18n: 'facade.parts', display: 'count' }, { path: 'data.partAssignments.length', i18n: 'facade.assignments', display: 'count' }];
</script>
