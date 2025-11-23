<template>
    <div class="project-workspace">
        <div class="project-header">
            <h1>{{ project?.name || 'Project' }}</h1>
            
            <div class="project-tabs-and-actions">
                <div class="project-tabs">
                    <button 
                        v-for="tab in tabs" 
                        :key="tab.path"
                        :class="['tab-button', { active: isActiveTab(tab.path) }]"
                        @click="navigateToTab(tab.path)"
                    >
                        {{ tab.label }}
                    </button>
                </div>
                
                <Button 
                    v-if="isActiveTab('batches')"
                    :label="$t('batches.create')"
                    icon="pi pi-plus"
                    size="small"
                    @click="createBatch"
                />
            </div>
        </div>

        <div class="project-content">
            <NuxtPage />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const slug = route.params.slug;

const project = ref(null);

const tabs = computed(() => [
    { label: t('project.data'), path: 'data' },
    { label: t('project.batches'), path: 'batches' },
    { label: t('project.artifacts'), path: 'artifacts' }
]);

onMounted(async () => {
    try {
        project.value = await $fetch(`/api/project/${slug}`);
    } catch (error) {
        console.error('Failed to load project:', error);
    }
    
    // Redirect to batches if on index
    if (route.path === `/project/${slug}` || route.path === `/project/${slug}/`) {
        await router.push(`/project/${slug}/batches`);
    }
});

const isActiveTab = (tabPath) => {
    return route.path.includes(`/project/${slug}/${tabPath}`);
};

const navigateToTab = (tabPath) => {
    router.push(`/project/${slug}/${tabPath}`);
};

const createBatch = async () => {
    try {
        const batchNumber = await $fetch(`/api/project/${slug}/batches`).then(batches => batches.length + 1);
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
    
    h1 {
        font-size: 1.75rem;
        font-weight: 600;
        margin-bottom: 1rem;
        color: var(--text-color);
    }
}

.project-tabs-and-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid var(--surface-border);
}

.project-tabs {
    display: flex;
    gap: 0.5rem;
    flex: 1;
}

.tab-button {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-color-secondary);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
        color: var(--primary-color);
        background: var(--surface-hover);
    }
    
    &.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
    }
}

.project-content {
    padding-top: 1.5rem;
}
</style>
