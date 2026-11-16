<template>
  <ToggleSwitch
    v-if="base === 'boolean'"
    :model-value="Boolean(modelValue)"
    @update:model-value="value => emit('update:modelValue', value)"
  />
  <InputNumber
    v-else-if="['number', 'integer'].includes(base)"
    :model-value="numericValue"
    size="small"
    class="w-full min-w-0"
    :placeholder="placeholder"
    @update:model-value="value => emit('update:modelValue', value)"
  />
  <Select
    v-else-if="base === 'status'"
    :model-value="modelValue"
    :options="statusOptions || []"
    option-label="label"
    option-value="value"
    editable
    size="small"
    class="w-full min-w-0"
    :placeholder="placeholder"
    @update:model-value="value => emit('update:modelValue', value)"
  />
  <DatePicker
    v-else-if="['date', 'dateTime'].includes(base)"
    :model-value="dateValue"
    :show-time="base === 'dateTime'"
    hour-format="24"
    size="small"
    class="w-full min-w-0"
    @update:model-value="value => emit('update:modelValue', serializeDate(value))"
  />
  <Select
    v-else-if="base === 'entityRef'"
    :model-value="refDisplayValue"
    :options="refOptions"
    option-label="label"
    option-value="value"
    :placeholder="refPlaceholder"
    filter
    size="small"
    class="w-full min-w-0"
    @update:model-value="value => emit('update:modelValue', value ? { type: typeId, id: value } : null)"
  />
  <div v-else-if="base === 'json'" class="flex min-w-0 items-center gap-2">
    <span class="min-w-0 flex-1 truncate text-supporting text-muted">{{ jsonSummary }}</span>
    <Button icon="pi pi-code" text size="small" :aria-label="t('processDesigner.editStructuredValue')" @click="openJsonDialog" />
    <Dialog v-model:visible="jsonDialogVisible" modal :header="t('processDesigner.editStructuredValue')">
      <div class="flex min-w-0 flex-col gap-2">
        <Textarea v-model="jsonDraft" rows="12" auto-resize class="w-full" />
        <Message v-if="jsonError" severity="error">{{ jsonError }}</Message>
      </div>
      <template #footer>
        <Button :label="t('common.cancel')" severity="secondary" text @click="jsonDialogVisible = false" />
        <Button :label="t('common.save')" @click="saveJson" />
      </template>
    </Dialog>
  </div>
  <InputText
    v-else
    :model-value="textValue"
    size="small"
    class="w-full min-w-0"
    :placeholder="placeholder"
    @update:model-value="value => emit('update:modelValue', value)"
  />
</template>

<script setup>
// Shared typed-value authoring for inspector literals and socket defaults.
// Base-kind dispatch and serialization stay in one place, including the
// structured JSON editor. An
// `entityRef` value is the authored reference `{ type, id }`: picked from
// real instances of `typeId` through the shared InstanceSelect contract
// (options load silently; the authored reference resolves for display) —
// ids are never typed by hand.
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import Select from '~/components/shared/InstanceSelect.vue';
import ToggleSwitch from 'primevue/toggleswitch';
import { instancePickerOptions } from '~/utils/instance-select.js';
import { useInstancesStore } from '~/stores/instances';
import { useRegistryStore } from '~/stores/registry';

const props = defineProps({
  // The value base ('string' | 'number' | 'integer' | 'boolean' | 'json' |
  // 'date' | 'dateTime' | 'status' | 'entityRef' | …).
  base: { type: String, default: 'json' },
  modelValue: { type: null, required: false, default: null },
  placeholder: { type: String, default: '' },
  statusOptions: { type: Array, default: () => [] },
  // The exact entity type behind an entityRef socket/literal — required
  // for instance picking; without it the picker stays option-less rather
  // than falling back to id typing.
  typeId: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const instances = useInstancesStore();
const registry = useRegistryStore();

const numericValue = computed(() => {
  if (props.modelValue == null || props.modelValue === '') return null;
  return Number(props.modelValue);
});

const dateValue = computed(() => {
  if (!props.modelValue) return null;
  const date = new Date(props.modelValue);
  return Number.isNaN(date.getTime()) ? null : date;
});

const textValue = computed(() => {
  const value = props.modelValue;
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
});

// -- entityRef instance picking -------------------------------------------

const jsonDialogVisible = ref(false);
const jsonDraft = ref('');
const jsonError = ref('');
const jsonSummary = computed(() => {
  try { return JSON.stringify(props.modelValue ?? null); } catch { return String(props.modelValue ?? ''); }
});

const refOptions = ref([]);
const refResolveFailed = ref(false);

const refId = computed(() => (
  props.modelValue && typeof props.modelValue === 'object' ? String(props.modelValue.id ?? '') : ''
));
const refTypeKey = computed(() => (props.typeId ? instances.canonicalTypeKey(props.typeId) : ''));

// The authored ref shows once its instance is loaded (or known unreadable);
// until then the picker carries the placeholder instead of a bare id.
const refDisplayValue = computed(() => {
  if (!refId.value) return null;
  const known = refTypeKey.value && instances.instanceFor(refTypeKey.value, refId.value);
  return known || refResolveFailed.value ? refId.value : null;
});
const refPlaceholder = computed(() => t('processDesigner.pickInstance'));

async function loadRefOptions() {
  if (props.base !== 'entityRef' || !refTypeKey.value) return;
  refResolveFailed.value = false;
  const typeKey = refTypeKey.value;
  try {
    await instances.listInstances(typeKey, {}, { silent: true });
  } catch {
    // No readable list for the type: the picker stays option-less; the
    // authored ref still resolves below for the value display.
  }
  if (refId.value && !instances.instanceFor(typeKey, refId.value)) {
    const resolved = await instances.resolveReadableReference(typeKey, refId.value, { silent: true });
    refResolveFailed.value = !resolved;
  }
  refOptions.value = refOptionsFor(typeKey);
}

function refOptionsFor(typeKey) {
  return instancePickerOptions(instances.dtoRegistry, [typeKey], {
    typeRecordFor: key => registry.typeRecord(key),
    unnamedLabel: t('common.unnamed')
  });
}

onMounted(loadRefOptions);
watch(() => [props.base, props.typeId], loadRefOptions);

function openJsonDialog() {
  jsonDraft.value = JSON.stringify(props.modelValue ?? null, null, 2);
  jsonError.value = '';
  jsonDialogVisible.value = true;
}
function saveJson() {
  try {
    emit('update:modelValue', JSON.parse(jsonDraft.value));
    jsonDialogVisible.value = false;
  } catch (error) {
    jsonError.value = error.message || t('processDesigner.invalidStructuredValue');
  }
}

function serializeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return props.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
}

</script>
