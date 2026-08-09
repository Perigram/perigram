<template>
  <ChatSupport embedded full-page />
</template>

<script setup>
import ChatSupport from '~/components/ChatSupport.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
