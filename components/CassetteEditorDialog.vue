<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="$t('cassette.uploadTitle')"
    :modal="true"
    :closable="!isProcessing"
    :style="{ width: '800px' }"
    @hide="handleClose"
  >
    <div class="cassette-editor">
      <!-- File Selection -->
      <div v-if="step === 'select'" class="step-select">
        <div class="field">
          <label for="cassetteName">{{ $t('cassette.name') }} *</label>
          <InputText 
            id="cassetteName"
            v-model="name" 
            :placeholder="$t('cassette.nameExample')"
          />
        </div>

        <div class="field">
          <FileUpload 
            mode="basic" 
            accept=".dxf"
            :maxFileSize="10000000"
            :auto="false"
            :customUpload="true"
            :chooseLabel="selectedFile ? selectedFile.name : $t('cassette.selectFile')"
            @select="handleFileSelect"
          />
        </div>
      </div>

      <!-- Analyzing -->
      <div v-if="step === 'analyzing'" class="step-analyzing">
        <ProgressSpinner style="width: 50px; height: 50px" />
        <p>{{ $t('cassette.detectingLayers') }}</p>
      </div>

      <!-- Layer Mapping with Preview -->
      <div v-if="step === 'mapping'" class="step-mapping">
        <!-- Preview -->
        <div class="preview-container">
          <SvgDisplay v-if="previewDataUri" :svgContent="previewDataUri" />
          <div v-else class="preview-placeholder">
            <i class="pi pi-image" style="font-size: 3rem"></i>
          </div>
        </div>

        <!-- Layer Mapping -->
        <div class="mapping-container">
          <h4>{{ $t('cassette.detectedLayers') }}:</h4>
          <div class="detected-layers">
            <Tag 
              v-for="layer in detectedLayers" 
              :key="layer"
              :value="layer"
              severity="secondary"
            />
          </div>

          <Divider />

          <h4>{{ $t('cassette.mapLayers') }}:</h4>
          <div class="mapping-fields">
            <div v-for="layerType in layerTypes" :key="layerType" class="mapping-row">
              <label>{{ $t(`cassette.layers.${layerType}`) }}</label>
              <MultiSelect
                v-model="layerMapping[layerType]"
                :options="detectedLayers"
                :placeholder="$t('cassette.selectLayers')"
                display="chip"
                class="mapping-select"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Uploading -->
      <div v-if="step === 'uploading'" class="step-uploading">
        <ProgressSpinner style="width: 50px; height: 50px" />
        <p>{{ $t('common.uploading') }}</p>
      </div>

      <Message v-if="errorMessage" severity="error">
        {{ errorMessage }}
      </Message>
    </div>

    <template #footer>
      <Button 
        :label="$t('common.cancel')" 
        severity="secondary"
        text
        :disabled="isProcessing"
        @click="handleClose"
      />
      <Button 
        v-if="step === 'select'"
        :label="$t('common.next')" 
        icon="pi pi-arrow-right"
        iconPos="right"
        :disabled="!canAnalyze"
        @click="handleAnalyze"
      />
      <Button 
        v-if="step === 'mapping'"
        :label="$t('common.upload')" 
        icon="pi pi-upload"
        :disabled="!canUpload"
        @click="handleUpload"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import ProgressSpinner from 'primevue/progressspinner';
import SvgDisplay from './SvgDisplay.vue';

const emit = defineEmits(['close', 'uploaded']);

const isOpen = ref(true);
const step = ref('select'); // select, analyzing, mapping, uploading
const name = ref('');
const selectedFile = ref(null);
const detectedLayers = ref([]);
const previewDataUri = ref('');
const errorMessage = ref('');

const layerTypes = ['cut', 'bend', 'frame', 'dimensions'];
const layerMapping = reactive({
  cut: [],
  bend: [],
  frame: [],
  dimensions: []
});

const isProcessing = computed(() => {
  return step.value === 'analyzing' || step.value === 'uploading';
});

const canAnalyze = computed(() => {
  return name.value.trim() !== '' && selectedFile.value !== null;
});

const canUpload = computed(() => {
  return Object.values(layerMapping).some(layers => layers.length > 0);
});

const handleFileSelect = async (event) => {
  const file = event.files?.[0];
  if (!file) return;
  
  selectedFile.value = file;
  if (!name.value) {
    name.value = file.name.replace(/\.dxf$/i, '');
  }
};

const handleAnalyze = async () => {
  step.value = 'analyzing';
  errorMessage.value = '';
  
  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    
    const analysis = await $fetch('/api/cassettes/analyze', {
      method: 'POST',
      body: formData
    });
    
    detectedLayers.value = analysis.detectedLayers || [];
    
    // Try to read file as text for preview (simplified)
    const reader = new FileReader();
    reader.onload = (e) => {
      // For now, just show that we have it
      previewDataUri.value = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" fill="gray">DXF Preview</text></svg>';
    };
    reader.readAsText(selectedFile.value);
    
    step.value = 'mapping';
  } catch (error) {
    step.value = 'select';
    errorMessage.value = error.data?.message || 'Failed to analyze file';
    console.error('Analysis failed:', error);
  }
};

const handleUpload = async () => {
  step.value = 'uploading';
  errorMessage.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('name', name.value);
    formData.append('layerMapping', JSON.stringify(layerMapping));

    const cassette = await $fetch('/api/cassettes/upload', {
      method: 'POST',
      body: formData
    });

    emit('uploaded', cassette);
    isOpen.value = false;
  } catch (error) {
    step.value = 'mapping';
    errorMessage.value = error.data?.message || error.message || 'Upload failed';
    console.error('Upload failed:', error);
  }
};

const handleClose = () => {
  if (!isProcessing.value) {
    emit('close');
  }
};
</script>

<style scoped>
.cassette-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 300px;
}

.step-select,
.step-mapping {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-analyzing,
.step-uploading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field label {
  font-weight: 600;
  color: var(--label-primary);
}

.step-mapping {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background-color: var(--fill-tertiary);
  border-radius: 8px;
  padding: 16px;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--label-secondary);
}

.mapping-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mapping-container h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--label-primary);
}

.detected-layers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mapping-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mapping-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mapping-row label {
  font-size: 13px;
  font-weight: 500;
  color: var(--label-primary);
}

.mapping-select {
  width: 100%;
}

.step-analyzing, .step-uploading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 20px;
}

.step-analyzing p, .step-uploading p {
  font-size: 14px;
  color: var(--label-secondary);
}
</style>
