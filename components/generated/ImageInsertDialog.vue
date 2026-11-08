<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :title="t('editors.image')"
    :show-default-footer="false"
    @update:visible="shown => { if (!shown) emit('close'); }"
  >
    <div class="flex flex-col gap-3">
      <FileUpload
        mode="basic"
        accept="image/*"
        :choose-label="t('common.upload')"
        :disabled="uploading"
        auto
        custom-upload
        @uploader="upload"
      />
      <div class="flex items-center gap-2">
        <InputText
          v-model="url"
          size="small"
          class="min-w-0 flex-1"
          type="url"
          :placeholder="t('editors.linkAddress')"
          :aria-label="t('editors.image')"
          @keydown.enter.prevent="applyUrl"
        />
        <Button
          icon="pi pi-check"
          severity="secondary"
          text
          rounded
          size="small"
          :disabled="!url.trim()"
          :aria-label="t('common.apply')"
          @click="applyUrl"
        />
      </div>
      <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
    </div>
  </StandardDialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import StandardDialog from '~/components/shared/StandardDialog.vue';

// The image entry's source chooser (SPEC §26): a stored upload or an
// address, both landing at the caret as the engine's own image node.
const props = defineProps({
  visible: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'insert']);

const { t } = useI18n();
const url = ref('');
const uploading = ref(false);
const errorMessage = ref('');

watch(() => props.visible, visible => {
  if (!visible) return;
  url.value = '';
  errorMessage.value = '';
});

function applyUrl() {
  const value = url.value.trim();
  if (!value) return;
  emit('insert', value);
  emit('close');
}

async function upload(event = {}) {
  const file = event.files?.[0];
  if (!file) return;
  errorMessage.value = '';
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
    emit('insert', stored.url);
    emit('close');
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || t('errors.uploadFailed');
  } finally {
    uploading.value = false;
  }
}
</script>
