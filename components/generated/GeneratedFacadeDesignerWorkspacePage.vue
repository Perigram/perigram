<template>
  <FacadeDesigner :facade="facade" @saved="$emit('refresh')" />
</template>

<script setup>
import FacadeDesigner from '~/components/FacadeDesigner.vue';

defineProps({ facade: { type: Object, required: true } });
defineEmits(['refresh']);
</script>
