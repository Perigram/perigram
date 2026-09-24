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
// (date <-> ISO string, JSON text <-> value) live exactly once.
import { computed } from 'vue';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';
import ToggleSwitch from 'primevue/toggleswitch';

const props = defineProps({
  // The value base ('string' | 'number' | 'integer' | 'boolean' | 'json' |
  // 'date' | 'dateTime' | 'status' | 'entityRef' | …). 'entityRef' edits
  // the raw id string here; wrapping it into { type, id } is the parent's
  // context decision (it owns the entity type).
  base: { type: String, default: 'json' },
  modelValue: { type: null, required: false, default: null },
  placeholder: { type: String, default: '' },
  statusOptions: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue']);

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
  if (typeof value === 'object' && value.id != null) return String(value.id);
  return typeof value === 'string' ? value : JSON.stringify(value);
});

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
