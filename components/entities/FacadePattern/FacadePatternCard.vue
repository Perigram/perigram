<template>
  <InstanceCard :entity="facadePattern" type-id="facadePattern" :variant="variant">
    <InstanceSurfaceContent :entity="facadePattern" type-id="facadePattern" :surface="variant" />
  </InstanceCard>
</template>
<script setup>
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';
defineProps({ facadePattern: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
