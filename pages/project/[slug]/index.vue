<script setup>
// Redirect to batches (main workspace)
definePageMeta({
    middleware: 'auth'
});

const route = useRoute();
const slug = route.params.slug;

// Immediate redirect to batches
navigateTo(`/project/${slug}/batches`, { replace: true });
</script>

<template>
    <div>Redirecting...</div>
</template>
