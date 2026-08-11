<template>
  <ChatSupport :embedded="true" :full-page="true" />
</template>

<script setup>
import ChatSupport from '~/components/ChatSupport.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});
</script>
