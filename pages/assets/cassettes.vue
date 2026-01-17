<template>
    <div class="flex flex-col gap-6">
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
