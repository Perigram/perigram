<template>
  <EntityCard :entity="facadePattern" type-id="facadePattern" :variant="variant">
    <EntitySurfaceContent :entity="facadePattern" type-id="facadePattern" :surface="variant" />
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
defineProps({ facadePattern: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
