<template>
    <div class="">
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
</style>
