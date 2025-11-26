<template>
    <div class="assets-page">
        <AssetsLibrary />
    </div>
</template>

<script setup>
import AssetsLibrary from '~/components/AssetsLibrary.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});
</script>

<style scoped>
.assets-page {
    padding: 1rem;
}
</style>
