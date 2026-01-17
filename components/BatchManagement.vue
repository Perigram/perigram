<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-4 px-1">
      <h2 class="text-xl font-bold text-[var(--p-text-color)]">{{ $t('batch.title') }}</h2>
      <Button 
        :label="$t('batch.create')" 
        icon="pi pi-plus" 
        @click="showCreateDialog = true"
      />
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner />
    </div>

    <div v-else-if="error" class="mb-4">
      <Message severity="error">{{ error }}</Message>
    </div>

    <div v-else-if="batches.length === 0" class="text-center py-16 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]">
      <i class="pi pi-inbox text-5xl text-[var(--p-text-muted-color)] mb-4 opacity-50 block"></i>
      <p class="text-lg text-[var(--p-text-secondary-color)] mb-6">{{ $t('batch.empty') }}</p>
      <Button 
        :label="$t('batch.createFirst')" 
        icon="pi pi-plus" 
        @click="showCreateDialog = true"
      />
    </div>

    <div v-else>
      <DataTable 
        :value="batches" 
        :paginator="batches.length > 10" 
        :rows="10"
        responsiveLayout="scroll"
        class="border border-[var(--p-content-border-color)] rounded-lg overflow-hidden"
      >
        <Column field="name" :header="$t('batch.name')" class="font-medium" />
        <Column field="status" :header="$t('batch.status')">
          <template #body="slotProps">
            <Tag 
              :value="$t(`batch.batchStatus.${slotProps.data.status}`)" 
              :severity="getStatusSeverity(slotProps.data.status)"
            />
          </template>
        </Column>
        <Column field="createdAt" :header="$t('batch.created')">
          <template #body="slotProps">
            <span class="text-sm text-[var(--p-text-muted-color)]">
              {{ formatDate(slotProps.data.createdAt) }}
            </span>
          </template>
        </Column>
        <Column :header="$t('common.actions')" class="text-right">
          <template #body="slotProps">
            <div class="flex justify-end gap-2">
              <Button 
                icon="pi pi-pencil" 
                severity="secondary" 
                text
                rounded
                size="small"
                @click="editBatch(slotProps.data)"
                v-tooltip.top="$t('common.edit')"
              />
              <Button 
                icon="pi pi-play" 
                severity="success" 
                text
                rounded
                size="small"
                :disabled="slotProps.data.status !== 'DRAFT'"
                @click="runNesting(slotProps.data)"
                v-tooltip.top="$t('batches.runNesting')"
              />
              <Button 
                v-if="['FAILED', 'NESTING'].includes(slotProps.data.status)"
                icon="pi pi-refresh" 
                severity="warning" 
                text
                rounded
                size="small"
                v-tooltip.top="$t('batch.resetToDraft')"
                @click="resetBatch(slotProps.data)"
              />
              <Button 
                icon="pi pi-trash" 
                severity="danger" 
                text
                rounded
                size="small"
                @click="deleteBatch(slotProps.data)"
                v-tooltip.top="$t('common.delete')"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create Batch Dialog -->
    <Dialog 
      v-model:visible="showCreateDialog" 
      :header="$t('batch.createTitle')" 
      :modal="true"
      :style="{ width: '95vw', maxWidth: '450px' }"
    >
      <div class="py-4">
        <div class="flex flex-col gap-2">
          <label for="batchName" class="font-medium text-[var(--p-text-color)]">{{ $t('batch.name') }}</label>
          <InputText 
            id="batchName" 
            v-model="newBatchName" 
            :placeholder="$t('batch.namePlaceholder')"
            class="w-full"
            autofocus
          />
        </div>
      </div>
      <template #footer>
        <Button 
          :label="$t('common.cancel')" 
          text
          severity="secondary" 
          @click="showCreateDialog = false"
        />
        <Button 
          :label="$t('common.create')" 
          @click="createBatch"
          :disabled="!newBatchName"
        />
      </template>
    </Dialog>

    <!-- Edit Batch Dialog -->
    <BatchEntryEditor 
      v-if="showEditDialog && editingBatch"
      v-model="showEditDialog"
      :batch="editingBatch"
      @close="showEditDialog = false"
      @save="saveBatch"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useBatchesStore } from '~/stores/batches';
import { storeToRefs } from 'pinia';
import BatchEntryEditor from './BatchEntryEditor.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';

const props = defineProps({
  projectSlug: {
    type: String,
    required: true
  }
});

const { t } = useI18n();
const router = useRouter();
const toast = useToast();
const batchesStore = useBatchesStore();
const { batches, loading, error } = storeToRefs(batchesStore);

const showCreateDialog = ref(false);
const newBatchName = ref('');

onMounted(async () => {
  await batchesStore.fetchBatches(props.projectSlug);
});

onUnmounted(() => {
  batches.value.forEach(batch => {
    batchesStore.stopPolling(batch._id);
  });
});

const getStatusSeverity = (status) => {
  const severityMap = {
    'DRAFT': 'info',
    'PROCESSING': 'warning',
    'NESTING': 'warning',
    'COMPLETED': 'success',
    'COMPLETE': 'success',
    'FAILED': 'danger'
  };
  return severityMap[status] || 'info';
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString();
};

const createBatch = async () => {
  try {
    const newBatch = await batchesStore.createBatch(props.projectSlug, {
      name: newBatchName.value
    });
    showCreateDialog.value = false;
    newBatchName.value = '';
    router.push(`/project/${props.projectSlug}/batch/${newBatch._id}`);
  } catch (err) {
    console.error('Failed to create batch:', err);
  }
};

const editingBatch = ref(null);
const showEditDialog = ref(false);

const editBatch = (batch) => {
  editingBatch.value = batch;
  showEditDialog.value = true;
};

const saveBatch = async (updatedBatch) => {
  try {
    await batchesStore.updateBatch(updatedBatch._id, updatedBatch);
    showEditDialog.value = false;
    editingBatch.value = null;
  } catch (err) {
    console.error('Failed to update batch:', err);
  }
};

const runNesting = async (batch) => {
  try {
    await batchesStore.startNesting(batch._id);
  } catch (err) {
    console.error('Failed to run nesting:', err);
  }
};

const resetBatch = async (batch) => {
  try {
    await batchesStore.resetStatus(batch._id);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('batch.resetSuccess'), life: 3000 });
  } catch (err) {
    console.error('Failed to reset batch:', err);
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('batch.resetFailed'), life: 3000 });
  }
};

const deleteBatch = async (batch) => {
  if (confirm(t('batch.confirmDelete'))) {
    try {
      await batchesStore.deleteBatch(batch._id);
    } catch (err) {
      console.error('Failed to delete batch:', err);
    }
  }
};
</script>

<style scoped lang="scss">
</style>

