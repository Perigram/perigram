<script setup>
import Select from 'primevue/select';

defineOptions({ inheritAttrs: false });

defineProps({
  modelValue: { default: null }
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <Select
    v-bind="$attrs"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
