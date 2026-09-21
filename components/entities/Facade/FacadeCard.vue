<template>
  <EntityCard :entity="facade" type-id="facade" :variant="variant">
    <EntitySurfaceContent :entity="facade" type-id="facade" :surface="variant" />
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
defineProps({ facade: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
