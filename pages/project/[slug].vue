<template>
    <div class="project-workspace">
        <div class="project-header">
            <h1>{{ project?.name || 'Project' }}</h1>
            <TabMenu :model="tabs" :activeIndex="activeTabIndex" @tab-change="onTabChange" />
        </div>
        <NuxtPage />
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import TabMenu from 'primevue/tabmenu';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const slug = route.params.slug;

const project = ref(null);
const activeTabIndex = ref(1);

const tabs = computed(() => [
    { label: t('project.data'), to: `/project/${slug}/data`, key: 'data' },
    { label: t('project.batches'), to: `/project/${slug}/batches`, key: 'batches' },
    { label: t('project.artifacts'), to: `/project/${slug}/artifacts`, key: 'artifacts' }
]);

onMounted(async () => {
    try {
        project.value = await $fetch(`/api/project/${slug}`);
    } catch (error) {
        console.error('Failed to load project:', error);
    }
    
    updateActiveTab();
    
    // Redirect to batches if on project root
    if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
        router.replace(`/project/${slug}/batches`);
    }
});

watch(() => route.path, () => {
    updateActiveTab();
});

const updateActiveTab = () => {
    if (route.path.includes('/data')) {
        activeTabIndex.value = 0;
    } else if (route.path.includes('/batches')) {
        activeTabIndex.value = 1;
    } else if (route.path.includes('/artifacts')) {
        activeTabIndex.value = 2;
    }
};

const onTabChange = (event) => {
    const tab = tabs.value[event.index];
    router.push(tab.to);
};
</script>

<style scoped lang="scss">
.project-workspace {
    width: 100%;
}

.project-header {
    margin-bottom: 1.5rem;
    
    h1 {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 0 0 1rem 0;
        color: var(--text-color);
    }
}
</style>