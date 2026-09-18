<template>
  <InputChips v-model="model" class="w-full" />
</template>

<script setup>
import InputChips from 'primevue/inputchips';

const model = defineModel();
</script>
