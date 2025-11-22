<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="$t('cassette.uploadTitle')" 
    :modal="true"
    :style="{ width: '450px' }"
    @hide="$emit('close')"
  >
    <div class="upload-form">
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

      <Message v-if="uploadStatus === 'error'" severity="error">
        {{ $t('common.error') }}
      </Message>
    </div>

    <template #footer>
      <Button 
        :label="$t('common.cancel')" 
        severity="secondary"
        @click="$emit('close')"
      />
      <Button 
        :label="$t('common.upload')" 
        icon="pi pi-upload"
        :loading="uploadStatus === 'uploading'"
        :disabled="!canUpload"
        @click="handleUpload"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
import { cassettesStore } from '~/composables/cassettes';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import Message from 'primevue/message';

const emit = defineEmits(['close', 'uploaded']);

const { getters, actions } = cassettesStore;
const uploadStatus = computed(() => getters.uploadStatus.value);
const { uploadCassette } = actions;

const isOpen = ref(true);
const name = ref('');
const selectedFile = ref(null);

const canUpload = computed(() => {
  return name.value.trim() !== '' && selectedFile.value !== null && uploadStatus.value !== 'uploading';
});

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

  try {
    const cassette = await uploadCassette(selectedFile.value, name.value);
    emit('uploaded', cassette);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
</script>

<style scoped>
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
  font-weight: 500;
}

.file-info {
  display: block;
  margin-top: 8px;
  color: var(--text-color-secondary);
}
</style>
