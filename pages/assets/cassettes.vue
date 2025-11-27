<template>
    <div class="p-4">
        <CassetteManager />
    </div>
</template>

<script setup>
import CassetteManager from '~/components/CassetteManager.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});
</script>
