<template>
  <StandardDialog
    v-model:visible="isOpen" 
    :closable="!isUploading"
    size="lg"
    @hide="handleClose"
  >
    <template #header>
      {{ cassette ? $t('cassette.editTitle') : $t('cassette.uploadTitle') }}
    </template>

    <div class="flex flex-col gap-6 py-2">
      <!-- Upload Section -->
      <div v-if="!showMappingSection && !isUploading" class="flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <label for="cassetteName" class="font-medium">{{ $t('cassette.name') }}</label>
          <InputText 
            id="cassetteName"
            v-model="name" 
            :placeholder="$t('cassette.nameExample')"
            class="w-full"
            autofocus
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">{{ $t('cassette.selectFile') }}</label>
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
        <ProgressSpinner class="w-12 h-12" />
        <p class="font-medium">{{ $t('common.uploading') }}</p>
      </div>

      <!-- Layer Mapping Section -->
      <div v-if="showMappingSection && !isUploading" class="flex flex-col gap-6">
        <div class="flex-1 h-48 border rounded-xl flex items-center justify-center relative overflow-hidden">
          <svg 
            v-if="renderingData" 
            xmlns="http://www.w3.org/2000/svg" 
            :viewBox="renderingData.viewBox" 
            class="w-full h-full p-4"
          >
            <g v-for="layer in renderingData.layers" :key="layer.name" :stroke="layer.color" :stroke-width="layer.weight * 5" fill="none" stroke-linecap="round" stroke-linejoin="round" :stroke-dasharray="layer.dasharray">
              <g v-html="layer.paths.join('')"></g>
            </g>
          </svg>
          <div v-else class="flex flex-col items-center gap-3 opacity-60">
            <div class="w-12 h-12 border rounded-full flex items-center justify-center">
              <i class="pi pi-image"></i>
            </div>
            <p class="font-medium">{{ $t('cassette.noPreview') }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="flex flex-col gap-4">
            <h3 class="m-0">{{ $t('cassette.layerMapping') }}</h3>
            <div v-if="detectedLayers && detectedLayers.length > 0" class="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2">
              <div v-for="(layer, index) in detectedLayers" :key="index" class="flex flex-col gap-1 p-2 border rounded-lg">
                <label class="font-medium truncate" :title="layer">{{ layer }}</label>
                <Select 
                  v-model="layerMappings[layer]"
                  :options="layerStandards"
                  optionLabel="label"
                  optionValue="value"
                  :placeholder="$t('cassette.selectLayerType')"
                  class="w-full"
                  size="small"
                />
              </div>
            </div>
            <Message v-else severity="info" size="small">
              {{ $t('cassette.detectingLayers') }}
            </Message>
          </div>
          
          <div class="flex flex-col gap-4">
            <h3 class="m-0">{{ $t('cassette.parameters') }}</h3>
            <div class="flex flex-col gap-2">
              <p class="m-0 opacity-70">{{ $t('cassette.parametersHelp') }}</p>
              <InputChips 
                v-model="parameters" 
                :placeholder="$t('cassette.parametersPlaceholder')"
                separator=","
                class="w-full"
              />
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
  </StandardDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import InputChips from 'primevue/inputchips';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';

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
const { t } = useI18n();

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
const renderingData = ref(null);
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
      if (cassette.value.definition?.data?.mapping) {
        layerMappings.value = { ...cassette.value.definition.data.mapping };
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
      renderingData.value = null;
    } finally {
      isUploading.value = false;
    }
  }
};

const updatePreview = async () => {
  if (!dxfFile.value) return;
  
  try {
    const { generateSvgData, buildLayerPenMap } = await import('~/utils/dxfParser');
    const defaultPen = systemPens.value[0] || { stroke: { color: '#000000', weight: 0.5, pattern: 'SOLID' } };
    const layerToPenMap = buildLayerPenMap(layerMappings.value, standards.value, pens.value);
    const data = await generateSvgData(dxfFile.value, layerToPenMap, defaultPen);
    renderingData.value = data;
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
  renderingData.value = null;
};

defineExpose({
  handleFileSelect
});
</script>
