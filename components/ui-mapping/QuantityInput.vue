<template>
  <InputGroup class="w-full">
    <InputNumber
      :model-value="model?.value ?? null"
      class="w-full"
      fluid
      @update:model-value="value => (model = { value, unit })"
    />
    <InputGroupAddon>{{ unit }}</InputGroupAddon>
  </InputGroup>
</template>

<script setup>
import InputNumber from 'primevue/inputnumber';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';

defineProps({ unit: { type: String, default: '' } });
const model = defineModel();
</script>
