<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="cassette ? $t('cassette.edit') : $t('cassette.uploadTitle')"
    :modal="true"
    :closable="!isProcessing"
    :style="{ width: '900px' }"
    @hide="handleClose"
  >
    <div class="cassette-editor">
      <!-- Step 1: Upload (only for new cassettes) -->
      <div v-if="!cassette && !uploadedCassette" class="upload-section">
        <Message severity="info" :closable="false">
          {{ $t('cassette.uploadDescription') }}
        </Message>

        <div class="field">
          <label for="cassetteName">{{ $t('cassette.name') }}</label>
          <InputText 
            id="cassetteName"
            v-model="name" 
            :placeholder="$t('cassette.nameExample')"
          />
        </div>

        <div class="field">
          <label>{{ $t('cassette.dxfFile') }}</label>
          <FileUpload 
            ref="fileUploader"
            mode="basic" 
            accept=".dxf"
            :maxFileSize="10000000"
            :auto="false"
            :customUpload="true"
            :choose-label="selectedFile ? $t('common.changeFile') : $t('common.chooseFile')"
            @select="handleFileSelect"
          />
          <small v-if="selectedFile" class="file-info">
            <i class="pi pi-file"></i> {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
          </small>
        </div>

        <Button 
          :label="$t('common.upload')" 
          icon="pi pi-upload"
          :loading="uploadStatus === 'uploading'"
          :disabled="!canUpload"
          @click="handleUpload"
          class="w-full"
        />
      </div>

      <!-- Step 2: Processing & Preview -->
      <div v-if="currentCassette" class="preview-section">
        <div class="cassette-info">
          <h3>{{ currentCassette.name }}</h3>
          <Tag 
            :value="currentCassette.processingStatus" 
            :severity="getProcessingStatusSeverity(currentCassette.processingStatus)"
          />
        </div>

        <!-- SVG Preview -->
        <div v-if="currentCassette.svgId || previewUrl" class="svg-preview">
          <img 
            v-if="previewUrl" 
            :src="previewUrl" 
            alt="Cassette preview"
            @error="handlePreviewError"
          />
          <div v-else-if="currentCassette.processingStatus === 'processing'" class="preview-loading">
            <ProgressSpinner style="width: 50px; height: 50px" />
            <p>{{ $t('cassette.processingPreview') }}</p>
          </div>
          <div v-else class="preview-placeholder">
            <i class="pi pi-image" style="font-size: 3rem"></i>
            <p>{{ $t('cassette.noPreview') }}</p>
          </div>
        </div>

        <!-- Detected Layers -->
        <div v-if="detectedLayers.length > 0" class="layers-section">
          <Divider />
          
          <h4>
            <i class="pi pi-layer-group"></i>
            {{ $t('cassette.detectedLayers') }}
          </h4>
          <div class="detected-layers">
            <Tag 
              v-for="layer in detectedLayers" 
              :key="layer"
              :value="layer"
              severity="secondary"
              icon="pi pi-tag"
            />
          </div>

          <Divider />

          <h4>
            <i class="pi pi-sitemap"></i>
            {{ $t('cassette.mapToStandards') }}
          </h4>
          <Message severity="info" :closable="false">
            {{ $t('cassette.mappingDescription') }}
          </Message>

          <div class="layer-mappings">
            <div 
              v-for="layerType in layerTypes" 
              :key="layerType"
              class="mapping-row"
            >
              <div class="mapping-label">
                <i :class="getLayerIcon(layerType)"></i>
                <span>{{ $t(`cassette.layers.${layerType}`) }}</span>
              </div>
              
              <MultiSelect 
                v-model="layerMapping[layerType]"
                :options="detectedLayers"
                :placeholder="$t('cassette.selectLayers')"
                display="chip"
                :maxSelectedLabels="3"
                class="mapping-select"
              />
            </div>
          </div>
        </div>

        <div v-else-if="currentCassette.processingStatus === 'processing'" class="processing-message">
          <ProgressSpinner />
          <p>{{ $t('cassette.detectingLayers') }}</p>
        </div>
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
        v-if="showSaveButton"
        :label="$t('common.save')" 
        icon="pi pi-check"
        :loading="uploadStatus === 'saving'"
        :disabled="!canSave"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import ProgressSpinner from 'primevue/progressspinner';

const props = defineProps({
  cassette: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'saved']);

const isOpen = ref(true);
const name = ref(props.cassette?.name || '');
const selectedFile = ref(null);
const uploadStatus = ref('idle'); // idle, uploading, processing, saving, error
const errorMessage = ref('');
const uploadedCassette = ref(null);
const previewUrl = ref('');
const pollingInterval = ref(null);

const layerTypes = ['cut', 'bend', 'frame', 'dimensions'];
const detectedLayers = ref(props.cassette?.detectedLayers || []);
const layerMapping = reactive({
  cut: props.cassette?.layerMapping?.cut || [],
  bend: props.cassette?.layerMapping?.bend || [],
  frame: props.cassette?.layerMapping?.frame || [],
  dimensions: props.cassette?.layerMapping?.dimensions || []
});

const currentCassette = computed(() => props.cassette || uploadedCassette.value);

const canUpload = computed(() => {
  return name.value.trim() !== '' && selectedFile.value !== null && uploadStatus.value === 'idle';
});

const isProcessing = computed(() => {
  return uploadStatus.value === 'uploading' || uploadStatus.value === 'processing' || uploadStatus.value === 'saving';
});

const showSaveButton = computed(() => {
  return currentCassette.value && detectedLayers.value.length > 0;
});

const canSave = computed(() => {
  // At least one layer type should be mapped
  return Object.values(layerMapping).some(layers => layers.length > 0);
});

const getLayerIcon = (type) => {
  const icons = {
    cut: 'pi pi-scissors',
    bend: 'pi pi-arrows-alt',
    frame: 'pi pi-stop',
    dimensions: 'pi pi-pencil'
  };
  return icons[type] || 'pi pi-tag';
};

const getProcessingStatusSeverity = (status) => {
  const severities = {
    processing: 'info',
    done: 'success',
    error: 'danger',
    pending: 'warning'
  };
  return severities[status] || 'secondary';
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const handleFileSelect = (event) => {
  const file = event.files?.[0];
  if (file) {
    selectedFile.value = file;
    if (!name.value) {
      name.value = file.name.replace('.dxf', '').replace(/\.[^/.]+$/, '');
    }
  }
};

const handleUpload = async () => {
  if (!canUpload.value) return;

  uploadStatus.value = 'uploading';
  errorMessage.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('name', name.value);

    const cassette = await $fetch('/api/cassettes/upload', {
      method: 'POST',
      body: formData
    });

    uploadedCassette.value = cassette;
    uploadStatus.value = 'processing';
    
    // Start polling for processing status
    startPolling(cassette._id);
  } catch (error) {
    uploadStatus.value = 'error';
    errorMessage.value = error.data?.message || error.message || 'Upload failed';
    console.error('Upload failed:', error);
  }
};

const startPolling = (cassetteId) => {
  if (pollingInterval.value) clearInterval(pollingInterval.value);
  
  pollingInterval.value = setInterval(async () => {
    try {
      const updated = await $fetch(`/api/cassettes/${cassetteId}`);
      uploadedCassette.value = updated;
      
      if (updated.detectedLayers) {
        detectedLayers.value = updated.detectedLayers;
      }
      
      if (updated.svgId) {
        previewUrl.value = `/api/cassettes/${cassetteId}/svg`;
      }
      
      // Stop polling if processing is done
      if (updated.processingStatus === 'done' || updated.processingStatus === 'error') {
        stopPolling();
        uploadStatus.value = 'idle';
        
        if (updated.processingStatus === 'error') {
          errorMessage.value = 'Processing failed';
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
      stopPolling();
    }
  }, 2000);
};

const stopPolling = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
    pollingInterval.value = null;
  }
};

const handleSave = async () => {
  if (!currentCassette.value) return;

  uploadStatus.value = 'saving';
  errorMessage.value = '';

  try {
    await $fetch(`/api/cassettes/${currentCassette.value._id}`, {
      method: 'PUT',
      body: {
        layerMapping: layerMapping
      }
    });
    
    uploadStatus.value = 'idle';
    emit('saved');
  } catch (error) {
    uploadStatus.value = 'error';
    errorMessage.value = error.data?.message || error.message || 'Failed to save layer mapping';
    console.error('Failed to save:', error);
  }
};

const handlePreviewError = () => {
  previewUrl.value = '';
};

const handleClose = () => {
  if (!isProcessing.value) {
    stopPolling();
    emit('close');
  }
};

// Initialize preview URL if editing existing cassette
onMounted(() => {
  if (props.cassette?.svgId) {
    previewUrl.value = `/api/cassettes/${props.cassette._id}/svg`;
  }
  if (props.cassette?.detectedLayers) {
    detectedLayers.value = props.cassette.detectedLayers;
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.cassette-editor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field label {
  font-weight: 600;
  color: var(--text-color);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cassette-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--surface-ground);
  border-radius: 8px;
}

.cassette-info h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.svg-preview {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 24px;
  background: var(--surface-50);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 350px;
  max-height: 500px;
  overflow: hidden;
}

.svg-preview img {
  max-width: 100%;
  max-height: 450px;
  object-fit: contain;
}

.preview-loading,
.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--text-color-secondary);
}

.layers-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.layers-section h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.detected-layers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.layer-mappings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mapping-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
  align-items: center;
}

.mapping-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.mapping-label i {
  font-size: 18px;
  color: var(--primary-color);
}

.mapping-select {
  width: 100%;
}

.processing-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
  color: var(--text-color-secondary);
}

.w-full {
  width: 100%;
}
</style>
