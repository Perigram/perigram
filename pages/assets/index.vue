<template>
    <StandardPage :title="$t('features.assets')">
        <StateBlock state="loading" :message="$t('common.loading')" />
    </StandardPage>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const router = useRouter();

onMounted(() => {
    router.replace('/assets/cassettes');
});
</script>
