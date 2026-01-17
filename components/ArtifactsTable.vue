<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner style="width: 40px; height: 40px" />
      <span class="ml-3 text-[var(--p-text-muted-color)]">{{ $t('artifacts.loading') }}</span>
    </div>

    <div v-else-if="!artifacts || artifacts.length === 0" class="text-center py-12 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]">
      <i class="pi pi-file text-4xl text-[var(--p-text-muted-color)] mb-3 opacity-20 block"></i>
      <p class="text-[var(--p-text-secondary-color)]">{{ $t('artifacts.noArtifacts') }}</p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div v-for="artifact in artifacts" :key="artifact._id" 
        class="flex flex-col gap-3 p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl hover:border-[var(--p-primary-color)] transition-all group"
      >
        <div class="flex justify-between items-start gap-2">
          <span class="font-bold text-[var(--p-text-color)] truncate flex-1" :title="artifact.name">{{ artifact.name }}</span>
          <Tag :value="artifact.status" :severity="getStatusSeverity(artifact.status)" class="text-[10px] uppercase flex-shrink-0" />
        </div>
        
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 flex items-center justify-center bg-[var(--p-primary-50)] text-[var(--p-primary-color)] rounded-lg">
            <i class="pi pi-file text-lg"></i>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-xs font-bold text-[var(--p-text-color)] uppercase tracking-wider">{{ artifact.type }}</span>
            <span class="text-[10px] text-[var(--p-text-muted-color)]">{{ new Date(artifact.createdAt).toLocaleString() }}</span>
          </div>
        </div>

        <div class="flex justify-end gap-1 pt-3 border-t border-[var(--p-content-border-color)] mt-auto">
          <Button 
            v-if="artifact.status === 'READY'"
            icon="pi pi-download" 
            text
            rounded
            size="small"
            v-tooltip.top="$t('actions.download')"
            @click="downloadArtifact(artifact)" 
          />
          <Button 
            v-if="artifact.status === 'READY' && isPreviewable(artifact.mimeType)"
            icon="pi pi-eye" 
            text
            rounded
            size="small"
            v-tooltip.top="$t('actions.preview')"
            @click="previewArtifact(artifact)"
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            text
            rounded
            size="small"
            v-tooltip.top="$t('actions.delete')"
            @click="confirmDelete(artifact)" 
          />
        </div>
      </div>
    </div>

    <Dialog v-model:visible="showPreview" :header="previewName" modal :style="{ width: '90vw', height: '90vh' }" class="p-0 overflow-hidden">
      <div class="w-full h-full flex items-center justify-center bg-zinc-900/5 p-4 rounded-b-xl">
        <img v-if="previewUrl" :src="previewUrl" :alt="previewName" class="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
      </div>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArtifactsStore } from '~/stores/artifacts';
import { storeToRefs } from 'pinia';
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
  return mimeType === 'image/svg+xml' || mimeType?.startsWith('image/');
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