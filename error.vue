<template>
  <StateBlock state="error">
    {{ error?.statusCode || 500 }}: {{ error?.message || 'Unexpected system error' }}
    <template #actions>
      <Button label="Go Back" icon="pi pi-arrow-left" severity="secondary" text @click="handleError" />
      <Button label="Dashboard" icon="pi pi-home" @click="navigateTo('/')" />
    </template>
  </StateBlock>
</template>

<script setup>
const props = defineProps({
  error: Object
});

const handleError = () => clearError({ redirect: '/' });
</script>
