<template>
    <div class="batches-workspace">
        <div class="workspace-header">
            <h1 class="project-title">{{ project?.name || 'Project' }}</h1>
            <Button 
                :label="$t('batches.create')"
                icon="pi pi-plus"
                @click="createNewBatch"
            />
        </div>

        <ProgressSpinner v-if="loading" />

        <div v-else-if="batches.length === 0" class="empty-state">
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('batches.noBatches') }}</p>
            <Button 
                :label="$t('batches.createFirst')"
                icon="pi pi-plus"
                size="large"
                @click="createNewBatch"
            />
        </div>

        <TabView v-else v-model:activeIndex="activeTabIndex">
            <TabPanel 
                v-for="batch in batches" 
                :key="batch._id"
                :header="batch.name || `Batch ${batch.batchNumber}`"
            >
                <BatchEditor 
                    :batch="batch"
                    :project-slug="slug"
                    @updated="reloadBatches"
                />
            </TabPanel>
        </TabView>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import ProgressSpinner from 'primevue/progressspinner';
import BatchEditor from '~/components/BatchEditor.vue';

definePageMeta({
    layout: 'project',
    middleware: 'auth'
});

const route = useRoute();
const slug = route.params.slug;

const project = ref(null);
const batches = ref([]);
const loading = ref(true);
const activeTabIndex = ref(0);

const loadData = async () => {
    try {
        project.value = await $fetch(`/api/project/${slug}`);
        batches.value = await $fetch(`/api/project/${slug}/batches`);
        if (batches.value.length > 0 && activeTabIndex.value === 0) {
            activeTabIndex.value = batches.value.length - 1;
        }
    } catch (error) {
        console.error('Failed to load:', error);
    } finally {
        loading.value = false;
    }
};

onMounted(loadData);

const createNewBatch = async () => {
    try {
        const batchNumber = batches.value.length + 1;
        await $fetch(`/api/project/${slug}/batches`, {
            method: 'POST',
            body: {
                name: `Batch ${batchNumber}`,
                batchNumber,
                status: 'DRAFT',
                entries: []
            }
        });
        
        await reloadBatches();
        activeTabIndex.value = batches.value.length - 1;
    } catch (error) {
        console.error('Failed to create batch:', error);
        alert('Failed to create batch');
    }
};

const reloadBatches = async () => {
    batches.value = await $fetch(`/api/project/${slug}/batches`);
};
</script>

<style lang="scss" scoped>
.batches-workspace {
    .workspace-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--surface-border);
        
        .project-title {
            font-size: 1.75rem;
            font-weight: 600;
            margin: 0;
        }
    }
}

.empty-state {
    text-align: center;
    padding: 4rem 2rem;
    
    .empty-icon {
        font-size: 4rem;
        color: var(--text-color-secondary);
        margin-bottom: 1rem;
        opacity: 0.5;
    }
    
    .empty-text {
        font-size: 1.125rem;
        color: var(--text-color-secondary);
        margin-bottom: 1.5rem;
    }
}
</style>
