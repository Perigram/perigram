<template>
  <EntityCard :entity="facadePattern" entity-type="facadePattern" :variant="variant">
    <EntitySurfaceContent :entity="facadePattern" entity-type="facadePattern" :surface="variant" />
  </EntityCard>
</template>
<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';
defineProps({ facadePattern: { type: Object, required: true }, variant: { type: String, default: 'card' } });
</script>
