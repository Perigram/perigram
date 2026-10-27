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
    <FileChip v-if="model?.name" :file="model" @open="openPayload" />
    <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import FileUpload from 'primevue/fileupload';
import Message from 'primevue/message';
import { useI18n } from 'vue-i18n';
import FileChip from '../shared/FileChip.vue';

const props = defineProps({ payload: { type: Object, default: null } });

const model = defineModel();
const uploading = ref(false);
const errorMessage = ref('');
const { t } = useI18n();

function openPayload() {
  const fileId = model.value?.fileId;
  if (!fileId || typeof window === 'undefined') return;
  window.open(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files`, '_blank');
}

const accept = computed(() => (props.payload?.accept || props.payload?.mime || []).join(','));
const chooseLabel = computed(() => (props.payload?.accept || props.payload?.mime || []).join(' / ') || t('common.upload'));

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
    errorMessage.value = error?.data?.message || error?.message || t('errors.uploadFailed');
  } finally {
    uploading.value = false;
  }
}
</script>
