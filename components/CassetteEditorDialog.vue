<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="cassette ? $t('cassette.editTitle') : $t('cassette.uploadTitle')"
    :modal="true"
    :closable="!isUploading"
    :style="{ width: '95vw', maxWidth: '900px' }"
    @hide="handleClose"
  >
    <div class="flex flex-col gap-6 py-2">
      <!-- Upload Section -->
      <div v-if="!showMappingSection && !isUploading" class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <label for="cassetteName" class="font-medium text-[var(--p-text-color)]">{{ $t('cassette.name') }}</label>
          <InputText 
            id="cassetteName"
            v-model="name" 
            :placeholder="$t('cassette.nameExample')"
            class="w-full"
            autofocus
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium text-[var(--p-text-color)]">{{ $t('cassette.selectFile') }}</label>
          <FileUpload 
            mode="basic" 
            accept=".dxf"
            :maxFileSize="10000000"
            :auto="false"
            :customUpload="true"
            :chooseLabel="selectedFile ? selectedFile.name : $t('common.upload')"
            @select="handleFileSelect"
            class="w-full"
          />
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isUploading" class="flex flex-col items-center justify-center py-12 gap-4">
        <ProgressSpinner style="width: 50px; height: 50px" />
        <p class="text-[var(--p-text-secondary-color)] font-medium">{{ $t('common.uploading') }}</p>
      </div>

      <!-- Layer Mapping Section -->
      <div v-if="showMappingSection && !isUploading" class="flex flex-col lg:flex-row gap-8">
        <div class="flex-1 min-h-[300px] bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] p-6 rounded-xl flex items-center justify-center relative overflow-hidden shadow-inner">
          <div v-if="svgPreview" class="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full" v-html="svgPreview"></div>
          <div v-else class="flex flex-col items-center gap-3 text-[var(--p-text-muted-color)]">
            <i class="pi pi-image text-5xl opacity-20"></i>
            <p class="text-sm font-medium">{{ $t('cassette.noPreview') }}</p>
          </div>
        </div>

        <div class="w-full lg:w-80 flex flex-col gap-6">
          <div class="flex flex-col gap-4">
            <h3 class="text-sm font-bold uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('cassette.layerMapping') }}</h3>
            <div v-if="detectedLayers && detectedLayers.length > 0" class="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              <div v-for="(layer, index) in detectedLayers" :key="index" class="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--p-content-background)] border border-[var(--p-content-border-color)]">
                <label class="text-xs font-bold text-[var(--p-text-color)] truncate" :title="layer">{{ layer }}</label>
                <Select 
                  v-model="layerMappings[layer]"
                  :options="layerStandards"
                  optionLabel="label"
                  optionValue="value"
                  :placeholder="$t('cassette.selectLayerType')"
                  class="w-full text-sm"
                />
              </div>
            </div>
            <Message v-else severity="info" size="small">
              {{ $t('cassette.detectingLayers') }}
            </Message>
          </div>
          
          <div class="flex flex-col gap-4 pt-4 border-t border-[var(--p-content-border-color)]">
            <h3 class="text-sm font-bold uppercase tracking-widest text-[var(--p-text-muted-color)]">{{ $t('cassette.parameters') }}</h3>
            <div class="flex flex-col gap-2">
              <p class="text-xs text-[var(--p-text-secondary-color)] leading-relaxed">{{ $t('cassette.parametersHelp') }}</p>
              <Chips 
                v-model="parameters" 
                :placeholder="$t('cassette.parametersPlaceholder')"
                separator=","
                class="w-full"
              />
              <small class="text-[10px] text-[var(--p-text-muted-color)] italic font-mono">{{ $t('cassette.parametersHint') }}</small>
            </div>
          </div>
        </div>
      </div>

      <Message v-if="errorMessage" severity="error" class="mt-4">
        {{ errorMessage }}
      </Message>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button 
          :label="$t('common.cancel')" 
          severity="secondary"
          text
          :disabled="isUploading"
          @click="handleClose"
        />
        <Button 
          :label="showMappingSection ? $t('common.save') : $t('common.upload')" 
          :icon="showMappingSection ? 'pi pi-check' : 'pi pi-upload'"
          :disabled="!canUpload || isUploading"
          @click="handleUpload"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useCassettesStore } from '~/stores/cassettes';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import Chips from 'primevue/chips';
import Select from 'primevue/select';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  cassetteId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['update:modelValue', 'uploaded', 'saved']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const name = ref('');
const selectedFile = ref(null);
const isUploading = ref(false);
const errorMessage = ref('');
const cassette = ref(null);
const detectedLayers = ref([]);
const layerMappings = ref({});
const svgPreview = ref(null);
const dxfFile = ref(null);
const parameters = ref(['A', 'B', 'C', 'D', 'E', 'F', 'horizontal_seam_width']);

const cassettesStore = useCassettesStore();
const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();

const { standards } = storeToRefs(layerStandardsStore);
const { pens, systemPens } = storeToRefs(penTemplatesStore);

