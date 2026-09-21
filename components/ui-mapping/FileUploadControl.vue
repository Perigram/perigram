<template>
  <div class="flex flex-col gap-1">
    <FileUpload
      mode="basic"
      :choose-label="chooseLabel"
      :accept="accept"
      :max-file-size="payload?.maxSize"
      :disabled="uploading"
      auto
      custom-upload
      class="w-full"
      @uploader="upload"
    />
    <span v-if="model?.name" class="text-muted text-supporting truncate">{{ model.name }}</span>
    <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import FileUpload from 'primevue/fileupload';
import Message from 'primevue/message';

const props = defineProps({ payload: { type: Object, default: null } });

const model = defineModel();
const uploading = ref(false);
const errorMessage = ref('');

const accept = computed(() => (props.payload?.accept || props.payload?.mime || []).join(','));
const chooseLabel = computed(() => (props.payload?.accept || props.payload?.mime || []).join(' / ') || 'Upload');

async function upload(event = {}) {
  const file = event.files?.[0];
  if (!file) return;
  errorMessage.value = '';
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
    model.value = { fileId: stored.id, mime: file.type || null, size: file.size, name: file.name };
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}
</script>
