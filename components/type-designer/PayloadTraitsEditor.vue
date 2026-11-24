<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-1">
      <label class="text-label text-muted">{{ $t('processDesigner.payloadMime') }}</label>
      <AutoComplete
        :model-value="modelValue?.mime || []"
        :suggestions="mimeSuggestions"
        :placeholder="$t('processDesigner.payloadMimePlaceholder')"
        class="w-full"
        multiple
        typeahead
        complete-on-focus
        @complete="event => completeMime(event.query)"
        @update:model-value="value => writePayload({ mime: value })"
      />
    </div>
    <template v-if="hasPayload">
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('processDesigner.payloadSize') }}</label>
        <InputNumber
          :model-value="payloadSizeMb"
          :min="0"
          show-buttons
          button-layout="horizontal"
          @update:model-value="value => writePayload({ maxSize: Number(value) > 0 ? Math.round(Number(value) * 1024 * 1024) : undefined })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('processDesigner.payloadPreview') }}</label>
        <Select
          :model-value="modelValue?.preview || ''"
          :options="previewOptions"
          option-label="label"
          option-value="value"
          @update:model-value="value => writePayload({ preview: value || undefined })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('processDesigner.payloadCreation') }}</label>
        <MultiSelect
          :model-value="modelValue?.creation || []"
          :options="creationOptions"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="value => writePayload({ creation: value })"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
// The one payload-traits form (SPEC §4): accepted MIME, size limit, preview
// mode, creation protocols. Empty MIME leaves a file-class type
// payload-less; any MIME writes the trait set the construct projection
// turns into upload/capture/editor/content modes.
import { computed, ref } from 'vue';
import AutoComplete from 'primevue/autocomplete';
import InputNumber from 'primevue/inputnumber';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Select from '~/components/shared/InstanceSelect.vue';
import { CREATION_PROTOCOLS } from '#packages/cts';
import { RENDERABLE_PREVIEW_MODES } from '#shared/ui-mapping/index.js';

const modelValue = defineModel({ type: Object, default: null });

const creationOptions = CREATION_PROTOCOLS.map(value => ({ label: value, value }));

const previewOptions = [
  { label: 'download', value: '' },
  ...[...new Set([...RENDERABLE_PREVIEW_MODES, 'attachment', 'none'])]
    .map(value => ({ label: value, value }))
];

const hasPayload = computed(() => Boolean(modelValue.value?.mime?.length));
const payloadSizeMb = computed(() => {
  const bytes = Number(modelValue.value?.maxSize);
  return Number.isFinite(bytes) && bytes > 0 ? bytes / (1024 * 1024) : null;
});

const MIME_SUGGESTIONS = Object.freeze([
  'image/*', 'video/*', 'audio/*', 'text/*',
  'application/pdf', 'application/json', 'application/zip',
  'text/plain', 'text/csv', 'text/markdown'
]);
const mimeSuggestions = ref(MIME_SUGGESTIONS);
function completeMime(query = '') {
  const needle = String(query).toLowerCase();
  mimeSuggestions.value = MIME_SUGGESTIONS.filter(mime => mime.includes(needle));
}

function writePayload(patch) {
  const current = modelValue.value || {};
  const next = { ...current, ...patch };
  const mime = (next.mime || []).map(entry => String(entry).trim()).filter(Boolean);
  if (!mime.length) {
    modelValue.value = null;
    return;
  }
  const maxSize = Number(next.maxSize);
  modelValue.value = {
    mime,
    ...(Number.isFinite(maxSize) && maxSize > 0 ? { maxSize: Math.round(maxSize) } : {}),
    ...(next.preview ? { preview: String(next.preview) } : {}),
    creation: (next.creation || []).length ? [...new Set(next.creation.map(String))] : ['upload']
  };
}
</script>
