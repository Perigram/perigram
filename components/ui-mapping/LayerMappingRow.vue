<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div v-if="!fileRef?.fileId" class="text-supporting text-muted">{{ t('uiMapping.uploadForLayerMapping') }}</div>
    <div v-else-if="loading" class="text-supporting text-muted">{{ t('uiMapping.loadingRegion') }}</div>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
    <template v-else-if="layers.length">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 text-label">
        <span>{{ t('uiMapping.sourceLayer') }}</span>
        <span>{{ t('uiMapping.targetLayer') }}</span>
      </div>
      <div
        v-for="layer in layers"
        :key="layer"
        class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2"
      >
        <span class="min-w-0 truncate text-supporting" :title="layer">{{ layer }}</span>
        <Select
          :model-value="mapping[layer] || null"
          :options="targetOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('uiMapping.skipLayer')"
          show-clear
          size="small"
          class="min-w-0"
          @update:model-value="value => assign(layer, value)"
        />
      </div>
      <p v-if="requiredTarget && !requiredTargetMapped" class="m-0 text-supporting text-status-danger">
        {{ t('uiMapping.mapRequiredLayer', { target: requiredTarget }) }}
      </p>
    </template>
    <div v-else class="text-supporting text-muted">{{ t('uiMapping.noLayers') }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DxfParser from 'dxf-parser';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';

// Source-layer → declared production-layer assignment for a DXF import
// (the `layer-mapping` control pin). Targets come from the construction
// declaration; the file is the uploaded payload the dialog already holds.
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  fileRef: { type: Object, default: null },
  targets: { type: Array, default: () => [] },
  requiredTarget: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const layers = ref([]);
const loading = ref(false);
const error = ref('');

const mapping = computed(() => (
  props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue)
    ? props.modelValue
    : {}
));
const targetOptions = computed(() => props.targets.map(target => (
  typeof target === 'string'
    ? { label: target, value: target }
    : { label: target?.label || target?.code || '', value: target?.code || '' }
)).filter(option => option.value));
const requiredTargetMapped = computed(() => (
  Object.values(mapping.value).includes(props.requiredTarget)
));

function layerNamesOf(dxf) {
  const names = new Set();
  for (const entity of dxf?.entities || []) {
    if (entity?.layer) names.add(String(entity.layer));
  }
  for (const key of Object.keys(dxf?.tables?.layer?.layers || {})) names.add(String(key));
  return [...names].sort((left, right) => left.localeCompare(right));
}

async function loadLayers(fileId) {
  layers.value = [];
  error.value = '';
  if (!fileId) return;
  loading.value = true;
  try {
    const url = instancePayloadFileUrl({ fileId });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const dxf = new DxfParser().parseSync(await response.text());
    layers.value = layerNamesOf(dxf);
    const known = new Set(targetOptions.value.map(option => option.value));
    const defaults = Object.fromEntries(
      layers.value.filter(layer => known.has(layer)).map(layer => [layer, layer])
    );
    emit('update:modelValue', defaults);
  } catch (cause) {
    error.value = cause?.message || String(cause);
  } finally {
    loading.value = false;
  }
}

function assign(layer, value) {
  const next = { ...mapping.value };
  if (value) next[layer] = value;
  else delete next[layer];
  emit('update:modelValue', next);
}

watch(
  () => props.fileRef?.fileId || '',
  fileId => loadLayers(fileId),
  { immediate: true }
);
</script>
