<template>
    <div class="batches-workspace">
        <ProgressSpinner v-if="loading" />

        <div v-else-if="batches.length === 0" class="empty-state">
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('batches.noBatches') }}</p>
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

const route = useRoute();
const slug = route.params.slug;

const batches = ref([]);
const loading = ref(true);
const activeTabIndex = ref(0);

const loadData = async () => {
    try {
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

const reloadBatches = async () => {
    batches.value = await $fetch(`/api/project/${slug}/batches`);
};
</script>

<style lang="scss" scoped>
.batches-workspace {
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
}
</style>
