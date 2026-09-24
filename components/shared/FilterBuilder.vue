<template>
  <span class="inline-flex">
    <Button
      icon="pi pi-filter"
      :label="activeCount ? String(activeCount) : undefined"
      outlined
      severity="secondary"
      size="small"
      :aria-label="$t('common.filter')"
      @click="open"
    />

    <Popover ref="popover">
      <div class="flex min-w-80 max-w-96 flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
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
            v-if="rows.length"
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
          class="flex flex-wrap items-center gap-2"
        >
          <Select
            :model-value="row.field"
            :options="fieldOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-40"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setField(index, value)"
          />
          <Select
            :model-value="rowKey(row)"
            :options="opOptionsFor(row.field)"
            option-label="label"
            option-value="value"
            size="small"
            class="w-36"
            :aria-label="$t('common.filter')"
            @update:model-value="value => setRowOp(index, value)"
          />
          <InputText
            v-if="fieldKind(row.field) === 'text'"
            :model-value="row.value"
            size="small"
            class="min-w-32 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value)"
          />
          <MultiSelect
            v-else-if="rowOp(row) === 'in'"
            :model-value="Array.isArray(row.value) ? row.value : []"
            :options="valueOptionsFor(row.field)"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-36 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value)"
          />
          <Select
            v-else
            :model-value="row.value"
            :options="valueOptionsFor(row.field)"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-36 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value)"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('common.delete')"
            @click="removeRow(index)"
          />
        </div>

        <Button
          :label="$t('uiMapping.addCondition')"
          icon="pi pi-plus"
          text
          size="small"
          @click="addRow"
        />
      </div>
    </Popover>
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import SelectButton from 'primevue/selectbutton';
import Select from '~/components/shared/InstanceSelect.vue';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import { filterFromBuilderRows, builderRowsFromFilter } from '#shared/instance-filters/builder.js';

// The filter builder: the user-facing surface for boolean composition over
// the canonical instance-filter tree. One combinator (match all / match
// any) over predicate rows; each row picks a field, an operator (including
// the negated twins that compose `not`), and a value. It owns no matching
// logic — every edit composes through #shared/instance-filters and the
// host surface evaluates the result with the one matcher.
//
// Fields are supplied by the host: `{ name, label, kind: 'enum' | 'text',
// values? }` — enum fields carry the values actually present, text fields
// compare by substring. Trees the builder did not compose (nested groups)
// decompose to nothing instead of being corrupted.
const props = defineProps({
  modelValue: { type: Object, default: null },
  fields: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const popover = ref();
const combinator = ref('and');
const rows = ref([]);

const combinatorOptions = computed(() => [
  { label: t('uiMapping.matchAll'), value: 'and' },
  { label: t('uiMapping.matchAny'), value: 'or' }
]);
const fieldOptions = computed(() => props.fields.map(field => ({ label: field.label, value: field.name })));
const fieldByName = computed(() => new Map(props.fields.map(field => [field.name, field])));

function fieldKind(name) {
  return fieldByName.value.get(name)?.kind === 'enum' ? 'enum' : 'text';
}
function fieldLabelFor(name) {
  return fieldByName.value.get(name)?.label || name;
}
function valueOptionsFor(name) {
  return (fieldByName.value.get(name)?.values || []).map(value => ({ label: value, value }));
}

const TEXT_OPS = [
  { op: 'contains', negate: false },
  { op: 'contains', negate: true },
  { op: 'eq', negate: false },
  { op: 'eq', negate: true }
];
const ENUM_OPS = [
  { op: 'in', negate: false },
  { op: 'in', negate: true },
  { op: 'eq', negate: false },
  { op: 'eq', negate: true }
];
function opOptionsFor(name) {
  const labels = {
    'contains': t('uiMapping.opContains'),
    '!contains': t('uiMapping.opNotContains'),
    'eq': t('uiMapping.opIs'),
    '!eq': t('uiMapping.opIsNot'),
    'in': t('uiMapping.opIn'),
    '!in': t('uiMapping.opNotIn')
  };
  return (fieldKind(name) === 'enum' ? ENUM_OPS : TEXT_OPS)
    .map(({ op, negate }) => ({ label: labels[`${negate ? '!' : ''}${op}`], value: `${negate ? '!' : ''}${op}` }));
}
function rowKey(row) {
  return `${row.negate ? '!' : ''}${row.op}`;
}
function rowOp(row) {
  return row?.op;
}

function syncFromModel() {
  const decomposed = builderRowsFromFilter(props.modelValue);
  combinator.value = decomposed?.combinator || 'and';
  rows.value = decomposed ? decomposed.rows.map(row => ({ ...row })) : [];
}
function publish() {
  emit('update:modelValue', filterFromBuilderRows(rows.value, combinator.value));
}
function setCombinator(value) {
  combinator.value = value === 'or' ? 'or' : 'and';
  publish();
}
function setField(index, name) {
  const row = rows.value[index];
  if (!row || !fieldByName.value.has(name)) return;
  row.field = name;
  row.value = fieldKind(name) === 'enum' ? [] : '';
  row.op = fieldKind(name) === 'enum' ? 'in' : 'contains';
  row.negate = false;
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
function removeRow(index) {
  rows.value.splice(index, 1);
  publish();
}
function clearAll() {
  rows.value = [];
  publish();
}
function addRow() {
  const first = props.fields[0];
  if (!first) return;
  rows.value.push({
    field: first.name,
    op: first.kind === 'enum' ? 'in' : 'contains',
    value: first.kind === 'enum' ? [] : '',
    negate: false
  });
}
const activeCount = computed(() => (props.modelValue ? countPredicates(props.modelValue) : 0));
function countPredicates(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.and) return node.and.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.or) return node.or.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.not) return countPredicates(node.not);
  return 1;
}
function open(event) {
  syncFromModel();
  popover.value?.toggle(event);
}
</script>
