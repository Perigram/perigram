<template>
    <div class="flex flex-col gap-6">
        <TabView :activeIndex="activeTabIndex" @tab-change="onTabChange">
            <TabPanel :header="$t('assets.cassettes')"></TabPanel>
            <TabPanel :header="$t('assets.pens')"></TabPanel>
            <TabPanel :header="$t('assets.tools')"></TabPanel>
            <TabPanel :header="$t('assets.templates')"></TabPanel>
        </TabView>
        <div class="px-1">
            <NuxtPage />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';

definePageMeta({
    layout: "app",
    middleware: "auth",
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const activeTabIndex = ref(0);

const tabs = computed(() => [
    { label: t('assets.cassettes'), to: '/assets/cassettes', key: 'cassettes' },
    { label: t('assets.pens'), to: '/assets/pens', key: 'pens' },
    { label: t('assets.tools'), to: '/assets/tools', key: 'tools' },
    { label: t('assets.templates'), to: '/assets/templates', key: 'templates' },
]);

onMounted(() => {
    updateActiveTab();
    
    // Redirect to cassettes if on assets root
    if (route.path === '/assets' || route.path === '/assets/') {
        router.replace('/assets/cassettes');
    }
});

watch(() => route.path, () => {
    updateActiveTab();
});

const updateActiveTab = () => {
    if (route.path.includes('/cassettes')) {
        activeTabIndex.value = 0;
    } else if (route.path.includes('/pens')) {
        activeTabIndex.value = 1;
    } else if (route.path.includes('/tools')) {
        activeTabIndex.value = 2;
    } else if (route.path.includes('/templates')) {
        activeTabIndex.value = 3;
    }
};

const onTabChange = (event) => {
    const tab = tabs.value[event.index];
    router.push(tab.to);
};
</script>
