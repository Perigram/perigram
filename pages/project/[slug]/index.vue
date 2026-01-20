<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

// Redirect to queues on load
await navigateTo(`/project/${slug}/queues`, { replace: true });
</script>

<template>
    <div></div>
</template>
