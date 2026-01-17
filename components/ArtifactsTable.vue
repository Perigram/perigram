<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center p-8 rounded-md">
      <ProgressSpinner style="width: 30px; height: 30px" />
      <span class="ml-2">{{ $t('artifacts.loading') }}</span>
    </div>

    <div v-else-if="!artifacts || artifacts.length === 0" class="flex items-center justify-center p-8 rounded-md">
      <p>{{ $t('artifacts.noArtifacts') }}</p>
    </div>

    <DataView v-else :value="artifacts" layout="grid">
      <template #grid="slotProps">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          <div v-for="artifact in slotProps.items" :key="artifact._id" class="flex flex-col gap-3 p-4 border rounded">
            <div class="flex justify-between items-start">
              <span class="font-semibold break-words flex-1">{{ artifact.name }}</span>
              <Tag :value="artifact.status" :severity="getStatusSeverity(artifact.status)" />
            </div>
            
            <div class="flex gap-2">
              <Tag :value="artifact.type" severity="info" />
              <span class="text-sm">{{ new Date(artifact.createdAt).toLocaleString() }}</span>
            </div>

            <div class="flex gap-2 justify-end pt-2 border-t">
              <Button 
                v-if="artifact.status === 'READY'"
                icon="pi pi-download" 
                text
                v-tooltip.top="$t('actions.download')"
                :aria-label="$t('actions.download')"
                @click="downloadArtifact(artifact)" 
              />
              <Button 
                v-if="artifact.status === 'READY' && isPreviewable(artifact.mimeType)"
                icon="pi pi-eye" 
                text
                v-tooltip.top="$t('actions.preview')"
                :aria-label="$t('actions.preview')"
                @click="previewArtifact(artifact)"
              />
              <Button 
                icon="pi pi-trash" 
                severity="danger"
                text
                v-tooltip.top="$t('actions.delete')"
                :aria-label="$t('actions.delete')"
                @click="confirmDelete(artifact)" 
              />
            </div>
          </div>
        </div>
      </template>
    </DataView>

    <Dialog v-model:visible="showPreview" :header="previewName" :modal="true" :style="{ width: '75vw', height: '80vh' }">
      <img v-if="previewUrl" :src="previewUrl" :alt="previewName" style="width: 100%; height: 100%; object-fit: contain;" />
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArtifactsStore } from '~/stores/artifacts';
import { storeToRefs } from 'pinia';
import DataView from 'primevue/dataview';
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

const { t } = useI18n();
const artifactsStore = useArtifactsStore();
const { artifacts, loading } = storeToRefs(artifactsStore);
const confirm = useConfirm();
const toast = useToast();

const showPreview = ref(false);
const previewUrl = ref('');
const previewName = ref('');

onMounted(() => {
  artifactsStore.fetchArtifacts(props.batchId);
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
    message: t('artifacts.deleteConfirm'),
    header: t('artifacts.deleteTitle'),
    icon: 'pi pi-exclamation-triangle',
    accept: () => deleteArtifact(artifact),
  });
};

const deleteArtifact = async (artifact) => {
  try {
    await $fetch(`/api/artifacts/${artifact._id}`, { method: 'DELETE' });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('artifacts.deleted'), life: 3000 });
    // Refresh the list
    await artifactsStore.fetchArtifacts(props.batchId);
  } catch (error) {
    console.error('Failed to delete artifact:', error);
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('artifacts.deleteFailed'), life: 3000 });
  }
};
</script>

