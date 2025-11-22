<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="cassette ? $t('cassette.edit') : $t('cassette.uploadTitle')"
    :modal="true"
    :style="{ width: '800px' }"
    @hide="$emit('close')"
  >
    <div class="cassette-editor">
      <!-- Step 1: Upload (only for new cassettes) -->
      <div v-if="!cassette" class="upload-section">
        <div class="field">
          <label for="cassetteName">{{ $t('cassette.name') }}</label>
          <InputText 
            id="cassetteName"
            v-model="name" 
            :placeholder="$t('cassette.name')"
          />
        </div>

        <div class="field">
          <label>{{ $t('cassette.file') }}</label>
          <FileUpload 
            mode="basic" 
            accept=".dxf"
            :maxFileSize="10000000"
            :choose-label="$t('common.chooseFile')"
            @select="handleFileSelect"
          />
          <small v-if="selectedFile" class="file-info">
            {{ $t('files.selected') }}: {{ selectedFile.name }}
          </small>
        </div>

        <Button 
          :label="$t('common.upload')" 
          icon="pi pi-upload"
          :loading="uploadStatus === 'uploading'"
          :disabled="!canUpload"
          @click="handleUpload"
          class="upload-btn"
        />
      </div>

      <!-- Step 2: Layer Mapping -->
      <div v-if="showLayerMapping" class="mapping-section">
        <Message severity="info" :closable="false">
          {{ $t('cassette.mapLayersDescription') }}
        </Message>

        <div class="layers-preview">
          <h4>{{ $t('cassette.detectedLayers') }}</h4>
          <div class="detected-layers">
            <Tag 
              v-for="layer in detectedLayers" 
              :key="layer"
              :value="layer"
              severity="secondary"
            />
          </div>
        </div>

        <Divider />

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

        <!-- SVG Preview if available -->
        <div v-if="cassette?.svgId" class="preview-section">
          <Divider />
          <h4>{{ $t('cassette.preview') }}</h4>
          <div class="svg-preview">
            <img :src="`/api/cassettes/${cassette._id}/svg`" alt="Cassette preview" />
          </div>
        </div>
      </div>

      <Message v-if="uploadStatus === 'error'" severity="error">
        {{ errorMessage || $t('common.error') }}
      </Message>
    </div>

    <template #footer>
      <Button 
        :label="$t('common.cancel')" 
        severity="secondary"
        @click="$emit('close')"
      />
      <Button 
        v-if="showLayerMapping"
        :label="$t('common.save')" 
        icon="pi pi-check"
        :loading="uploadStatus === 'processing'"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import MultiSelect from 'primevue/multiselect';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';

const props = defineProps({
  cassette: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'uploaded', 'saved']);

const { getters, actions } = cassettesStore;
const { uploadCassette, mapLayers } = actions;

const isOpen = ref(true);
const name = ref(props.cassette?.name || '');
const selectedFile = ref(null);
const uploadStatus = ref('idle');
const errorMessage = ref('');
const detectedLayers = ref(props.cassette?.detectedLayers || []);
const uploadedCassette = ref(null);

const layerTypes = ['cut', 'bend', 'frame', 'dimensions'];
const layerMapping = reactive({
  cut: props.cassette?.layerMapping?.cut || [],
  bend: props.cassette?.layerMapping?.bend || [],
  frame: props.cassette?.layerMapping?.frame || [],
  dimensions: props.cassette?.layerMapping?.dimensions || []
});

const canUpload = computed(() => {
  return name.value.trim() !== '' && selectedFile.value !== null && uploadStatus.value !== 'uploading';
});

const showLayerMapping = computed(() => {
  return (props.cassette || uploadedCassette.value) && detectedLayers.value.length > 0;
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

const handleFileSelect = (event) => {
  const file = event.files?.[0];
  if (file) {
    selectedFile.value = file;
    if (!name.value) {
      name.value = file.name.replace('.dxf', '');
    }
  }
};

const handleUpload = async () => {
  if (!canUpload.value) return;

  uploadStatus.value = 'uploading';
  errorMessage.value = '';

  try {
    const cassette = await uploadCassette(selectedFile.value, name.value);
    uploadedCassette.value = cassette;
    detectedLayers.value = cassette.detectedLayers || [];
    uploadStatus.value = 'idle';
    
    // If no layers detected, close immediately
    if (detectedLayers.value.length === 0) {
      emit('uploaded', cassette);
    }
  } catch (error) {
    uploadStatus.value = 'error';
    errorMessage.value = error.message || 'Upload failed';
    console.error('Upload failed:', error);
  }
};

const handleSave = async () => {
  const targetCassette = props.cassette || uploadedCassette.value;
  if (!targetCassette) return;

  uploadStatus.value = 'processing';
  errorMessage.value = '';

  try {
    await mapLayers(targetCassette._id, layerMapping);
    uploadStatus.value = 'idle';
    
    if (uploadedCassette.value) {
      emit('uploaded', targetCassette);
    } else {
      emit('saved');
    }
  } catch (error) {
    uploadStatus.value = 'error';
    errorMessage.value = error.message || 'Failed to save layer mapping';
    console.error('Failed to save layer mapping:', error);
  }
};
</script>

<style scoped>
.cassette-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-section,
.mapping-section {
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
  font-weight: 500;
}

.file-info {
  display: block;
  margin-top: 8px;
  color: var(--text-color-secondary);
}

.upload-btn {
  align-self: flex-start;
}

.layers-preview h4,
.preview-section h4 {
  margin: 0 0 12px 0;
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

.svg-preview {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface-ground);
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.svg-preview img {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
}
</style>
