<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="cassette ? $t('cassette.editTitle') : $t('cassette.uploadTitle')"
    :modal="true"
    :closable="!isUploading"
    :style="{ width: cassette ? '900px' : '500px' }"
    @hide="handleClose"
  >
    <div class="cassette-editor">
      <!-- Upload Section -->
      <div v-if="!showMappingSection && !isUploading" class="upload-form">
        <div class="field">
          <label for="cassetteName">{{ $t('cassette.name') }}</label>
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

      <!-- Loading State -->
      <div v-if="isUploading" class="uploading-state">
        <ProgressSpinner style="width: 50px; height: 50px" />
        <p>{{ $t('common.uploading') }}</p>
      </div>

      <!-- Layer Mapping Section -->
      <div v-if="showMappingSection && !isUploading" class="mapping-layout">
        <div class="preview-panel">
          <h3>{{ $t('cassette.preview') }}</h3>
          <div v-if="cassette?.svgId || localSvgPreview" class="svg-preview">
            <img 
              v-if="cassette?.svgId" 
              :src="`/api/files/svg/${cassette.svgId}`" 
              :alt="name" 
            />
            <div v-else-if="localSvgPreview" v-html="localSvgPreview"></div>
          </div>
          <div v-else class="no-preview">
            <i class="pi pi-image" style="font-size: 3rem"></i>
            <p>{{ $t('cassette.noPreview') }}</p>
          </div>
        </div>

        <div class="layers-panel">
          <h3>{{ $t('cassette.layerMapping') }}</h3>
          <div v-if="cassette.detectedLayers && cassette.detectedLayers.length > 0" class="layer-list">
            <div v-for="(layer, index) in cassette.detectedLayers" :key="index" class="layer-item">
              <label>{{ layer }}</label>
              <Dropdown 
                v-model="layerMappings[layer]"
                :options="layerStandards"
                optionLabel="label"
                optionValue="value"
                :placeholder="$t('cassette.selectLayerType')"
              />
            </div>
          </div>
          <Message v-else severity="info">
            {{ $t('cassette.detectingLayers') }}
          </Message>
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
        :disabled="isUploading"
        @click="handleClose"
      />
      <Button 
        v-if="!cassette"
        :label="$t('common.upload')" 
        icon="pi pi-upload"
        :disabled="!canUpload || isUploading"
        @click="handleUpload"
      />
      <Button 
        v-else
        :label="$t('common.save')" 
        icon="pi pi-check"
        :disabled="isUploading"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { cassettesStore } from '~/composables/cassettes';

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
const layerMappings = ref({});
const localSvgPreview = ref(null);

const showMappingSection = computed(() => {
  return cassette.value !== null;
});

const layerStandards = computed(() => [
  { label: 'Рез', value: 'cut' },
  { label: 'Гибка', value: 'bend' },
  { label: 'Рамка', value: 'frame' },
  { label: 'Размеры', value: 'dimensions' },
  { label: 'Не использовать', value: null }
]);

const canUpload = computed(() => {
  return selectedFile.value && name.value.trim();
});

// Load cassette when cassetteId changes
watch(() => props.cassetteId, async (newId) => {
  if (newId) {
    try {
      cassette.value = await cassettesStore.actions.fetchById(newId);
      // Initialize layer mappings from existing data
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

const handleFileSelect = (event) => {
  if (event.files && event.files.length > 0) {
    selectedFile.value = event.files[0];
    if (!name.value) {
      name.value = event.files[0].name.replace(/\.dxf$/i, '');
    }
  }
};

const handleUpload = async () => {
  if (!canUpload.value) return;
  
  isUploading.value = true;
  errorMessage.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('name', name.value);

    const uploadedCassette = await $fetch('/api/cassettes/upload', {
      method: 'POST',
      body: formData
    });

    // Switch to mapping mode
    cassette.value = uploadedCassette;
    emit('uploaded', uploadedCassette);
  } catch (error) {
    errorMessage.value = error.data?.message || 'Upload failed';
    console.error('Upload failed:', error);
  } finally {
    isUploading.value = false;
  }
};

const handleSave = async () => {
  if (!cassette.value) return;

  isUploading.value = true;
  errorMessage.value = '';

  try {
    // Convert layerMappings to the expected format
    const mappings = {
      cut: [],
      bend: [],
      frame: [],
      dimensions: []
    };

    Object.entries(layerMappings.value).forEach(([layer, type]) => {
      if (type && mappings[type]) {
        mappings[type].push(layer);
      }
    });

    await $fetch(`/api/cassettes/${cassette.value._id}/mappings`, {
      method: 'PUT',
      body: { layerMapping: mappings }
    });

    emit('saved', cassette.value);
    isOpen.value = false;
    resetForm();
  } catch (error) {
    errorMessage.value = error.data?.message || 'Save failed';
    console.error('Save failed:', error);
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
  isUploading.value = false;
  errorMessage.value = '';
  cassette.value = null;
  layerMappings.value = {};
};
</script>

<style scoped>
.cassette-editor {
  padding: 20px 0;
}

.upload-form {
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
  font-size: 14px;
  font-weight: 600;
  color: var(--label-primary);
}

.uploading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 20px;
}

.uploading-state p {
  font-size: 14px;
  color: var(--label-secondary);
}

.mapping-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.preview-panel h3,
.layers-panel h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--label-primary);
}

.svg-preview {
  border: 1px solid var(--separator-primary);
  border-radius: 8px;
  padding: 16px;
  background: var(--background-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.svg-preview img {
  max-width: 100%;
  max-height: 400px;
}

.no-preview {
  border: 2px dashed var(--separator-primary);
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  color: var(--label-tertiary);
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layer-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--separator-primary);
  border-radius: 6px;
  background: var(--background-secondary);
}

.layer-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--label-secondary);
}
</style>
