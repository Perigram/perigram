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
  <InputText
    v-else
    :model-value="textValue"
    size="small"
    class="w-full min-w-0"
    :placeholder="placeholder"
    @update:model-value="value => emit('update:modelValue', parseText(value))"
  />
</template>

<script setup>
// The one typed-value editor for node-card inline authoring: literal values
// and unconnected-socket fallbacks share this control, so the base-kind
// dispatch (which control for which base) and the parse/serialize pairs
// (date <-> ISO string, JSON text <-> value) live exactly once. An
// `entityRef` value is the authored reference `{ type, id }`: picked from
// real instances of `typeId` through the shared InstanceSelect contract
// (options load silently; the authored reference resolves for display) —
// ids are never typed by hand.
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
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

function serializeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return props.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
}

function parseText(value) {
  if (props.base === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
</script>
