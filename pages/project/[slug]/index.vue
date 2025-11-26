<script setup>
definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;

// Redirect to batches on load
if (!route.path.includes('/batches') && !route.path.includes('/data') && !route.path.includes('/artifacts') && !route.path.includes('/batch/')) {
  await navigateTo(`/project/${slug}/batches`, { replace: true });
}
</script>

<template>
    <div></div>
</template>
