<template>
    <div class="batches-workspace">
        <div class="workspace-header">
            <h1 class="project-title">{{ project?.name }}</h1>
            <div class="header-actions">
                <Button 
                    :label="$t('batches.create')"
                    icon="pi pi-plus"
                    @click="createNewBatch"
                />
            </div>
        </div>

        <div v-if="loading" class="loading-state">
            <ProgressSpinner />
        </div>

        <div v-else-if="!batches.value || batches.value.length === 0" class="empty-state">
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('batches.noBatches') }}</p>
            <Button 
                :label="$t('batches.createFirst')"
                icon="pi pi-plus"
                size="large"
                @click="createNewBatch"
            />
        </div>

        <TabView v-else v-model:activeIndex="activeTabIndex" class="batch-tabs">
            <TabPanel 
                v-for="(batch, index) in batches.value" 
                :key="batch._id"
                :header="batch.name || `Batch ${batch.batchNumber}`"
            >
                <div class="batch-content">
                    <BatchManagement 
                        :project-slug="slug" 
                        :batch-id="batch._id"
                    />
                </div>
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
import BatchManagement from '~/components/BatchManagement.vue';
import { batchesStore } from '~/composables/batches';

definePageMeta({
    layout: 'project',
    middleware: 'auth'
});

const route = useRoute();
const router = useRouter();
const slug = route.params.slug;

const project = ref(null);
const loading = ref(true);
const activeTabIndex = ref(0);

const { getters, actions } = batchesStore;
console.log('getters:', getters);
console.log('getters.batches:', getters.batches);
console.log('getters.batches.value:', getters.batches.value);
const batches = getters.batches; // Already a computed, don't wrap again
const { fetchBatches, createBatch } = actions;

onMounted(async () => {
    loading.value = true;
    try {
        // Load project data
        project.value = await $fetch(`/api/project/${slug}`);
        
        // Load batches
        await fetchBatches(slug);
        
        // Select last batch by default
        const currentBatches = batches.value || [];
        if (currentBatches.length > 0) {
            activeTabIndex.value = currentBatches.length - 1;
        }
    } catch (error) {
        console.error('Failed to load project/batches:', error);
    } finally {
        loading.value = false;
    }
});

const createNewBatch = async () => {
    console.log('createNewBatch called, slug:', slug);
    try {
        const currentBatches = batches.value || [];
        const batchNumber = currentBatches.length + 1;
        
        console.log('Creating batch:', { batchNumber, slug });
        
        const result = await createBatch(slug, {
            name: `Batch ${batchNumber}`,
            batchNumber,
            status: 'DRAFT',
            entries: []
        });
        
        console.log('Batch created:', result);
        
        // Refresh and select new batch
        await fetchBatches(slug);
        
        console.log('After fetch, batches.value is:', batches.value);
        console.log('batches.value type:', typeof batches.value, Array.isArray(batches.value));
        
        const updatedBatches = batches.value || [];
        activeTabIndex.value = updatedBatches.length - 1;
        
        console.log('Batches refreshed, count:', updatedBatches.length);
    } catch (error) {
        console.error('Failed to create batch:', error);
        alert('Failed to create batch: ' + error.message);
    }
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
            color: var(--text-color);
        }
        
        .header-actions {
            display: flex;
            gap: 0.75rem;
        }
    }
}

.loading-state {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
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

.batch-tabs {
    :deep(.p-tabview-nav) {
        background: var(--surface-card);
        border-bottom: 1px solid var(--surface-border);
    }
    
    :deep(.p-tabview-panels) {
        padding: 1.5rem 0;
        background: transparent;
    }
}

.batch-content {
    min-height: 400px;
}
</style>
