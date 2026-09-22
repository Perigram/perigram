<template>
  <InstanceCard :entity="profile" type-id="profileTemplate" :variant="variant" :show-trace="false" :show-status="false">
    <template v-if="variant === 'card'">
      <Divider />
      <DataBlock type-id="profileTemplate" :entity="profile" :fields="FIELDS" />
    </template>
  </InstanceCard>
</template>

<script setup>
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';

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

const FIELDS = resolveInstanceDisplayFields({ typeId: 'profileTemplate', surface: 'card' });
</script>
