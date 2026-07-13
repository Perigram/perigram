<script setup>
import { computed, ref } from 'vue';
import Button from 'primevue/button';

const props = defineProps({
  modelValue: { type: Object, default: null },
  accept: { type: String, default: '*/*' },
  capture: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
const uploadInput = ref(null);
const cameraInput = ref(null);
const uploading = ref(false);
const fileName = computed(() => props.modelValue?.filename || props.modelValue?.name || '');

async function upload(file) {
  if (!file) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const result = await $fetch('/api/files/upload', { method: 'POST', body: form });
    emit('update:modelValue', {
      fileId: result.id,
      filename: result.filename || file.name,
      mimeType: file.type || '',
      bucketName: 'uploads',
      url: result.url
    });
  } finally {
    uploading.value = false;
    if (uploadInput.value) uploadInput.value.value = '';
    if (cameraInput.value) cameraInput.value.value = '';
  }
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <input ref="uploadInput" class="hidden" type="file" :accept="accept" @change="upload($event.target.files?.[0])" />
    <input v-if="capture" ref="cameraInput" class="hidden" type="file" accept="image/*" capture="environment" @change="upload($event.target.files?.[0])" />
    <Button icon="pi pi-upload" text size="small" :loading="uploading" :aria-label="$t('common.upload')" @click="uploadInput?.click()" />
    <Button v-if="capture" icon="pi pi-camera" text size="small" :loading="uploading" :aria-label="$t('common.camera')" @click="cameraInput?.click()" />
    <span v-if="fileName" class="min-w-0 flex-1 truncate text-sm">{{ fileName }}</span>
    <Button v-if="modelValue" icon="pi pi-times" text rounded size="small" severity="secondary" :aria-label="$t('common.delete')" @click="emit('update:modelValue', null)" />
  </div>
</template>
