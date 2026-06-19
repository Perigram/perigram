<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner />
      <small>{{ $t('artifacts.loading') }}</small>
    </div>

    <div v-else-if="!artifacts || artifacts.length === 0" class="flex flex-col items-center py-16 italic">
      <i class="pi pi-file text-5xl mb-4"></i>
      <p>{{ $t('artifacts.noArtifacts') }}</p>
    </div>

    <div v-else class="flex flex-col gap-2">
      <div v-for="artifact in filteredArtifacts" :key="artifact._id" 
        class="flex items-center justify-between p-2"
        @click="onArtifactClick(artifact)"
      >
        <div class="flex items-center gap-4">
          <i :class="getArtifactIcon(artifactMimeType(artifact))"></i>
          <div class="flex flex-col">
            <span>{{ artifact.identity?.name }}</span>
            <div class="flex items-center gap-2">
               <small>{{ artifactType(artifact).replace('LAYOUT_', '') }}</small>
               <Tag :value="getPrimaryState(artifact.status)" :severity="getStatusSeverity(artifact.status)" />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button 
            v-if="getPrimaryState(artifact.status) === 'READY'"
            icon="pi pi-download" 
            text
            @click.stop="downloadArtifact(artifact)" 
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            text
            @click.stop="confirmDelete(artifact)" 
          />
        </div>
      </div>
    </div>

    <!-- Preview Dialog -->
    <StandardDialog v-model:visible="showPreview" :header="previewArtifactData?.identity?.name || $t('artifacts.previewTitle')" size="full" class="h-preview-dialog" :pt="{ content: { class: 'flex-1 flex flex-col overflow-hidden h-full p-0' } }">
        <div class="flex h-full">
            <div v-if="previewLoading" class="flex-1 flex flex-col items-center justify-center gap-4">
                <ProgressSpinner />
                <small>{{ $t('artifacts.loadingPreview') }}</small>
            </div>
            <div v-else-if="previewError" class="flex-1 flex flex-col items-center justify-center gap-4">
                <i class="pi pi-exclamation-circle text-4xl"></i>
                <p>{{ previewError }}</p>
            </div>
            <div v-else class="flex-1 flex overflow-hidden">
                <DrawingCanvas
                    v-if="drawingSource"
                    :source="drawingSource"
                    :source-type="drawingSourceType"
                    mode="viewer"
                    show-layer-panel
                    @error="handlePreviewError"
                />
                <!-- PDF Fallback -->
                <div v-else-if="isPdf" class="flex-1 flex flex-col items-center justify-center gap-6">
                    <i class="pi pi-file-pdf text-6xl opacity-20"></i>
                    <div class="text-center">
                        <p>{{ $t('artifacts.pdfPreviewUnavailable') }}</p>
                        <small>{{ $t('artifacts.downloadFilePrompt') }}</small>
                    </div>
                    <Button :label="$t('common.download')" icon="pi pi-download" @click="downloadArtifact(previewArtifactData)" />
                </div>
            </div>
        </div>
    </StandardDialog>

    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArtifactsStore } from '~/stores/artifacts';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ProgressSpinner from 'primevue/progressspinner';
import ConfirmDialog from 'primevue/confirmdialog';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';
import { getPrimaryState } from '~/packages/core/src/index.js';

const props = defineProps({
  batchId: { type: String, required: false },
  artifacts: { type: Array, default: null },
  batch: { type: Object, default: null },
  runId: { type: String, default: null }
});

const { t } = useI18n();
const artifactsStore = useArtifactsStore();
const confirm = useConfirm();
const toast = useToast();
const { artifacts: storeArtifacts, loading } = storeToRefs(artifactsStore);
const artifacts = computed(() => props.artifacts || storeArtifacts.value);
const domainUi = useCutkitDomainUi();

const showPreview = ref(false);
const previewArtifactData = ref(null);
const previewLoading = ref(false);
const previewError = ref(null);
const drawingSource = ref(null);
const drawingSourceType = ref('dxf-url');
const isPdf = computed(() => artifactPreviewMode(previewArtifactData.value) === 'pdf');

onMounted(async () => {
  if (props.batchId && !props.artifacts) {
    artifactsStore.fetchArtifacts(props.batchId);
  }
});

const artifactType = (artifact) => artifact?.data?.type || '';
const artifactDefinition = (artifact) => domainUi.getAttachmentKind(artifactType(artifact));
const artifactPreviewMode = (artifact) => domainUi.getAttachmentPreview(artifactType(artifact)).mode;
const artifactMimeType = (artifact) => artifact?.attachments?.primary?.metadata?.mimeType || artifactDefinition(artifact)?.mimeType || '';

const getArtifactIcon = (mimeType) => {
    if (mimeType.includes('pdf')) return 'pi pi-file-pdf';
    if (mimeType.includes('svg')) return 'pi pi-image';
    return 'pi pi-file';
};

const getStatusSeverity = (status) => {
    const state = getPrimaryState(status);
    if (state === 'READY') return 'success';
    if (state === 'FAILED' || state === 'ERROR') return 'danger';
    return 'secondary';
};

const downloadArtifact = (artifact) => {
    if (!artifact?._id) return;
    window.location.href = domainUi.getDownloadEndpoint('artifact', artifact._id);
};

const previewArtifact = async (artifact) => {
    previewArtifactData.value = artifact;
    showPreview.value = true;
    previewError.value = null;
    drawingSource.value = null;
    previewLoading.value = false;

    const previewMode = artifactPreviewMode(artifact);
    if (previewMode === 'dxf' || previewMode === 'svg') {
        drawingSource.value = domainUi.getDownloadEndpoint('artifact', artifact._id);
        drawingSourceType.value = `${previewMode}-url`;
    }
};

const handlePreviewError = (error) => {
    previewError.value = t('artifacts.loadDxfPreviewFailed', { message: error.message });
};

const onArtifactClick = (artifact) => {
    previewArtifact(artifact);
};

const confirmDelete = (artifact) => {
  confirm.require({
      message: t('artifacts.deleteConfirm'),
      header: t('common.confirmation'),
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
          try {
              await $fetch(`/api/artifacts/${artifact._id}`, { method: 'DELETE' });
              toast.add({ severity: 'success', summary: t('common.success'), detail: t('artifacts.deleted') });
              if (props.batchId) artifactsStore.fetchArtifacts(props.batchId);
          } catch (e) {
              toast.add({ severity: 'error', summary: t('common.error'), detail: e.message });
          }
      }
  });
};

defineExpose({
    previewArtifact
});
</script>
