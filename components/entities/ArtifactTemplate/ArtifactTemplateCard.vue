<script setup>
import EntityCard from '~/components/shared/EntityCard.vue';
import EntitySurfaceContent from '~/components/shared/EntitySurfaceContent.vue';

defineProps({
  artifactTemplate: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <EntityCard :entity="artifactTemplate" type-id="artifactTemplate" :variant="variant" :show-status="false">
    <EntitySurfaceContent :entity="artifactTemplate" type-id="artifactTemplate" :surface="variant" />
    <template #footer>
      <slot name="footer" />
    </template>
  </EntityCard>
</template>
