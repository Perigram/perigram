<template>
  <WorkbenchPage />
</template>

<script setup>
import WorkbenchPage from './workbench.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
