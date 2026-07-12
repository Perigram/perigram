<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  action: { type: Object, default: null },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['update:visible', 'submit']);
const { t } = useI18n();
const note = ref('');
const uploaded = ref({});
const uploadErrors = ref({});
const uploadingSlots = ref(new Set());

const schema = computed(() => props.action?.lifecycle || {});
const descriptionSchema = computed(() => schema.value?.description || null);
const attachmentEntries = computed(() => Object.entries(schema.value?.attachments || {}));
const snapshotEntries = computed(() => Object.entries(schema.value?.snapshots || {}));
const hasDescription = computed(() => Boolean(descriptionSchema.value));
const title = computed(() => props.action?.label || t('status.transition'));
const canSubmit = computed(() => {
  if (props.loading || uploadingSlots.value.size > 0) return false;
  if (descriptionSchema.value?.required && !note.value.trim()) return false;
  return attachmentEntries.value.every(([slot, config]) => {
    if (!config?.required) return true;
    const value = uploaded.value[slot];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
});

watch(() => props.visible, (visible) => {
  if (!visible) reset();
});

const close = () => emit('update:visible', false);

const submit = () => {
  const lifecycle = {};
  if (Object.keys(uploaded.value).length) lifecycle.attachments = uploaded.value;
  emit('submit', {
    metadata: note.value.trim() ? { note: note.value.trim() } : {},
    lifecycle
  });
};

async function uploadFiles(slot, files = []) {
  const config = schema.value?.attachments?.[slot] || {};
  const selected = Array.from(files || []);
  if (!selected.length) return;
  uploadErrors.value = { ...uploadErrors.value, [slot]: '' };
  uploadingSlots.value = new Set([...uploadingSlots.value, slot]);

  try {
    const refs = [];
    for (const file of selected) {
      const form = new FormData();
      form.append('file', file, file.name);
      const response = await $fetch('/api/files/upload', {
        method: 'POST',
        body: form,
        query: { bucket: config.bucketName || config.bucket || 'uploads' }
      });
      refs.push({
        fileId: response.id,
        name: response.filename || file.name,
        bucketName: config.bucketName || config.bucket || 'uploads',
        kind: config.kind || slot,
        url: response.url
      });
    }

    uploaded.value = {
      ...uploaded.value,
      [slot]: config.multiple === true ? refs : refs[0]
    };
  } catch (error) {
    uploadErrors.value = {
      ...uploadErrors.value,
      [slot]: error?.data?.message || error?.message || t('status.evidenceUploadFailed')
    };
  } finally {
    const next = new Set(uploadingSlots.value);
    next.delete(slot);
    uploadingSlots.value = next;
  }
}

function attachmentLabel(slot, config = {}) {
  return config.label || slot;
}

function attachmentSummary(slot) {
  const value = uploaded.value[slot];
  const refs = Array.isArray(value) ? value : [value].filter(Boolean);
  return refs.map(ref => ref.name || ref.fileId).join(', ');
}

function reset() {
  note.value = '';
  uploaded.value = {};
  uploadErrors.value = {};
  uploadingSlots.value = new Set();
}
</script>

<template>
  <StandardDialog
    :visible="visible"
    size="sm"
    :header="title"
    :closable="!loading"
    @update:visible="value => emit('update:visible', value)"
  >
    <div class="flex flex-col gap-4">
      <div v-if="hasDescription" class="flex flex-col gap-2">
        <label class="text-sm font-medium" for="status-transition-note">
          {{ t('status.evidenceDescription') }}
        </label>
        <Textarea
          id="status-transition-note"
          v-model="note"
          rows="3"
          auto-resize
          class="w-full"
          :placeholder="t('status.evidenceDescriptionPlaceholder')"
        />
      </div>

      <div
        v-for="[slot, config] in attachmentEntries"
        :key="slot"
        class="flex min-w-0 flex-col gap-2"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-medium">{{ attachmentLabel(slot, config) }}</span>
          <Tag v-if="config.required" :value="t('status.evidenceRequired')" severity="warn" size="small" />
        </div>
        <FileUpload
          mode="basic"
          name="file"
          :accept="config.accept || undefined"
          :multiple="config.multiple === true"
          :custom-upload="true"
          :auto="true"
          :choose-label="t('status.evidenceUpload')"
          :choose-button-props="{ severity: 'secondary', size: 'small', text: true }"
          @select="event => uploadFiles(slot, event.files)"
        />
        <small v-if="attachmentSummary(slot)" class="min-w-0 truncate text-muted-color">
          {{ attachmentSummary(slot) }}
        </small>
        <Message v-if="uploadErrors[slot]" severity="error" size="small" :closable="false">
          {{ uploadErrors[slot] }}
        </Message>
      </div>

      <div v-if="snapshotEntries.length" class="flex flex-wrap gap-2">
        <Tag
          v-for="[key, config] in snapshotEntries"
          :key="key"
          :value="config.label || key"
          icon="pi pi-camera"
          severity="secondary"
          size="small"
        />
      </div>
    </div>

    <template #footer>
      <Button :label="t('common.cancel')" text severity="secondary" size="small" :disabled="loading" @click="close" />
      <Button :label="title" icon="pi pi-check" size="small" :loading="loading" :disabled="!canSubmit" @click="submit" />
    </template>
  </StandardDialog>
</template>
