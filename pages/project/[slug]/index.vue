<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

// Redirect to batches on load
await navigateTo(`/project/${slug}/batches`, { replace: true });
</script>

<template>
    <div></div>
</template>
