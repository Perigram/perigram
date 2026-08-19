<template>
  <Textarea
    v-if="mode === 'raw'"
    v-model="rawText"
    rows="3"
    auto-resize
  />
  <div v-else class="flex flex-col gap-2">
    <div v-for="row in rows" :key="row.id" class="flex items-center gap-2">
      <span v-if="mode === 'schema'" class="w-32 shrink-0 truncate text-xs text-muted-color">{{ row.label }}</span>
      <InputText
        v-else
        v-model="row.key"
        class="w-32 shrink-0"
        :placeholder="$t('generatedScreen.objectKey')"
      />
      <Select
        v-if="row.control === 'boolean'"
        v-model="row.value"
        :options="booleanOptions"
        option-label="label"
        option-value="value"
        class="min-w-0 flex-1"
      />
      <Select
        v-else-if="row.control === 'enum'"
        v-model="row.value"
        :options="row.options"
        class="min-w-0 flex-1"
      />
      <InputText
        v-else
        v-model="row.value"
        :type="row.control === 'number' ? 'number' : 'text'"
        class="min-w-0 flex-1"
        :placeholder="mode === 'entries' ? $t('generatedScreen.objectValue') : ''"
      />
      <Button
        v-if="mode === 'entries'"
        icon="pi pi-times"
        text
        rounded
        severity="secondary"
        @click="removeRow(row.id)"
      />
    </div>
    <Button
      v-if="mode === 'entries'"
      icon="pi pi-plus"
      :label="$t('common.add')"
      size="small"
      severity="secondary"
      outlined
      class="self-start"
      @click="addRow"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  modelValue: { type: [Object, String, Array, Number, Boolean], default: null },
  schema: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

let rowSequence = 0;
const nextRowId = () => `entry_${++rowSequence}`;

const mode = ref('entries');
const rows = ref([]);
const rawText = ref('');
let lastSynced = '';

const booleanOptions = computed(() => [
  { label: t('common.yes'), value: true },
  { label: t('common.no'), value: false }
]);
const schemaProperties = computed(() => Object.entries(props.schema?.properties || {}));
const schemaKeys = computed(() => new Set(schemaProperties.value.map(([key]) => key)));

function structuredValue(value) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* falls through to raw */ }
  }
  return null;
}

function modelText() {
  if (props.modelValue === null || props.modelValue === undefined) return '';
  return typeof props.modelValue === 'string' ? props.modelValue : JSON.stringify(props.modelValue, null, 2);
}

function incomingSnapshot() {
  const structured = structuredValue(props.modelValue);
  return structured === null ? modelText() : JSON.stringify(structured);
}

function controlFor(definition = {}) {
  if (Array.isArray(definition.enum) && definition.enum.length) return 'enum';
  if (definition.type === 'boolean') return 'boolean';
  if (['number', 'integer'].includes(definition.type)) return 'number';
  return 'string';
}

function rowValueFor(control, value) {
  if (value === null || value === undefined) return control === 'boolean' ? null : '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rebuild() {
  const structured = structuredValue(props.modelValue);
  if (structured === null) {
    mode.value = 'raw';
    rawText.value = modelText();
  } else if (schemaKeys.value.size && Object.keys(structured).every(key => schemaKeys.value.has(key))) {
    mode.value = 'schema';
    rows.value = schemaProperties.value.map(([key, definition]) => {
      const control = controlFor(definition);
      return {
        id: `schema:${key}`,
        key,
        label: definition.title || key,
        control,
        options: definition.enum || [],
        value: rowValueFor(control, structured[key])
      };
    });
  } else {
    mode.value = 'entries';
    rows.value = Object.entries(structured).map(([key, item]) => ({
      id: nextRowId(),
      key,
      control: 'entry',
      options: [],
      value: typeof item === 'string' ? item : JSON.stringify(item)
    }));
  }
  lastSynced = incomingSnapshot();
}

function parseRowText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { empty: true, value: undefined };
  try {
    return { empty: false, value: JSON.parse(trimmed) };
  } catch {
    return { empty: false, value: text };
  }
}

function buildValue() {
  const result = {};
  if (mode.value === 'schema') {
    for (const row of rows.value) {
      if (row.control === 'boolean') {
        if (row.value !== null && row.value !== undefined) result[row.key] = Boolean(row.value);
      } else if (row.control === 'number') {
        if (row.value === '' || row.value === null || row.value === undefined) continue;
        const numeric = Number(row.value);
        if (Number.isFinite(numeric)) result[row.key] = numeric;
      } else if (row.control === 'enum') {
        if (row.value !== '' && row.value !== null && row.value !== undefined) result[row.key] = row.value;
      } else {
        const parsed = parseRowText(row.value);
        if (!parsed.empty) result[row.key] = parsed.value;
      }
    }
    return result;
  }
  for (const row of rows.value) {
    const key = String(row.key || '').trim();
    if (!key) continue;
    const parsed = parseRowText(row.value);
    result[key] = parsed.empty ? '' : parsed.value;
  }
  return result;
}

function addRow() {
  rows.value = [...rows.value, { id: nextRowId(), key: '', control: 'entry', options: [], value: '' }];
}

function removeRow(id) {
  rows.value = rows.value.filter(row => row.id !== id);
}

watch([() => props.modelValue, () => props.schema], () => {
  if (incomingSnapshot() === lastSynced) return;
  rebuild();
}, { immediate: true, deep: true });

watch(rows, () => {
  if (mode.value === 'raw') return;
  const next = buildValue();
  const snapshot = JSON.stringify(next);
  if (snapshot === lastSynced) return;
  lastSynced = snapshot;
  emit('update:modelValue', next);
}, { deep: true });

watch(rawText, () => {
  if (mode.value !== 'raw' || rawText.value === lastSynced) return;
  lastSynced = rawText.value;
  emit('update:modelValue', rawText.value);
});
</script>
