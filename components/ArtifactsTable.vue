<template>
  <div class="artifacts-table-wrapper">
    <div v-if="loading" class="artifacts-loading">
      <ProgressSpinner style="width: 30px; height: 30px" />
      <span>{{ $t('artifacts.loading') }}</span>
    </div>

    <div v-else-if="!artifacts || artifacts.length === 0" class="artifacts-empty">
      <p>{{ $t('artifacts.noArtifacts') }}</p>
    </div>

    <DataTable v-else :value="artifacts" responsiveLayout="scroll" size="small">
      <Column :header="$t('artifacts.name')" field="name" :sortable="true"></Column>
      
      <Column :header="$t('artifacts.type')" field="type" :sortable="true">
        <template #body="{ data }">
          <Tag :value="data.type" severity="info" />
        </template>
      </Column>

      <Column :header="$t('artifacts.status')" field="status" :sortable="true">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
        </template>
      </Column>

      <Column :header="$t('artifacts.createdAt')" field="createdAt" :sortable="true">
        <template #body="{ data }">
          {{ new Date(data.createdAt).toLocaleString() }}
        </template>
      </Column>

      <Column header="Actions" style="width: 10rem; text-align: right;">
        <template #body="{ data }">
          <Button 
            v-if="data.status === 'READY'"
            icon="pi pi-download" 
            class="p-button-rounded p-button-text"
            v-tooltip.top="$t('actions.download')"
            :aria-label="$t('actions.download')"
            @click="downloadArtifact(data)" 
          />
          <Button 
            v-if="data.status === 'READY' && isPreviewable(data.mimeType)"
            icon="pi pi-eye" 
            class="p-button-rounded p-button-text"
            v-tooltip.top="$t('actions.preview')"
            :aria-label="$t('actions.preview')"
            @click="previewArtifact(data)"
          />
          <Button 
            icon="pi pi-trash" 
            class="p-button-rounded p-button-text p-button-danger"
            v-tooltip.top="$t('actions.delete')"
            :aria-label="$t('actions.delete')"
            @click="confirmDelete(data)" 
          />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showPreview" :header="previewName" :modal="true" :style="{ width: '75vw', height: '80vh' }">
      <img v-if="previewUrl" :src="previewUrl" :alt="previewName" style="width: 100%; height: 100%; object-fit: contain;" />
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { artifactsStore } from '~/composables/artifacts';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

const props = defineProps({
  batchId: {
    type: String,
    required: true
  }
});

const { getters, actions } = artifactsStore;
const confirm = useConfirm();
const toast = useToast();

const artifacts = computed(() => getters.artifacts.value);
const loading = computed(() => getters.loading.value);

const showPreview = ref(false);
const previewUrl = ref('');
const previewName = ref('');

onMounted(() => {
  actions.fetchArtifacts(props.batchId);
});

const getStatusSeverity = (status) => {
  switch (status) {
    case 'READY': return 'success';
    case 'GENERATING': return 'warning';
    case 'FAILED': return 'danger';
    default: return 'info';
  }
};

const isPreviewable = (mimeType) => {
  return mimeType === 'image/svg+xml';
};

const downloadArtifact = (artifact) => {
  window.open(`/api/artifacts/${artifact._id}`, '_blank');
};

const previewArtifact = (artifact) => {
  previewUrl.value = `/api/artifacts/${artifact._id}`;
  previewName.value = artifact.name;
  showPreview.value = true;
};

const confirmDelete = (artifact) => {
  confirm.require({
    message: 'Are you sure you want to delete this artifact?',
    header: 'Delete Confirmation',
    icon: 'pi pi-exclamation-triangle',
    accept: () => deleteArtifact(artifact),
  });
};

const deleteArtifact = async (artifact) => {
  try {
    await $fetch(`/api/artifacts/${artifact._id}`, { method: 'DELETE' });
    toast.add({ severity: 'success', summary: 'Success', detail: 'Artifact deleted', life: 3000 });
    // Refresh the list
    await actions.fetchArtifacts(props.batchId);
  } catch (error) {
    console.error('Failed to delete artifact:', error);
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete artifact', life: 3000 });
  }
};
</script>

<style lang="scss" scoped>
.artifacts-table-wrapper {
  .artifacts-loading, .artifacts-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-color-secondary);
    background-color: var(--surface-ground);
    border-radius: var(--border-radius);
    min-height: 100px;

    span {
      margin-left: 0.5rem;
    }
  }
}
</style>
