<template>
    <div class="project-workspace">
        <NuxtPage />
    </div>
</template>

<script setup>
definePageMeta({
    layout: 'app',
    middleware: 'auth'
});
</script>

<style scoped lang="scss">
.project-workspace {
    width: 100%;
}
</style>