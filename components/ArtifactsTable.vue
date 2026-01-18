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

    <Dialog v-model:visible="showPreview" :header="previewName" modal :style="{ width: '95vw', height: '95vh' }" class="p-0 overflow-hidden">
      <div class="w-full h-full flex flex-col bg-[var(--p-content-background)] overflow-hidden">
        <!-- Toolbar -->
        <div v-if="previewData" class="flex items-center justify-between p-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)]">
          <div class="flex gap-2">
            <div 
              v-for="layer in previewData.layers" 
              :key="layer.name"
              class="flex items-center gap-2 px-2 py-1 rounded bg-[var(--p-primary-50)] border border-[var(--p-primary-100)] cursor-pointer hover:bg-[var(--p-primary-100)] transition-colors"
              :class="{ 'opacity-40 grayscale': !visibleLayers.has(layer.name) }"
              @click="toggleLayer(layer.name)"
            >
              <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: layer.color }"></div>
              <span class="text-[10px] font-bold uppercase tracking-tight text-[var(--p-primary-900)]">{{ layer.name }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button icon="pi pi-plus" @click="zoomIn" text rounded size="small" class="h-8 w-8" />
            <Button icon="pi pi-minus" @click="zoomOut" text rounded size="small" class="h-8 w-8" />
            <Button icon="pi pi-expand" @click="resetZoom" text rounded size="small" class="h-8 w-8" />
          </div>
        </div>

        <div class="flex-1 relative overflow-hidden flex">
          <div v-if="previewLoading" class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--p-content-background)]/80 backdrop-blur-sm z-20">
            <ProgressSpinner style="width: 50px; height: 50px" />
            <p class="text-[var(--p-text-secondary-color)] font-medium uppercase tracking-widest text-xs">{{ $t('artifacts.generatingPreview') }}</p>
          </div>

          <div v-if="previewUrl" class="flex-1 flex items-center justify-center p-4">
            <img :src="previewUrl" :alt="previewName" class="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
          </div>

          <!-- Interactive DXF Canvas -->
          <div 
            v-else-if="previewData" 
            class="flex-1 relative overflow-hidden bg-[var(--p-content-background)] cursor-move select-none"
            @mousedown="startPan"
            @mousemove="onPan"
            @mouseup="endPan"
            @mouseleave="endPan"
            @wheel.prevent="onWheel"
          >
            <!-- Grid Background -->
            <div class="absolute inset-0 pointer-events-none opacity-5" :style="gridStyle"></div>

            <div 
              class="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out origin-center"
              :style="{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                :viewBox="previewData.viewBox" 
                class="w-full h-full max-w-none max-h-none drop-shadow-2xl"
              >
                <g v-for="layer in previewData.layers" :key="layer.name" v-show="visibleLayers.has(layer.name)">
                  <g :stroke="layer.color" :stroke-width="layer.weight * 2" :stroke-dasharray="layer.dasharray" fill="none">
                    <g v-html="layer.paths.join('')"></g>
                  </g>
                </g>
              </svg>
            </div>

            <!-- Scale/Ruler -->
            <div class="absolute bottom-6 left-6 flex flex-col gap-1 pointer-events-none bg-[var(--p-content-background)]/80 backdrop-blur-md p-2 rounded-lg border border-[var(--p-content-border-color)]">
              <div class="flex items-end h-4 gap-0 border-b border-[var(--p-text-color)]" :style="{ width: `${100 * zoom}px` }">
                <div class="flex-1 border-l border-[var(--p-text-color)] h-2"></div>
                <div class="flex-1 border-l border-[var(--p-text-color)] h-1"></div>
                <div class="flex-1 border-l border-[var(--p-text-color)] h-2"></div>
                <div class="flex-1 border-l border-[var(--p-text-color)] h-1"></div>
                <div class="border-l border-[var(--p-text-color)] h-2"></div>
              </div>
              <span class="text-[9px] font-black uppercase tracking-tighter text-[var(--p-text-color)]">{{ Math.round(100 / (pixelPerUnit || 1)) }} mm</span>
            </div>
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
  },
  runId: {
    type: String,
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
const previewName = ref('');
const previewLoading = ref(false);
const previewData = ref(null);
const visibleLayers = ref(new Set());

// Zoom & Pan State
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
const lastMousePos = { x: 0, y: 0 };

onMounted(() => {
  artifactsStore.fetchArtifacts(props.batchId);
});

const pixelPerUnit = computed(() => {
  if (!previewData.value) return 1;
  // Calculate approximate pixel per unit based on viewbox and zoom
  // This is a simple approximation for the ruler
  return zoom.value;
});

const gridStyle = computed(() => {
  const size = 50 * zoom.value;
  return {
    backgroundImage: `radial-gradient(circle, var(--p-text-color) 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${pan.x * zoom.value}px ${pan.y * zoom.value}px`
  };
});

const toggleLayer = (layerName) => {
  if (visibleLayers.value.has(layerName)) {
    visibleLayers.value.delete(layerName);
  } else {
    visibleLayers.value.add(layerName);
  }
};

// Filter out artifacts for failed runs AND optionally filter by runId
const filteredArtifacts = computed(() => {
  if (!artifacts.value) return [];
  
  let filtered = artifacts.value;
  
  if (props.batch?.runs) {
    const failedRunIds = props.batch.runs
      .filter(r => r.status === 'ERROR')
      .map(r => r._id.toString());
      
    filtered = filtered.filter(a => !a.runId || !failedRunIds.includes(a.runId.toString()));
  }
  
  if (props.runId) {
    filtered = filtered.filter(a => a.runId?.toString() === props.runId);
  }
    
  return filtered;
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
  previewData.value = null;
  showPreview.value = true;
  resetZoom();

  if (artifact.mimeType === 'application/dxf') {
    previewLoading.value = true;
    try {
      if (standards.value.length === 0) await layerStandardsStore.fetchStandards();
      if (pens.value.length === 0) await penTemplatesStore.fetchPens();

      const { generateSvgData } = await import('~/utils/dxfParser');
      const blob = await $fetch(`/api/artifacts/${artifact._id}`, { responseType: 'blob' });
      
      const layerToPenMap = {};
      standards.value.forEach(std => {
        if (std.defaultPenId) {
          const pen = pens.value.find(p => p._id === std.defaultPenId);
          if (pen) layerToPenMap[std.code] = pen;
        }
      });

      const defaultPen = systemPens.value[0] || {
        stroke: { color: 'var(--p-text-color)', weight: 0.5, pattern: 'SOLID' }
      };

      const file = new File([blob], artifact.name, { type: 'application/dxf' });
      const data = await generateSvgData(file, layerToPenMap, defaultPen);
      previewData.value = data;
      visibleLayers.value = new Set(data.layers.map(l => l.name));
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