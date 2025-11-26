<template>
  <div class="p-5">
    <div class="flex justify-end items-center mb-5">
      <Button 
        :label="$t('batch.create')" 
        icon="pi pi-plus" 
        @click="showCreateDialog = true"
      />
    </div>

    <div v-if="loading" class="text-center p-10">
      <ProgressSpinner />
    </div>

    <div v-else-if="error" class="mb-5">
      <Message severity="error">{{ error }}</Message>
    </div>

    <div v-else-if="batches.length === 0" class="text-center p-10">
      <p>{{ $t('batch.empty') }}</p>
      <Button 
        :label="$t('batch.createFirst')" 
        icon="pi pi-plus" 
        @click="showCreateDialog = true"
      />
    </div>

    <div v-else>
      <DataTable 
        :value="batches" 
        :paginator="true" 
        :rows="10"
        responsiveLayout="scroll"
      >
        <Column field="name" :header="$t('batch.name')" />
        <Column field="status" :header="$t('batch.status')">
          <template #body="slotProps">
            <Tag 
              :value="slotProps.data.status" 
              :severity="getStatusSeverity(slotProps.data.status)"
            />
          </template>
        </Column>
        <Column field="createdAt" :header="$t('batch.created')">
          <template #body="slotProps">
            {{ formatDate(slotProps.data.createdAt) }}
          </template>
        </Column>
        <Column :header="$t('common.actions')">
          <template #body="slotProps">
            <div class="flex gap-2">
              <Button 
                icon="pi pi-pencil" 
                severity="secondary" 
                size="small"
                @click="editBatch(slotProps.data)"
              />
              <Button 
                icon="pi pi-play" 
                severity="success" 
                size="small"
                :disabled="slotProps.data.status !== 'DRAFT'"
                @click="runNesting(slotProps.data)"
              />
              <Button 
                icon="pi pi-trash" 
                severity="danger" 
                size="small"
                @click="deleteBatch(slotProps.data)"
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
      :style="{ width: '450px' }"
    >
      <div class="space-y-5">
        <div>
          <label for="batchName" class="block mb-2 font-medium">{{ $t('batch.name') }}</label>
          <InputText 
            id="batchName" 
            v-model="newBatchName" 
            :placeholder="$t('batch.namePlaceholder')"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button 
          :label="$t('common.cancel')" 
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
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { batchesStore } from '~/composables/batches';
import BatchEntryEditor from './BatchEntryEditor.vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

const props = defineProps({
  projectSlug: {
    type: String,
    required: true
  }
});

const { t } = useI18n();
const router = useRouter();

const showCreateDialog = ref(false);
const newBatchName = ref('');

const loading = computed(() => batchesStore.getters.loading.value);
const error = computed(() => batchesStore.getters.error.value);
const batches = computed(() => batchesStore.getters.batches.value);

onMounted(async () => {
  await batchesStore.actions.loadBatches(props.projectSlug);
});

const getStatusSeverity = (status) => {
  const severityMap = {
    'DRAFT': 'info',
    'PROCESSING': 'warning',
    'COMPLETED': 'success',
    'FAILED': 'danger'
  };
  return severityMap[status] || 'info';
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString();
};

const createBatch = async () => {
  try {
    const newBatch = await batchesStore.actions.createBatch(props.projectSlug, {
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
    await batchesStore.actions.update(updatedBatch._id, updatedBatch);
    showEditDialog.value = false;
    editingBatch.value = null;
  } catch (err) {
    console.error('Failed to update batch:', err);
  }
};

const runNesting = async (batch) => {
  try {
    await batchesStore.actions.triggerNesting(batch._id);
  } catch (err) {
    console.error('Failed to run nesting:', err);
  }
};

const deleteBatch = async (batch) => {
  if (confirm(t('batch.confirmDelete'))) {
    try {
      await batchesStore.actions.delete(batch._id);
    } catch (err) {
      console.error('Failed to delete batch:', err);
    }
  }
};
</script>
