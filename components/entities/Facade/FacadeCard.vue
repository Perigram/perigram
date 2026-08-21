<template>
  <EntityCard :entity="facade" entity-type="facade" :variant="variant">
    <EntitySurfaceContent :entity="facade" entity-type="facade" :surface="variant" />
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
defineProps({ facade: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
