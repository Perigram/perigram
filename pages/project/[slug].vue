<template>
    <div class="project-workspace">
        <div class="project-header">
            <div class="header-row">
                <h1>{{ project?.name || 'Project' }}</h1>
                
                <Button 
                    v-if="activeTab === 'batches'"
                    :label="$t('batches.create')"
                    icon="pi pi-plus"
                    size="small"
                    @click="createBatch"
                />
            </div>
            
            <TabMenu :model="tabs" :activeIndex="activeTabIndex" @tab-change="onTabChange" />
        </div>

        <div class="project-content">
            <NuxtPage />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
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
const activeTab = ref('batches');
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
    
    // Redirect to batches if on index
    if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
        await router.push(`/project/${slug}/batches`);
    }
});

watch(() => route.path, () => {
    updateActiveTab();
});

const updateActiveTab = () => {
    if (route.path.includes('/data')) {
        activeTab.value = 'data';
        activeTabIndex.value = 0;
    } else if (route.path.includes('/batches')) {
        activeTab.value = 'batches';
        activeTabIndex.value = 1;
    } else if (route.path.includes('/artifacts')) {
        activeTab.value = 'artifacts';
        activeTabIndex.value = 2;
    }
};

const onTabChange = (event) => {
    const tab = tabs.value[event.index];
    router.push(tab.to);
};

const createBatch = async () => {
    try {
        const batches = await $fetch(`/api/project/${slug}/batches`);
        const batchNumber = batches.length + 1;
        await $fetch(`/api/project/${slug}/batches`, {
            method: 'POST',
            body: {
                name: `Batch ${batchNumber}`,
                batchNumber,
                status: 'DRAFT',
                entries: []
            }
        });
        
        // Reload the page to show new batch
        router.go(0);
    } catch (error) {
        console.error('Failed to create batch:', error);
        alert('Failed to create batch');
    }
};
</script>

<style scoped lang="scss">
.project-workspace {
    width: 100%;
}

.project-header {
    margin-bottom: 1.5rem;
    
    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        
        h1 {
            font-size: 1.75rem;
            font-weight: 600;
            margin: 0;
            color: var(--text-color);
        }
    }
}

.project-content {
    padding-top: 1.5rem;
}
</style>
