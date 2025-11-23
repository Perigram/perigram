<template>
    <div class="cassettes-page">
        <CassetteManager />
    </div>
</template>

<script setup>
import CassetteManager from '~/components/CassetteManager.vue';

definePageMeta({
    layout: "dashboard",
    middleware: "auth",
});
</script>

<style lang="scss" scoped>
.cassettes-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
}
</style>
