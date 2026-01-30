<template>
  <div class="flex flex-col gap-4">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner style="width: 40px; height: 40px" />
      <span class="ml-3 text-surface-500 font-bold uppercase text-xs tracking-widest animate-pulse">{{ $t('artifacts.loading') }}</span>
    </div>

    <div v-else-if="!artifacts || artifacts.length === 0" class="text-center py-16 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-3xl bg-surface-50/50 dark:bg-surface-900/50 transition-colors">
      <i class="pi pi-file text-5xl text-surface-300 dark:text-surface-700 mb-4 block"></i>
      <p class="text-surface-500 dark:text-surface-400 font-bold uppercase text-[10px] tracking-[0.2em]">{{ $t('artifacts.noArtifacts') }}</p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <div v-for="artifact in filteredArtifacts" :key="artifact._id" 
        class="flex items-center justify-between p-4 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl hover:border-primary dark:hover:border-primary transition-all duration-300 group cursor-pointer shadow-sm hover:shadow-md"
        @click="onArtifactClick(artifact)"
      >
        <div class="flex items-center gap-4 min-w-0 flex-1">
          <div class="w-10 h-10 rounded-xl bg-surface-50 dark:bg-surface-800 flex items-center justify-center transition-colors">
             <i :class="getArtifactIcon(artifact.mimeType)" class="text-surface-400 dark:text-surface-500 group-hover:text-primary transition-colors"></i>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-sm text-surface-900 dark:text-surface-0 truncate leading-none">{{ artifact.name }}</span>
            <div class="flex items-center gap-2 mt-1.5">
               <span class="text-[9px] font-black text-surface-400 dark:text-surface-500 uppercase tracking-widest">{{ artifact.type.replace('LAYOUT_', '') }}</span>
               <div class="w-1 h-1 rounded-full bg-surface-300 dark:bg-surface-700"></div>
               <Tag :value="artifact.status?.state || artifact.status" :severity="getStatusSeverity(artifact.status)" class="text-[8px] font-black tracking-tighter px-1.5 py-0" />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1 ml-4 opacity-40 group-hover:opacity-100 transition-opacity">
          <Button 
            v-if="artifact.status?.state === 'READY' || artifact.status === 'READY'"
            icon="pi pi-download" 
            text
            rounded
            size="small"
            class="h-9 w-9"
            @click.stop="downloadArtifact(artifact)" 
          />
          <Button 
            icon="pi pi-trash" 
            severity="danger"
            text
            rounded
            size="small"
            class="h-9 w-9"
            @click.stop="confirmDelete(artifact)" 
          />
        </div>
      </div>
    </div>

    <!-- Preview Dialog -->
    <Dialog v-model:visible="showPreview" :header="previewArtifactData?.name || 'Artifact Preview'" modal class="w-[90vw] h-[90vh] max-w-7xl">
        <div class="flex flex-col h-full overflow-hidden">
            <div v-if="previewLoading" class="flex-1 flex flex-col items-center justify-center gap-4">
                <i class="pi pi-spin pi-spinner text-4xl opacity-20"></i>
                <span class="text-xs font-black uppercase opacity-40">Loading preview data...</span>
            </div>
            <div v-else-if="previewError" class="flex-1 flex flex-col items-center justify-center gap-4 text-red-500">
                <i class="pi pi-exclamation-circle text-4xl"></i>
                <span class="text-sm font-bold">{{ previewError }}</span>
            </div>
            <div v-else class="flex-1 overflow-hidden relative border rounded-xl bg-white dark:bg-black/20 flex">
                <!-- Layer Toggle Sidebar -->
                <div v-if="svgData" class="w-48 border-r bg-surface-50/50 dark:bg-surface-900/50 flex flex-col p-4 overflow-y-auto">
                    <span class="text-[9px] font-black uppercase opacity-40 mb-4 tracking-widest">{{ $t('common.layers') }}</span>
                    <div class="flex flex-col gap-2">
                        <div v-for="layer in svgData.layers" :key="layer.name" class="flex items-center gap-2 group">
                            <Checkbox v-model="visibleLayers" :value="layer.name" :inputId="`layer-${layer.name}`" size="small" />
                            <label :for="`layer-${layer.name}`" class="text-[10px] font-bold cursor-pointer truncate flex-1" :title="layer.name">
                                {{ layer.name }}
                            </label>
                            <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: layer.color }"></div>
                        </div>
                    </div>
                </div>

                <!-- DXF/SVG Canvas -->
                <div v-if="svgData" class="flex-1 relative overflow-hidden cursor-move bg-zinc-50 dark:bg-zinc-950" 
                    @mousedown="startPan" 
                    @wheel="handleZoom"
                >
                    <div class="absolute inset-0 flex items-center justify-center p-8 transition-transform duration-75 ease-out"
                        :style="{ 
                            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                            transformOrigin: 'center'
                        }"
                    >
                        <svg 
                            :viewBox="svgData.viewBox" 
                            class="w-full h-full max-w-full max-h-full"
                            style="transform: scaleY(1);"
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
                <div v-else-if="isPdf" class="w-full h-full flex flex-col items-center justify-center gap-6">
                    <i class="pi pi-file-pdf text-6xl text-red-500 opacity-20"></i>
                    <div class="flex flex-col items-center gap-2">
                        <span class="font-bold">PDF Preview not available in-browser</span>
                        <p class="text-xs opacity-60">Please download the file to view the technical passport.</p>
                    </div>
                    <Button :label="$t('common.download')" icon="pi pi-download" @click="downloadArtifact(previewArtifactData)" />
                </div>
                <!-- Unknown -->
                <div v-else class="flex-1 flex items-center justify-center opacity-40 italic">
                    Preview not supported for this artifact type.
                </div>
            </div>
        </div>
    </Dialog>

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
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { generateSvgData } from '~/utils/dxfParser';

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

const showPreview = ref(false);
const previewArtifactData = ref(null);
const previewLoading = ref(false);
const previewError = ref(null);
const svgData = ref(null);
const visibleLayers = ref([]);
const transform = ref({ x: 0, y: 0, scale: 1 });
const isPdf = computed(() => previewArtifactData.value?.mimeType?.includes('pdf') || previewArtifactData.value?.type === 'PDF_PASSPORT');

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

const previewArtifact = async (artifact) => {
    previewArtifactData.value = artifact;
    showPreview.value = true;
    previewLoading.value = true;
    previewError.value = null;
    svgData.value = null;
    resetTransform();

    if (artifact.type === 'LAYOUT_DXF' || artifact.type === 'DXF') {
        try {
            const response = await fetch(`/api/artifacts/${artifact._id}`);
            if (!response.ok) throw new Error('Failed to fetch artifact content');
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
            previewError.value = 'Failed to load DXF preview: ' + e.message;
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
      message: 'Delete this artifact? This cannot be undone.',
      header: 'Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
          try {
              await $fetch(`/api/artifacts/${artifact._id}`, { method: 'DELETE' });
              toast.add({ severity: 'success', summary: 'Success', detail: 'Artifact deleted' });
              if (props.batchId) artifactsStore.fetchArtifacts(props.batchId);
          } catch (e) {
              toast.add({ severity: 'error', summary: 'Error', detail: e.message });
          }
      }
  });
};

defineExpose({
    previewArtifact
});
</script>