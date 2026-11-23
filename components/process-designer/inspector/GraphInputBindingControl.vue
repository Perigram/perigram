<template>
  <div v-if="port" class="flex flex-col gap-2 border-t border-surface pt-3" data-graph-input-binding>
    <strong class="text-supporting">{{ $t('processDesigner.graphInputValues') }}</strong>
    <label class="text-supporting text-muted" :for="`graph-input-${port.id}`">{{ port.label || port.id }}{{ port.required ? ' *' : '' }}</label>
    <InstanceSelect
      v-if="isFileInput"
      :id="`graph-input-${port.id}`"
      :model-value="draft ?? null"
      :options="fileOptions"
      option-label="name"
      option-value="payload.fileId"
      :placeholder="t('processDesigner.selectFile')"
      :disabled="fileOptionsLoading || !fileOptions.length"
      class="w-full"
      @update:model-value="draft = $event"
    />
    <InputText
      v-else-if="isPrimitive && base === 'string'"
      :id="`graph-input-${port.id}`"
      v-model="draft"
      class="w-full"
    />
    <InputNumber
      v-else-if="isPrimitive && ['number', 'integer'].includes(base)"
      :id="`graph-input-${port.id}`"
      v-model="draft"
      :use-grouping="false"
      :step="base === 'integer' ? 1 : undefined"
      class="w-full"
    />
    <ToggleSwitch
      v-else-if="isPrimitive && base === 'boolean'"
      v-model="draft"
    />
    <Textarea
      v-else
      :id="`graph-input-${port.id}`"
      v-model="jsonDraft"
      rows="2"
      auto-resize
      class="w-full text-supporting"
    />
    <Message v-if="isFileInput && fileOptionsError" severity="error">{{ fileOptionsError }}</Message>
    <Message v-else-if="isFileInput && !fileOptionsLoading && !fileOptions.length" severity="info">{{ t('processDesigner.noFilesAvailable') }}</Message>
    <Message v-if="error" severity="error">{{ error }}</Message>
    <Button size="small" severity="secondary" :label="$t('processDesigner.applyGraphInput')" @click="apply" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Message from 'primevue/message';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';
import { graphFileOptions } from '~/utils/graph-file-options.js';

const props = defineProps({
  port: { type: Object, default: null },
  bindings: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['apply']);

const { t } = useI18n();
const instances = useInstancesStore();
const registry = useRegistryStore();
const draft = ref(null);
const jsonDraft = ref('');
const error = ref('');
const fileOptionsLoading = ref(false);
const fileOptionsError = ref('');

const base = computed(() => props.port?.contract?.semantic?.base || 'json');
const shape = computed(() => props.port?.contract?.shape || 'item');
const isPrimitive = computed(() => shape.value === 'item');
const isFileInput = computed(() => props.port?.contract?.semantic?.kind === 'documents.file-id');
const fileTypeIds = computed(() => [...registry.typesById.values()]
  .filter(type => type.class === 'file')
  .map(type => type.id));
const fileOptions = computed(() => graphFileOptions(fileTypeIds.value, instances.instancePool));

watch(
  () => [props.port, props.bindings],
  ([port, bindings]) => {
    if (!port) return;
    const value = Object.hasOwn(bindings, port.id) ? bindings[port.id] : port.default;
    const portBase = port.contract?.semantic?.base || 'json';
    const portShape = port.contract?.shape || 'item';
    if (portShape === 'item' && portBase === 'string') draft.value = value ?? '';
    else if (portShape === 'item' && ['number', 'integer'].includes(portBase)) draft.value = value ?? null;
    else if (portShape === 'item' && portBase === 'boolean') draft.value = value ?? false;
    else jsonDraft.value = JSON.stringify(value === undefined ? null : value, null, 2);
    error.value = '';
  },
  { immediate: true, deep: true }
);

watch(
  () => [isFileInput.value, fileTypeIds.value],
  async ([wanted, typeIds]) => {
    if (!wanted || !typeIds.length) {
      fileOptionsError.value = '';
      return;
    }
    fileOptionsLoading.value = true;
    fileOptionsError.value = '';
    const results = await Promise.allSettled(typeIds.map(typeId => (
      instances.listInstances(typeId, { limit: 100 }, { silent: true })
    )));
    if (results.every(result => result.status === 'rejected')) {
      fileOptionsError.value = t('processDesigner.filesCouldNotLoad');
    }
    fileOptionsLoading.value = false;
  },
  { immediate: true }
);

function apply() {
  const port = props.port;
  if (!port) return;
  try {
    const portBase = port.contract?.semantic?.base || 'json';
    const portShape = port.contract?.shape || 'item';
    const value = portShape === 'item' && portBase === 'string'
      ? draft.value ?? ''
      : portShape === 'item' && ['number', 'integer'].includes(portBase)
        ? draft.value
        : portShape === 'item' && portBase === 'boolean'
          ? Boolean(draft.value)
          : JSON.parse(jsonDraft.value || 'null');
    const semantic = port.contract?.semantic || {};
    if (port.required && portBase === 'string' && typeof value === 'string' && !value.trim()) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    if (value === null && semantic.nullable !== true) {
      throw new Error(t('processDesigner.graphInputNullNotAllowed'));
    }
    if (value === undefined && port.required) {
      throw new Error(t('processDesigner.graphInputInvalid'));
    }
    const validItem = item => {
      if (item === null) return portShape === 'item' && semantic.nullable === true;
      if (portBase === 'string') return typeof item === 'string';
      if (portBase === 'number') return typeof item === 'number' && Number.isFinite(item);
      if (portBase === 'integer') return Number.isSafeInteger(item);
      if (portBase === 'boolean') return typeof item === 'boolean';
      if (portBase === 'record') return item && typeof item === 'object' && !Array.isArray(item);
      return true;
    };
    const valid = value === null && semantic.nullable === true ? true : ['list', 'tuple', 'tree'].includes(portShape)
      ? Array.isArray(value) && value.every(validItem)
      : portShape === 'map'
        ? value && typeof value === 'object' && !Array.isArray(value)
        : validItem(value);
    if (!valid) throw new Error(t('processDesigner.graphInputInvalid'));
    error.value = '';
    emit('apply', { portId: port.id, value });
  } catch (cause) {
    error.value = cause.message || String(cause);
  }
}
</script>
