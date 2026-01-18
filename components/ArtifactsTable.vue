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

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <div v-for="artifact in filteredArtifacts" :key="artifact._id" 
        class="flex items-center justify-between gap-3 p-3 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-lg hover:border-[var(--p-primary-color)] transition-all group cursor-pointer"
        @click="onArtifactClick(artifact)"
      >
        <div class="flex flex-col min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-[13px] text-[var(--p-text-color)] truncate" :title="artifact.name">{{ artifact.name }}</span>
            <Tag :value="artifact.status" :severity="getStatusSeverity(artifact.status)" class="text-[8px] uppercase px-1 py-0" />
          </div>
          <span class="text-[10px] font-bold text-[var(--p-text-muted-color)] uppercase tracking-tight">{{ artifact.type.replace('LAYOUT_', '') }}</span>
        </div>

        <div class="flex gap-1">
          <Button 
            v-if="artifact.status === 'READY'"
            icon="pi pi-download" 
            text
            rounded
            size="small"
            class="h-7 w-7"
            v-tooltip.top="$t('common.actions.download')"
            @click.stop="downloadArtifact(artifact)" 
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            text
            rounded
            size="small"
            class="h-7 w-7"
            v-tooltip.top="$t('common.actions.delete')"
            @click.stop="confirmDelete(artifact)" 
          />
        </div>
      </div>
    </div>

    <Dialog v-model:visible="showPreview" :header="previewName" modal :style="{ width: '90vw', height: '90vh' }" class="p-0 overflow-hidden">
      <div class="w-full h-full flex flex-col bg-zinc-900/5 overflow-hidden">
        <div v-if="previewLoading" class="flex-1 flex flex-col items-center justify-center gap-4">
          <ProgressSpinner style="width: 50px; height: 50px" />
          <p class="text-[var(--p-text-secondary-color)] font-medium">{{ $t('artifacts.generatingPreview') }}</p>
        </div>
        <div v-else-if="previewUrl" class="flex-1 flex items-center justify-center p-4 rounded-b-xl overflow-hidden">
          <img :src="previewUrl" :alt="previewName" class="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
        </div>
        <div v-else-if="previewSvg" class="flex-1 relative overflow-hidden bg-white rounded-b-xl shadow-inner">
          <div class="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <div class="flex flex-col gap-1 bg-white/80 backdrop-blur-md p-1 rounded-lg shadow-lg border border-[var(--p-content-border-color)]">
              <Button icon="pi pi-plus" @click="zoomIn" text rounded size="small" />
              <Button icon="pi pi-minus" @click="zoomOut" text rounded size="small" />
              <Button icon="pi pi-expand" @click="resetZoom" text rounded size="small" />
            </div>
          </div>
          <div 
            class="w-full h-full flex items-center justify-center p-8 cursor-move select-none"
            @mousedown="startPan"
            @mousemove="onPan"
            @mouseup="endPan"
            @mouseleave="endPan"
            @wheel.prevent="onWheel"
          >
            <div 
              class="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out origin-center"
              :style="{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }"
              v-html="previewSvg"
            ></div>
          </div>
        </div>
      </div>
    </Dialog>

    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useArtifactsStore } from '~/stores/artifacts';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
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
  },
  batch: {
    type: Object,
    default: null
  }
});

const { t } = useI18n();
const artifactsStore = useArtifactsStore();
const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();
const { artifacts, loading } = storeToRefs(artifactsStore);
const { standards } = storeToRefs(layerStandardsStore);
const { pens, systemPens } = storeToRefs(penTemplatesStore);
const confirm = useConfirm();
const toast = useToast();

const showPreview = ref(false);
const previewUrl = ref('');
const previewSvg = ref('');
const previewName = ref('');
const previewLoading = ref(false);

// Zoom & Pan State
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
const lastMousePos = { x: 0, y: 0 };

onMounted(() => {
  artifactsStore.fetchArtifacts(props.batchId);
});

// Filter out artifacts for failed runs
const filteredArtifacts = computed(() => {
  if (!artifacts.value) return [];
  if (!props.batch?.runs) return artifacts.value;
  
  const failedRunIds = props.batch.runs
    .filter(r => r.status === 'ERROR')
    .map(r => r._id.toString());
    
  return artifacts.value.filter(a => !a.runId || !failedRunIds.includes(a.runId.toString()));
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
  return mimeType === 'image/svg+xml' || 
         mimeType?.startsWith('image/') || 
         mimeType === 'application/dxf';
};

const onArtifactClick = (artifact) => {
  if (artifact.status === 'READY' && isPreviewable(artifact.mimeType)) {
    previewArtifact(artifact);
  }
};

const downloadArtifact = (artifact) => {
  window.open(`/api/artifacts/${artifact._id}`, '_blank');
};

const previewArtifact = async (artifact) => {
  previewName.value = artifact.name;
  previewUrl.value = '';
  previewSvg.value = '';
  showPreview.value = true;
  resetZoom();

  if (artifact.mimeType === 'application/dxf') {
    previewLoading.value = true;
    try {
      // Ensure we have standards and pens
      if (standards.value.length === 0) await layerStandardsStore.fetchStandards();
      if (pens.value.length === 0) await penTemplatesStore.fetchPens();

      const { generateSvgPreview } = await import('~/utils/dxfParser');
      
      // Fetch DXF file as blob
      const blob = await $fetch(`/api/artifacts/${artifact._id}`, { responseType: 'blob' });
      
      // Map standard layers to pens
      const layerToPenMap = {};
      standards.value.forEach(std => {
        if (std.defaultPenId) {
          const pen = pens.value.find(p => p._id === std.defaultPenId);
          if (pen) {
            layerToPenMap[std.code] = pen;
          }
        }
      });

      const defaultPen = systemPens.value[0] || {
        stroke: { color: '#000000', weight: 0.5, pattern: 'SOLID' }
      };

      // Create a File-like object from blob for dxfParser
      const file = new File([blob], artifact.name, { type: 'application/dxf' });
      const svg = await generateSvgPreview(file, layerToPenMap, defaultPen);
      previewSvg.value = svg;
    } catch (error) {
      console.error('Failed to generate DXF preview:', error);
      toast.add({ severity: 'error', summary: t('common.error'), detail: t('artifacts.previewFailed'), life: 3000 });
      showPreview.value = false;
    } finally {
      previewLoading.value = false;
    }
  } else {
    previewUrl.value = `/api/artifacts/${artifact._id}`;
  }
};

// Zoom & Pan Handlers
const zoomIn = () => { zoom.value *= 1.2; };
const zoomOut = () => { zoom.value /= 1.2; };
const resetZoom = () => { zoom.value = 1; pan.x = 0; pan.y = 0; };

const onWheel = (e) => {
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
};

const startPan = (e) => {
  isPanning.value = true;
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
};

const onPan = (e) => {
  if (!isPanning.value) return;
  const dx = (e.clientX - lastMousePos.x) / zoom.value;
  const dy = (e.clientY - lastMousePos.y) / zoom.value;
  pan.x += dx;
  pan.y += dy;
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
};

const endPan = () => {
  isPanning.value = false;
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