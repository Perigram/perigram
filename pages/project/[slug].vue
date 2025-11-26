<template>
    <div class="project-workspace">
        <NuxtPage />
    </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});

const route = useRoute();
const router = useRouter();

// Redirect to batches if on project root
onMounted(() => {
    if (route.path === `/project/${route.params.slug}` || route.path === `/project/${route.params.slug}/`) {
        router.replace(`/project/${route.params.slug}/batches`);
    }
});
</script>

<style scoped lang="scss">
.project-workspace {
    width: 100%;
}
</style>