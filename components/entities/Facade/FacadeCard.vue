<template>
  <InstanceCard :entity="facade" type-id="facade" :variant="variant">
    <InstanceSurfaceContent :entity="facade" type-id="facade" :surface="variant" />
  </InstanceCard>
</template>
<script setup>
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
defineProps({ facade: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
