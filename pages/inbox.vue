<template>
  <ActionInboxPage />
</template>

<script setup>
import ActionInboxPage from '~/components/generated/ActionInboxPage.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
