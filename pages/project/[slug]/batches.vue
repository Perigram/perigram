<template>
    <div class="batches-page">
        <div class="page-header">
            <h2>{{ $t('project.batches') }}</h2>
            <Button 
                :label="$t('batches.create')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
            />
        </div>

        <BatchManagement :project-slug="slug" />
        
        <!-- Create Batch Dialog -->
        <Dialog 
            v-model:visible="showCreateDialog"
            :header="$t('batches.create')"
            modal
            :style="{ width: '500px' }"
        >
            <div class="create-form">
                <div class="field">
                    <label for="batchName">{{ $t('batches.name') }}</label>
                    <InputText 
                        id="batchName"
                        v-model="newBatchName"
                        :placeholder="$t('batches.enterName')"
                        class="w-full"
                    />
                </div>
            </div>
            <template #footer>
                <Button 
                    :label="$t('common.cancel')"
                    text
                    @click="showCreateDialog = false"
                />
                <Button 
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createBatch"
                />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import BatchManagement from '~/components/BatchManagement.vue';
import { batchesStore } from '~/composables/batches';

definePageMeta({
    layout: 'project',
    middleware: 'auth'
});

const route = useRoute();
const slug = route.params.slug;

const showCreateDialog = ref(false);
const newBatchName = ref('');
const creating = ref(false);

const { actions } = batchesStore;
const { createBatch: createBatchAction, fetchBatches } = actions;

const createBatch = async () => {
    creating.value = true;
    try {
        await createBatchAction(slug, {
            name: newBatchName.value || `Batch ${Date.now()}`
        });
        
        showCreateDialog.value = false;
        newBatchName.value = '';
        
        // Refresh batches
        await fetchBatches(slug);
    } catch (error) {
        console.error('Failed to create batch:', error);
    } finally {
        creating.value = false;
    }
};
</script>

<style lang="scss" scoped>
.batches-page {
    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        
        h2 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0;
        }
    }
}

.create-form {
    padding: 1rem 0;
    
    .field {
        margin-bottom: 1rem;
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: var(--text-color);
        }
    }
}
</style>
