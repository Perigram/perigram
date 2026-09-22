<script setup>
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceSurfaceContent from '~/components/shared/InstanceSurfaceContent.vue';

defineProps({
  artifactTemplate: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>

<template>
  <InstanceCard :entity="artifactTemplate" type-id="artifactTemplate" :variant="variant" :show-status="false">
    <InstanceSurfaceContent :entity="artifactTemplate" type-id="artifactTemplate" :surface="variant" />
    <template #footer>
      <slot name="footer" />
    </template>
  </InstanceCard>
</template>
