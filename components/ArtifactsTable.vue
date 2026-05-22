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
               <Tag :value="artifact.status?.state" :severity="getStatusSeverity(artifact.status)" />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button 
            v-if="artifact.status?.state === 'READY'"
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
                <!-- Layer Toggle Sidebar -->
                <div v-if="svgData" class="w-64 border-r overflow-y-auto p-4 flex flex-col gap-4">
                    <small>{{ $t('common.layers') }}</small>
                    <div class="flex flex-col gap-2">
                        <div v-for="layer in svgData.layers" :key="layer.name" class="flex items-center gap-2">
                            <Checkbox v-model="visibleLayers" :value="layer.name" :inputId="`layer-${layer.name}`" size="small" />
                            <label :for="`layer-${layer.name}`" class="truncate flex-1">
                                {{ layer.name }}
                            </label>
                            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: layer.color }"></div>
                        </div>
                    </div>
                </div>

                <!-- DXF/SVG Canvas -->
                <div v-if="svgData" class="flex-1 relative overflow-hidden cursor-move" 
                    @mousedown="startPan" 
                    @wheel="handleZoom"
                >
                    <div class="absolute inset-0 flex items-center justify-center transition-transform"
                        :style="{ 
                            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                            transformOrigin: 'center'
                        }"
                    >
                        <svg 
                            :viewBox="svgData.viewBox" 
                            class="w-full h-full"
                        >
                            <g v-for="layer in filteredLayers" :key="layer.name" 
                               :stroke="layer.color" :stroke-width="layer.weight" :stroke-dasharray="layer.dasharray">
                                <g v-for="(path, idx) in layer.paths" :key="idx" v-html="path"></g>
                            </g>
                        </svg>
                    </div>

                    <!-- Floating Controls -->
                    <div class="absolute bottom-4 right-4 flex gap-2">
                        <Button icon="pi pi-search-minus" rounded severity="secondary" @click="transform.scale = Math.max(0.1, transform.scale - 0.2)" />
                        <Button icon="pi pi-refresh" rounded severity="secondary" @click="resetTransform" />
                        <Button icon="pi pi-search-plus" rounded severity="secondary" @click="transform.scale = Math.min(10, transform.scale + 0.2)" />
                    </div>
                </div>
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
import { ref, onMounted, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArtifactsStore } from '~/stores/artifacts';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import ConfirmDialog from 'primevue/confirmdialog';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { generateSvgData } from '~/utils/dxfParser';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi';

const props = defineProps({
  batchId: { type: String, required: false },
  artifacts: { type: Array, default: null },
  batch: { type: Object, default: null },
  runId: { type: String, default: null }
});

const { t } = useI18n();
const artifactsStore = useArtifactsStore();
const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const confirm = useConfirm();
const toast = useToast();
const { artifacts: storeArtifacts, loading } = storeToRefs(artifactsStore);
const artifacts = computed(() => props.artifacts || storeArtifacts.value);
const domainUi = useCutkitDomainUi();

const showPreview = ref(false);
const previewArtifactData = ref(null);
const previewLoading = ref(false);
const previewError = ref(null);
const svgData = ref(null);
const visibleLayers = ref([]);
const transform = ref({ x: 0, y: 0, scale: 1 });
const isPdf = computed(() => artifactPreviewKind(previewArtifactData.value) === 'pdf');

const filteredLayers = computed(() => {
    if (!svgData.value) return [];
    return svgData.value.layers.filter(l => visibleLayers.value.includes(l.name));
});

onMounted(async () => {
  if (props.batchId && !props.artifacts) {
    artifactsStore.fetchArtifacts(props.batchId);
  }
  await Promise.all([
    standardsStore.fetchStandards(),
    pensStore.fetchPens()
  ]);
});

const resetTransform = () => {
    transform.value = { x: 0, y: 0, scale: 1 };
};

const handleZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    transform.value.scale = Math.max(0.1, Math.min(10, transform.value.scale + delta));
};

let isPanning = false;
let lastMousePos = { x: 0, y: 0 };

const startPan = (e) => {
    isPanning = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    window.addEventListener('mousemove', handlePan);
    window.addEventListener('mouseup', stopPan);
};

const handlePan = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    transform.value.x += dx;
    transform.value.y += dy;
    lastMousePos = { x: e.clientX, y: e.clientY };
};

const stopPan = () => {
    isPanning = false;
    window.removeEventListener('mousemove', handlePan);
    window.removeEventListener('mouseup', stopPan);
};

const artifactType = (artifact) => artifact?.data?.type || '';
const artifactDefinition = (artifact) => domainUi.getAttachmentKind(artifactType(artifact));
const artifactPreviewKind = (artifact) => domainUi.getAttachmentPreview(artifactType(artifact)).kind;
const artifactMimeType = (artifact) => artifact?.attachments?.primary?.metadata?.mimeType || artifactDefinition(artifact)?.mimeType || '';

const getArtifactIcon = (mimeType) => {
    if (mimeType.includes('pdf')) return 'pi pi-file-pdf';
    if (mimeType.includes('svg')) return 'pi pi-image';
    return 'pi pi-file';
};

const getStatusSeverity = (status) => {
    const state = status?.state;
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
    previewLoading.value = true;
    previewError.value = null;
    svgData.value = null;
    resetTransform();

    const previewKind = artifactPreviewKind(artifact);
    if (previewKind === 'dxf') {
        try {
            const response = await fetch(domainUi.getDownloadEndpoint('artifact', artifact._id));
            if (!response.ok) throw new Error(t('artifacts.fetchContentFailed'));
            const dxfText = await response.text();
            
            // Build layer mapping from standards
            const mapping = {};
            standardsStore.standards.forEach(std => {
                const pen = pensStore.pens.find(p => p._id === std.defaultPenId);
                if (pen) mapping[std.code] = pen;
            });

            svgData.value = await generateSvgData(dxfText, mapping);
            visibleLayers.value = svgData.value.layers.map(l => l.name);
        } catch (e) {
            console.error('Preview error:', e);
            previewError.value = t('artifacts.loadDxfPreviewFailed', { message: e.message });
        } finally {
            previewLoading.value = false;
        }
    } else {
        previewLoading.value = false;
    }
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
