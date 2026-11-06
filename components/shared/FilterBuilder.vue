<template>
  <div class="flex min-w-72 max-w-96 flex-col gap-2">
    <div v-if="rows.length > 1" class="flex flex-wrap items-center justify-between gap-2">
      <SelectButton
        :model-value="combinator"
        :options="combinatorOptions"
        option-label="label"
        option-value="value"
        size="small"
        :allow-empty="false"
        :aria-label="$t('uiMapping.matchAll')"
        @update:model-value="value => setCombinator(value)"
      />
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('uiMapping.clearConditions')"
        @click="clearAll"
      />
    </div>

    <div
      v-for="(row, index) in rows"
      :key="index"
      class="flex min-w-0 flex-col gap-1"
    >
      <div class="flex min-w-0 items-center gap-2">
        <Button
          :label="fieldLabelFor(row.field)"
          text
          size="small"
          class="min-w-0 flex-1 justify-start [&_.p-button-label]:truncate"
          :title="fieldLabelFor(row.field)"
          :aria-label="fieldLabelFor(row.field)"
          @click="openFieldPicker({ mode: 'row', index })"
        />
        <SelectButton
          :model-value="rowKey(row)"
          :options="opOptionsFor(row.field)"
          option-label="label"
          option-value="value"
          size="small"
          class="shrink-0"
          :allow-empty="false"
          :aria-label="$t('common.filter')"
          @update:model-value="value => setRowOp(index, value)"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          class="shrink-0"
          severity="secondary"
          :aria-label="$t('common.delete')"
          @click="removeRow(index)"
        />
      </div>
      <div class="min-w-0">
        <InputText
          v-if="fieldKind(row.field) === 'text'"
          :model-value="row.value"
          size="small"
          class="w-full"
          :placeholder="fieldLabelFor(row.field)"
          @update:model-value="value => setRowValue(index, value)"
        />
        <InputNumber
          v-else-if="fieldKind(row.field) === 'number'"
          :model-value="typeof row.value === 'number' ? row.value : null"
          size="small"
          class="w-full"
          :aria-label="fieldLabelFor(row.field)"
          @update:model-value="value => setRowValue(index, typeof value === 'number' ? value : '')"
        />
        <InputText
          v-else-if="fieldKind(row.field) === 'instant'"
          :model-value="row.value"
          type="date"
          size="small"
          class="w-full"
          :aria-label="fieldLabelFor(row.field)"
          @update:model-value="value => setRowValue(index, value || '')"
        />
        <SelectButton
          v-else-if="fieldKind(row.field) === 'boolean'"
          :model-value="row.value"
          :options="booleanOptions"
          option-label="label"
          option-value="value"
          size="small"
          :allow-empty="false"
          :aria-label="fieldLabelFor(row.field)"
          @update:model-value="value => setRowValue(index, value)"
        />
        <div
          v-else
          class="flex min-w-0 flex-wrap items-center gap-1"
        >
          <Button
            v-for="value in valueOptionsFor(row.field)"
            :key="value.value"
            :label="value.label"
            size="small"
            :outlined="!isValueSelected(row, value.value)"
            :severity="isValueSelected(row, value.value) ? undefined : 'secondary'"
            @click="toggleValue(index, value.value)"
          />
        </div>
      </div>
    </div>

    <div v-if="picker" class="flex max-h-56 flex-col gap-0.5 overflow-y-auto pt-1">
      <Button
        v-for="field in fields"
        :key="field.name"
        :label="field.label"
        text
        size="small"
        class="justify-start"
        @click="pickField(field.name)"
      />
    </div>
    <Button
      v-else
      icon="pi pi-plus"
      :label="$t('uiMapping.addCondition')"
      text
      size="small"
      class="self-start"
      :aria-label="$t('uiMapping.addCondition')"
      @click="openFieldPicker({ mode: 'add' })"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import SelectButton from 'primevue/selectbutton';
import { filterFromBuilderRows, builderRowsFromFilter } from '#shared/instance-filters/builder.js';

