<template>
  <FacadePatternDesigner :pattern="facadePattern" @saved="$emit('refresh')" />
</template>

<script setup>
import FacadePatternDesigner from '~/components/FacadePatternDesigner.vue';

defineProps({ facadePattern: { type: Object, required: true } });
defineEmits(['refresh']);
</script>
