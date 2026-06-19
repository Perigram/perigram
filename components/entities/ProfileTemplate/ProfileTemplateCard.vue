<template>
  <EntityCard :entity="profile" entity-type="profileTemplate" :variant="variant" :show-trace="false" :show-status="false">
    <template v-if="variant === 'card'">
      <Divider />
      <DataBlock entity-type="profileTemplate" :entity="profile" :fields="FIELDS" />
    </template>
  </EntityCard>
</template>

<script setup>
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';

defineProps({
  profile: {
    type: Object,
    required: true
  },
  variant: {
    type: String,
    default: 'card'
  }
});

const FIELDS = [
  { path: 'data.kind', i18n: 'cassette.v2.profileEditor.kind' },
  { path: 'data.process', i18n: 'cassette.v2.profileEditor.process' }
];
</script>

