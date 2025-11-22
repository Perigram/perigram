<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="$t('cassette.uploadTitle')"
    :modal="true"
    :closable="!isUploading"
    :style="{ width: '500px' }"
    @hide="handleClose"
  >
    <div class="cassette-upload">
      <div v-if="!isUploading" class="upload-form">
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

      <div v-else class="uploading-state">
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
        :disabled="isUploading"
        @click="handleClose"
      />
      <Button 
        :label="$t('common.upload')" 
        icon="pi pi-upload"
        :disabled="!canUpload || isUploading"
        @click="handleUpload"
      />
    </template>
  </Dialog>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'uploaded']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const name = ref('');
const selectedFile = ref(null);
const isUploading = ref(false);
const errorMessage = ref('');

const canUpload = computed(() => {
  return selectedFile.value && name.value.trim();
});

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

    const cassette = await $fetch('/api/cassettes/upload', {
      method: 'POST',
      body: formData
    });

    emit('uploaded', cassette);
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
  isUploading.value = false;
  errorMessage.value = '';
};
</script>

<style scoped>
.cassette-upload {
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
</style>