// Fetch layer standards and pens when dialog opens
watch(isOpen, async (newValue) => {
  if (newValue && standards.value.length === 0) {
    try {
      await Promise.all([
        layerStandardsStore.fetchStandards(),
        penTemplatesStore.fetchPens()
      ]);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }
});

// Map layer standards from server to dropdown options
const layerStandards = computed(() => {
  if (!standards.value || standards.value.length === 0) {
    return [];
  }
  
  const options = standards.value.map(standard => ({
    label: standard.i18n?.ru?.nameTemplate || standard.code,
    value: standard.code,
    category: standard.category
  }));
  
  options.push({ label: t('common.doNotUse'), value: null, category: null });
  
  return options;
});

const showMappingSection = computed(() => {
  return selectedFile.value !== null && detectedLayers.value.length > 0;
});

const canUpload = computed(() => {
  return selectedFile.value && name.value.trim();
});

// Load cassette when cassetteId changes
watch(() => props.cassetteId, async (newId) => {
  if (newId) {
    try {
      cassette.value = await cassettesStore.fetchById(newId);
      if (cassette.value.layerMapping) {
        const mappings = {};
        Object.entries(cassette.value.layerMapping).forEach(([type, layers]) => {
          layers.forEach(layer => {
            mappings[layer] = type;
          });
        });
        layerMappings.value = mappings;
      }
    } catch (error) {
      errorMessage.value = 'Failed to load cassette';
      console.error('Failed to load cassette:', error);
    }
  } else {
    cassette.value = null;
    layerMappings.value = {};
  }
}, { immediate: true });

const handleFileSelect = async (event) => {
  if (event.files && event.files.length > 0) {
    selectedFile.value = event.files[0];
    dxfFile.value = event.files[0];
    if (!name.value) {
      name.value = event.files[0].name.replace(/\.dxf$/i, '');
    }
    
    isUploading.value = true;
    errorMessage.value = '';
    
    try {
      const { extractDxfLayers } = await import('~/utils/dxfParser');
      const layers = await extractDxfLayers(selectedFile.value);
      detectedLayers.value = layers;
      
      detectedLayers.value.forEach(layer => {
        if (!layerMappings.value[layer]) {
          layerMappings.value[layer] = null;
        }
      });
      
      await updatePreview();
    } catch (error) {
      errorMessage.value = error.message || 'Failed to parse DXF file';
      console.error('DXF parsing failed:', error);
      selectedFile.value = null;
      detectedLayers.value = [];
      svgPreview.value = null;
    } finally {
      isUploading.value = false;
    }
  }
};

const updatePreview = async () => {
  if (!dxfFile.value) return;
  
  try {
    const { generateSvgPreview } = await import('~/utils/dxfParser');
    const currentSystemPens = systemPens.value;
    const defaultPen = currentSystemPens.length > 0 ? currentSystemPens[0] : {
      stroke: { color: '#000000', weight: 0.5, pattern: 'SOLID' }
    };
    
    const layerToPenMap = {};
    for (const [layerName, standardCode] of Object.entries(layerMappings.value)) {
      if (standardCode) {
        const standard = standards.value.find(s => s.code === standardCode);
        if (standard && standard.defaultPenId) {
          const pen = pens.value.find(p => p._id?.toString() === standard.defaultPenId?.toString());
          if (pen) {
            layerToPenMap[layerName] = pen;
          }
        }
      }
    }
    
    const svg = await generateSvgPreview(dxfFile.value, layerToPenMap, defaultPen);
    svgPreview.value = svg;
  } catch (error) {
    console.error('Failed to update preview:', error);
  }
};

watch(layerMappings, () => {
  updatePreview();
}, { deep: true });

const handleUpload = async () => {
  if (!selectedFile.value || !name.value.trim()) return;

  isUploading.value = true;
  errorMessage.value = '';

  try {
    const mappings = {};
    Object.entries(layerMappings.value).forEach(([layer, standardCode]) => {
      if (standardCode) {
        mappings[layer] = standardCode;
      }
    });

    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('name', name.value);
    formData.append('layerMapping', JSON.stringify(mappings));
    formData.append('parameters', JSON.stringify(parameters.value));

    const uploadedCassette = await $fetch('/api/cassettes/upload', {
      method: 'POST',
      body: formData
    });

    emit('uploaded', uploadedCassette);
    emit('saved', uploadedCassette);
    isOpen.value = false;
    resetForm();
  } catch (error) {
    errorMessage.value = error.data?.message || 'Upload failed';
    console.error('Upload failed:', error);
  } finally {
    isUploading.value = false;
  }
};

const handleClose = () => {
  if (!isUploading.value) {
    resetForm();
    isOpen.value = false;
  }
};

const resetForm = () => {
  name.value = '';
  selectedFile.value = null;
  dxfFile.value = null;
  isUploading.value = false;
  errorMessage.value = '';
  cassette.value = null;
  layerMappings.value = {};
  detectedLayers.value = [];
  svgPreview.value = null;
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--p-content-border-color);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--p-primary-color);
}
</style>
