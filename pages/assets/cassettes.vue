<template>
    <StandardPage :title="$t('assets.cassettes')">
        <CassetteManager />
    </StandardPage>
</template>

<script setup>
import CassetteManager from '~/components/CassetteManager.vue';
import StandardPage from '~/components/shared/StandardPage.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});
</script>
