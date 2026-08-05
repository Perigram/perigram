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
          <GeneratedDeleteButton entity-type="artifact" :entity="artifact" @deleted="refreshArtifacts" />
        </div>
      </div>
    </div>

    <!-- Preview Dialog -->
    <StandardDialog v-model:visible="showPreview" :header="previewArtifactData?.identity?.name || $t('artifacts.previewTitle')" size="full" class="h-preview-dialog" :pt="{ content: { class: 'flex-1 flex flex-col overflow-hidden h-full p-0' } }">
        <div v-if="editableLayout" class="flex justify-end gap-2 p-2">
            <Button
                :label="editingLayout ? $t('common.cancel') : $t('artifactTemplates.editLayout')"
                :icon="editingLayout ? 'pi pi-times' : 'pi pi-pencil'"
                size="small"
                severity="secondary"
                @click="toggleLayoutEditor"
            />
            <Button
                v-if="editingLayout"
                :label="$t('common.save')"
                icon="pi pi-check"
                size="small"
                :loading="savingLayout"
                @click="saveArtifactLayout"
            />
        </div>
        <ArtifactLayoutEditor v-if="editingLayout && layoutDraft" v-model="layoutDraft" class="min-h-0 flex-1 overflow-auto p-3" />
        <div class="flex h-full">
            <div v-if="previewLoading" class="flex-1 flex flex-col items-center justify-center gap-4">
                <ProgressSpinner />
                <small>{{ $t('artifacts.loadingPreview') }}</small>
            </div>
            <div v-else-if="previewError" class="flex-1 flex flex-col items-center justify-center gap-4">
                <i class="pi pi-exclamation-circle text-4xl"></i>
                <p>{{ previewError }}</p>
            </div>
            <div v-else-if="!editingLayout" class="flex-1 flex overflow-hidden">
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
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import ArtifactLayoutEditor from '~/components/ArtifactLayoutEditor.vue';
import { useToast } from 'primevue/usetoast';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';
import { getPrimaryState } from '~/packages/core/src/index.js';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({
  batchId: { type: String, required: false },
  artifacts: { type: Array, default: null },
  batch: { type: Object, default: null },
  runId: { type: String, default: null }
});

const { t } = useI18n();
const artifactsStore = useArtifactsStore();
const authStore = useAuthStore();
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
const editableLayout = computed(() => Boolean(
    domainUi.getAttachmentEditor(artifactType(previewArtifactData.value)).mode === 'layout'
    && previewArtifactData.value?.data?.layout
    && previewArtifactData.value?.provenance?.template?.source?.id
    && hasPermissionGrant({
        permissions: authStore.activePermissions,
        feature: 'artifacts',
        action: 'update',
        entity: previewArtifactData.value,
        entityType: 'artifact'
    })
));
const editingLayout = ref(false);
const savingLayout = ref(false);
const layoutDraft = ref(null);

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
    editingLayout.value = false;
    layoutDraft.value = null;

    const previewMode = artifactPreviewMode(artifact);
    if (previewMode === 'dxf' || previewMode === 'svg') {
        drawingSource.value = domainUi.getDownloadEndpoint('artifact', artifact._id);
        drawingSourceType.value = `${previewMode}-url`;
    }
};

const toggleLayoutEditor = () => {
    editingLayout.value = !editingLayout.value;
    layoutDraft.value = editingLayout.value
        ? JSON.parse(JSON.stringify(previewArtifactData.value?.data?.layout || null))
        : null;
};

const saveArtifactLayout = async () => {
    if (!previewArtifactData.value?._id || !layoutDraft.value) return;
    savingLayout.value = true;
    try {
        const updated = await $fetch(`/api/artifacts/${previewArtifactData.value._id}/layout`, {
            method: 'PUT',
            body: { layout: layoutDraft.value, values: previewArtifactData.value.data?.values || {} }
        });
        previewArtifactData.value = updated;
        editingLayout.value = false;
        layoutDraft.value = null;
        drawingSource.value = domainUi.getDownloadEndpoint('artifact', updated._id);
        toast.add({ severity: 'success', summary: t('common.success'), detail: t('artifactTemplates.saved') });
    } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message });
    } finally {
        savingLayout.value = false;
    }
};

const handlePreviewError = (error) => {
    previewError.value = t('artifacts.loadDxfPreviewFailed', { message: error.message });
};

const onArtifactClick = (artifact) => {
    previewArtifact(artifact);
};

const refreshArtifacts = () => {
    if (props.batchId) artifactsStore.fetchArtifacts(props.batchId);
};

defineExpose({
    previewArtifact
});
</script>
