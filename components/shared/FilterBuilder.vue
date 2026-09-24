<template>
  <span class="inline-flex">
    <Button
      icon="pi pi-filter"
      text
      rounded
      size="small"
      :severity="conditionCount ? undefined : 'secondary'"
      :badge="conditionCount ? String(conditionCount) : null"
      :aria-label="$t('common.filter')"
      @click="toggle"
    />

    <Popover ref="popover">
      <div class="flex min-w-80 max-w-96 flex-col gap-2">
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
          class="flex min-w-0 items-center gap-2"
        >
          <Select
            :model-value="row.field"
            :options="fieldOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-40 shrink-0"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setField(index, value)"
          />
          <Select
            :model-value="rowKey(row)"
            :options="opOptionsFor(row.field)"
            option-label="label"
            option-value="value"
            size="small"
            class="w-32 shrink-0"
            :aria-label="$t('common.filter')"
            @update:model-value="value => setRowOp(index, value)"
          />
          <InputText
            v-if="fieldKind(row.field) === 'text'"
            :model-value="row.value"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value)"
          />
          <InputNumber
            v-else-if="fieldKind(row.field) === 'number'"
            :model-value="typeof row.value === 'number' ? row.value : null"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, typeof value === 'number' ? value : '')"
          />
          <DatePicker
            v-else-if="fieldKind(row.field) === 'instant'"
            :model-value="toDate(row.value)"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value ? value.toISOString() : '')"
          />
          <Select
            v-else-if="fieldKind(row.field) === 'boolean'"
            :model-value="row.value"
            :options="booleanOptions"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value ?? '')"
          />
          <MultiSelect
            v-else-if="rowOp(row) === 'in'"
            :model-value="Array.isArray(row.value) ? row.value : []"
            :options="valueOptionsFor(row.field)"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
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
            filter
            class="min-w-0 flex-1"
            :placeholder="fieldLabelFor(row.field)"
            :aria-label="fieldLabelFor(row.field)"
            @update:model-value="value => setRowValue(index, value ?? '')"
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
          icon="pi pi-plus"
          text
          rounded
          size="small"
          :aria-label="$t('uiMapping.addCondition')"
          @click="event => addMenu?.toggle(event)"
        />
        <Menu ref="addMenu" :model="addFieldItems" :popup="true" />
      </div>
    </Popover>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import DatePicker from 'primevue/datepicker';
import Popover from 'primevue/popover';
import Menu from 'primevue/menu';
import SelectButton from 'primevue/selectbutton';
import Select from '~/components/shared/InstanceSelect.vue';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import { filterFromBuilderRows, builderRowsFromFilter } from '#shared/instance-filters/builder.js';

// The filter builder: a popover for boolean composition over the canonical
// instance-filter tree, triggered by its own funnel button (badge carries
// the active condition count). Set conditions render as compact
// single-line rows; the "+" button opens the field menu that appends a
// row. One combinator (match all / match any) applies once more than one
// row exists; negated operator twins compose `not`. It owns no matching
// logic — every edit composes through #shared/instance-filters and the
// host surface evaluates with the one matcher.
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
const popover = ref();
const addMenu = ref();
const combinator = ref('and');
const rows = ref([]);

const combinatorOptions = computed(() => [
  { label: t('uiMapping.matchAll'), value: 'and' },
  { label: t('uiMapping.matchAny'), value: 'or' }
]);
const fieldOptions = computed(() => props.fields.map(field => ({ label: field.label, value: field.name })));
const addFieldItems = computed(() => props.fields.map(field => ({
  label: field.label,
  command: () => addRowFor(field.name)
})));
const fieldByName = computed(() => new Map(props.fields.map(field => [field.name, field])));
const booleanOptions = [
  { label: 'true', value: true },
  { label: 'false', value: false }
];
const conditionCount = computed(() => countPredicates(props.modelValue));

function fieldKind(name) {
  return fieldByName.value.get(name)?.kind || 'text';
}
function fieldLabelFor(name) {
  return fieldByName.value.get(name)?.label || name;
}
function valueOptionsFor(name) {
  return (fieldByName.value.get(name)?.values || []).map(value => ({ label: String(value), value }));
}
function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function toggle(event) {
  syncFromModel();
  popover.value?.toggle(event);
}

const KIND_OPS = {
  text: [
    { op: 'contains', negate: false },
    { op: 'contains', negate: true },
    { op: 'eq', negate: false },
    { op: 'eq', negate: true }
  ],
  enum: [
    { op: 'in', negate: false },
    { op: 'in', negate: true },
    { op: 'eq', negate: false },
    { op: 'eq', negate: true }
  ],
  boolean: [
    { op: 'eq', negate: false },
    { op: 'eq', negate: true }
  ],
  number: [
    { op: 'gt', negate: false },
    { op: 'gte', negate: false },
    { op: 'lt', negate: false },
    { op: 'lte', negate: false },
    { op: 'eq', negate: false },
    { op: 'eq', negate: true }
  ],
  instant: [
    { op: 'gt', negate: false },
    { op: 'gte', negate: false },
    { op: 'lt', negate: false },
    { op: 'lte', negate: false },
    { op: 'eq', negate: false },
    { op: 'eq', negate: true }
  ]
};
function opOptionsFor(name) {
  const labels = {
    'contains': t('uiMapping.opContains'),
    '!contains': t('uiMapping.opNotContains'),
    'eq': t('uiMapping.opIs'),
    '!eq': t('uiMapping.opIsNot'),
    'in': t('uiMapping.opIn'),
    '!in': t('uiMapping.opNotIn'),
    'gt': t('uiMapping.opGt'),
    'gte': t('uiMapping.opGte'),
    'lt': t('uiMapping.opLt'),
    'lte': t('uiMapping.opLte')
  };
  return (KIND_OPS[fieldKind(name)] || KIND_OPS.text)
    .map(({ op, negate }) => ({ label: labels[`${negate ? '!' : ''}${op}`], value: `${negate ? '!' : ''}${op}` }));
}
function rowKey(row) {
  return `${row.negate ? '!' : ''}${row.op}`;
}
function rowOp(row) {
  return row?.op;
}

function defaultOpFor(kind) {
  return kind === 'enum' ? 'in' : kind === 'number' || kind === 'instant' ? 'gt' : 'contains';
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
let lastPublished = null;
function setCombinator(value) {
  combinator.value = value === 'or' ? 'or' : 'and';
  publish();
}
function setField(index, name) {
  const row = rows.value[index];
  if (!row || !fieldByName.value.has(name)) return;
  row.field = name;
  const kind = fieldKind(name);
  row.op = defaultOpFor(kind);
  row.negate = false;
  row.value = kind === 'enum' ? [] : '';
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
function addRowFor(name) {
  const field = fieldByName.value.get(name);
  if (!field) return;
  rows.value.push({
    field: name,
    op: defaultOpFor(field.kind),
    value: field.kind === 'enum' ? [] : '',
    negate: false
  });
}
function countPredicates(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.and) return node.and.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.or) return node.or.reduce((sum, child) => sum + countPredicates(child), 0);
  if (node.not) return countPredicates(node.not);
  return 1;
}
watch(() => props.modelValue, value => {
  if (value === lastPublished) return;
  // External swaps (scope changes) refresh local state; the popover
  // re-syncs from the model on open.
  rows.value = [];
  lastPublished = null;
}, { immediate: true });
</script>