// The filter builder panel: boolean composition over the canonical
// instance-filter tree, hosted inside a popover its trigger owns. A
// condition is two content-driven zones: a header line where the field
// takes the leftover width and truncates (full label on hover) while the
// segmented operator and remove keep their intrinsic size, and a
// full-width value line. Nothing is a guessed fixed width and no row
// re-wraps mid-content: enum chips wrap inside the value line.
//
// Every control is INLINE by construction — segmented buttons,
// text/number/native-date inputs, enum value chips, and an inline field
// list. This is load-bearing, not stylistic: a popover dismisses on
// document clicks outside its own subtree, so any child overlay appended
// to `body` (Select, MultiSelect, DatePicker) closed the builder on every
// pick; appending those overlays INTO the panel instead fixed closing but
// displaced them far from their trigger (PrimeVue positions overlays
// document-absolute, so a positioned append target double-offsets the
// coordinates). With no child overlays, neither failure mode exists.
//
// One combinator (match all / match any) applies once more than one row
// exists; negated operator twins compose `not`. The builder owns no
// matching logic — every edit composes through #shared/instance-filters
// and the host evaluates with the one matcher.
//
// Fields are supplied by the host: `{ name, label, kind: 'text' | 'enum'
// | 'boolean' | 'number' | 'instant', values? }` — enum fields carry
// their declared values, and traversal names (`relations.<key>.<field>`,
// `lineage.<key>.<field>`, `children.<type>.<field>`) are plain names the
// matcher resolves against the host's pool. Trees the builder did not
// compose (nested groups) decompose to nothing instead of being
// corrupted; incomplete rows live only in local state until complete.
const props = defineProps({
  modelValue: { type: Object, default: null },
  fields: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const picker = ref(null);
const combinator = ref('and');
const rows = ref([]);
let lastPublished = null;

const combinatorOptions = computed(() => [
  { label: t('uiMapping.matchAll'), value: 'and' },
  { label: t('uiMapping.matchAny'), value: 'or' }
]);
const fieldByName = computed(() => new Map(props.fields.map(field => [field.name, field])));
const booleanOptions = computed(() => [
  { label: t('common.yes'), value: true },
  { label: t('common.no'), value: false }
]);

function fieldKind(name) {
  return fieldByName.value.get(name)?.kind || 'text';
}
function fieldLabelFor(name) {
  return fieldByName.value.get(name)?.label || name;
}
function valueOptionsFor(name) {
  return (fieldByName.value.get(name)?.values || []).map(value => ({ label: String(value), value }));
}

// Per-kind operators. Numbers and dates use language-neutral symbols (a
// six-option segmented control does not fit the row in words); text and
// enum use the localized words.
const KIND_OPS = {
  text: ['contains', 'eq', '!eq'],
  enum: ['in', '!in', 'eq', '!eq'],
  boolean: ['eq', '!eq'],
  number: ['gte', 'gt', 'lte', 'lt', 'eq', '!eq'],
  instant: ['gte', 'gt', 'lte', 'lt', 'eq', '!eq']
};
const OP_LABELS = {
  contains: () => t('uiMapping.opContains'),
  eq: () => t('uiMapping.opIs'),
  '!eq': () => t('uiMapping.opIsNot'),
  in: () => t('uiMapping.opAnyOf'),
  '!in': () => t('uiMapping.opNoneOf'),
  gt: () => '>',
  gte: () => '≥',
  lt: () => '<',
  lte: () => '≤'
};
function opOptionsFor(name) {
  return (KIND_OPS[fieldKind(name)] || KIND_OPS.text)
    .map(op => ({ value: op, label: OP_LABELS[op] ? OP_LABELS[op]() : op }));
}
function rowKey(row) {
  return row.negate ? `!${row.op}` : row.op;
}

function defaultOpFor(kind) {
  return kind === 'enum' ? 'in' : kind === 'number' || kind === 'instant' ? 'gte' : 'contains';
}

function syncFromModel() {
  const decomposed = builderRowsFromFilter(props.modelValue);
  combinator.value = decomposed?.combinator || 'and';
  rows.value = decomposed ? decomposed.rows.map(row => ({ ...row })) : [];
}
function publish() {
  // Incomplete rows (empty values) live only in local state until they
  // are complete — the tree never carries them, so the model round trip
  // must not rebuild rows out from under the user mid-edit.
  lastPublished = filterFromBuilderRows(rows.value, combinator.value);
  emit('update:modelValue', lastPublished);
}
function setCombinator(value) {
  combinator.value = value === 'or' ? 'or' : 'and';
  publish();
}
function openFieldPicker(target) {
  picker.value = picker.value && picker.value.mode === target.mode && picker.value.index === target.index
    ? null
    : target;
}
function pickField(name) {
  const target = picker.value;
  const field = fieldByName.value.get(name);
  if (!target || !field) return;
  if (target.mode === 'add') {
    rows.value.push({ field: name, op: defaultOpFor(field.kind), value: field.kind === 'enum' ? [] : '', negate: false });
  } else {
    const row = rows.value[target.index];
    if (row) {
      row.field = name;
      row.op = defaultOpFor(field.kind);
      row.negate = false;
      row.value = field.kind === 'enum' ? [] : '';
    }
  }
  picker.value = null;
  publish();
}
function setRowOp(index, key) {
  const row = rows.value[index];
  if (!row) return;
  row.negate = key.startsWith('!');
  row.op = key.replace('!', '');
  if (row.op === 'in' && !Array.isArray(row.value)) row.value = [];
  if (row.op !== 'in' && Array.isArray(row.value)) row.value = '';
  publish();
}
function setRowValue(index, value) {
  const row = rows.value[index];
  if (!row) return;
  row.value = value;
  publish();
}
function isValueSelected(row, value) {
  return Array.isArray(row?.value) ? row.value.includes(value) : row?.value === value;
}
function toggleValue(index, value) {
  const row = rows.value[index];
  if (!row) return;
  if (row.op === 'in') {
    const current = Array.isArray(row.value) ? row.value : [];
    row.value = current.includes(value)
      ? current.filter(entry => entry !== value)
      : [...current, value];
  } else {
    row.value = row.value === value ? '' : value;
  }
  publish();
}
function removeRow(index) {
  rows.value.splice(index, 1);
  publish();
}
function clearAll() {
  rows.value = [];
  publish();
}
watch(() => props.modelValue, value => {
  if (value === lastPublished) return;
  // A model swap the builder did not publish (a scope change) re-syncs
  // the rows and closes the field picker.
  picker.value = null;
  syncFromModel();
}, { immediate: true });
</script>
