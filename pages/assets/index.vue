<template>
        <div class="flex flex-col gap-6">
            <Tabs :value="activeTabIndex">
                <TabList>
                    <Tab v-for="(tab, index) in tabs" :key="tab.key" :value="index" @click="onTabChange(index)">
                        <span>{{ tab.label }}</span>
                    </Tab>
                </TabList>
            </Tabs>
            <div class="px-1">            <NuxtPage />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';

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
    { label: t('assets.layerStandards'), to: '/assets/layer-standards', key: 'layer-standards' },
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
    } else if (route.path.includes('/layer-standards')) {
        activeTabIndex.value = 2;
    } else if (route.path.includes('/tools')) {
        activeTabIndex.value = 3;
    } else if (route.path.includes('/templates')) {
        activeTabIndex.value = 4;
    }
};

const onTabChange = (index) => {
    const tab = tabs.value[index];
    router.push(tab.to);
};
</script>
