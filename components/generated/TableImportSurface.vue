<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3" data-table-import-surface>
    <div class="flex flex-wrap items-center gap-2">
      <Select
        v-model="sheetName"
        :options="sheetNames"
        option-label="label"
        option-value="value"
        size="small"
        :aria-label="$t('tableImport.sheet')"
        :disabled="!sheetNames.length"
      />
      <Select
        v-model="headerRowIndex"
        :options="headerRowOptions"
        option-label="label"
        option-value="value"
        size="small"
        :aria-label="$t('tableImport.headerRow')"
        :disabled="!headerRowOptions.length"
      />
      <span class="text-supporting text-muted">{{ rowCountLabel }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Select
        v-model="targetTypeId"
        :options="targetOptions"
        option-label="label"
        option-value="value"
        size="small"
        :aria-label="$t('tableImport.targetType')"
        :placeholder="$t('tableImport.targetType')"
      />
      <Select
        v-if="parentTypeOptions.length"
        v-model="parentTypeId"
        :options="parentTypeOptions"
        option-label="label"
        option-value="value"
        size="small"
        :aria-label="$t('tableImport.parentType')"
        :placeholder="$t('tableImport.parentType')"
      />
      <Select
        v-if="parentTypeId"
        v-model="parentId"
        :options="[]"
        :type-id="parentTypeId"
        size="small"
        class="min-w-48"
        :aria-label="$t('tableImport.parentInstance')"
      />
    </div>

    <Message v-if="parseError" severity="error">{{ parseError }}</Message>
    <Message v-else-if="!sheetRows.length && !loading" severity="secondary">{{ $t('tableImport.emptySheet') }}</Message>

    <div v-if="sheetRows.length && targetTypeId" class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2">
        <div v-for="(column, index) in columns" :key="index" class="flex min-w-40 flex-col gap-1">
          <span class="truncate text-label">{{ column.label }}</span>
          <Select
            :model-value="columnRoles[index] || 'ignore'"
            :options="roleOptions"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="value => setColumnRole(index, value)"
          />
          <InputText
            v-if="columnRoles[index]?.startsWith('param:')"
            :model-value="columnRoles[index].slice('param:'.length)"
            size="small"
            :aria-label="$t('tableImport.parameterName')"
            @update:model-value="value => setColumnRole(index, `param:${value}`)"
          />
        </div>
      </div>

      <Message v-if="rowErrors.length" severity="warn">
        <div class="flex flex-col gap-1">
          <span v-for="rowError in rowErrors" :key="rowError">{{ rowError }}</span>
        </div>
      </Message>

      <div class="flex items-center gap-2">
        <Button
          :label="$t('tableImport.create')"
          icon="pi pi-check"
          size="small"
          :loading="running"
          :disabled="!preparedRows.length || rowErrors.length > 0"
          @click="runImport"
        />
        <span v-if="preparedRows.length" class="text-supporting text-muted">{{ planLabel }}</span>
      </div>
    </div>

    <Message v-if="result" :severity="result.failed ? 'warn' : 'success'">{{ result.message }}</Message>

    <div v-if="sheetRows.length" class="flex min-h-0 flex-col gap-1">
      <span class="text-supporting text-muted">{{ $t('tableImport.preview') }}</span>
      <div class="flex flex-col gap-0.5">
        <div v-for="(row, index) in previewRows" :key="index" class="flex flex-wrap gap-3 rounded-ui bg-subtle px-2 py-1">
          <span
            v-for="column in row"
            :key="column.label"
            class="text-supporting"
          >{{ column.label }}: {{ column.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// The table-import surface: a workbook (or csv) instance's authoring act
// is becoming typed instances. The surface parses the payload client-side
// (the same SheetJS read the workbook preview uses), maps columns to the
// target type's declared vocabulary, and constructs through the batch
// transport (`POST /api/instances/:type/batch`), which owns validation,
// access, quantity expansion, parent lineage, and provenance. Pack types
// with a bespoke construction mode ride it too: cassette-design rows bake
// from a template column plus parameter columns.
import { computed, onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/InstanceSelect.vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instancePayloadFileUrl } from '~/components/generated/file-preview-contract.js';

const props = defineProps({
  entity: { type: Object, default: null },
  typeId: { type: String, default: '' }
});

const { t } = useI18n();
const toast = useToast();
const { types: typeView } = useFileTypeView();

const EXCLUDED_TARGET_TYPES = new Set(['organization', 'user', 'artifact', 'process_definition', 'entity_revision', 'cassette']);
const loading = ref(true);
const parseError = ref('');
const workbook = ref(null);
const sheetName = ref('');
const headerRowIndex = ref(0);
const targetTypeId = ref('');
const parentTypeId = ref('');
const parentId = ref(null);
const columnRoles = ref({});
const running = ref(false);
const result = ref(null);
const templateOptions = ref([]);

const sheetNames = computed(() => (workbook.value?.SheetNames || []).map(name => ({ label: name, value: name })));
const headerRowOptions = computed(() => (sheetRows.value.length ? sheetRows.value.slice(0, 10).map((_, index) => ({
  label: t('tableImport.headerRowN', { n: index + 1 }),
  value: index
})) : []));

function parseSheet(name) {
  const sheet = workbook.value?.Sheets?.[name];
  if (!sheet) return [];
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return values.filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
}

const sheetRows = computed(() => (sheetName.value ? parseSheet(sheetName.value) : []));
const headerRow = computed(() => sheetRows.value[headerRowIndex.value] || []);
const dataRows = computed(() => sheetRows.value.slice(headerRowIndex.value + 1));
const columns = computed(() => headerRow.value.map((label, index) => ({
  label: String(label ?? '').trim() || `${t('tableImport.column')} ${index + 1}`,
  index
})));

const targetOptions = computed(() => (typeView.value || [])
  .filter(entry => !EXCLUDED_TARGET_TYPES.has(entry.id) && entry.id !== props.typeId && !entry.derived)
  .map(entry => ({ label: entry.label || entry.id, value: entry.id })));

const isBake = computed(() => targetTypeId.value === 'cassette-design');

const roleOptions = computed(() => {
  const roles = [
    { label: t('tableImport.ignore'), value: 'ignore' },
    { label: t('tableImport.nameColumn'), value: 'name' },
    { label: t('tableImport.quantityColumn'), value: 'quantity' }
  ];
  if (isBake.value) {
    roles.push({ label: t('tableImport.templateColumn'), value: 'template' });
    roles.push({ label: t('tableImport.parameterColumn'), value: 'param' });
  } else {
    const declaration = (typeView.value || []).find(entry => entry.id === targetTypeId.value);
    for (const [fieldId, field] of Object.entries(declaration?.fields || {})) {
      if (fieldId === 'name') continue;
      roles.push({ label: `${t('tableImport.fieldColumn')} · ${field.label || fieldId}`, value: `field:${fieldId}` });
    }
  }
  return roles;
});

const parentTypeOptions = computed(() => (typeView.value || [])
  .filter(entry => Object.values(entry?.edges?.children || {}).some(edge => (edge?.types || []).includes(targetTypeId.value)))
  .map(entry => ({ label: entry.label || entry.id, value: entry.id })));

function setColumnRole(index, value) {
  // Choosing "parameter" seeds the parameter name from the column header;
  // the inline input then edits it.
  columnRoles.value = { ...columnRoles.value, [index]: value === 'param' ? `param:${columns.value[index]?.label || ''}` : value };
}

function roleOf(index) {
  return columnRoles.value[index] || 'ignore';
}

function cellAt(row, index) {
  const value = row[index];
  return value === undefined || value === null ? '' : String(value).trim();
}

const templateByLabel = computed(() => {
  const map = new Map();
  for (const option of templateOptions.value) {
    map.set(String(option.label || '').toLowerCase(), String(option.value));
  }
  return map;
});

const preparedRows = computed(() => {
  if (!targetTypeId.value || !dataRows.value.length) return [];
  const rows = [];
  for (const row of dataRows.value) {
    const data = {};
    const parameters = {};
    let name = '';
    let quantity = 1;
    let template = '';
    for (const column of columns.value) {
      const role = roleOf(column.index);
      const value = cellAt(row, column.index);
      if (role === 'name') name = value;
      else if (role === 'quantity') quantity = Math.max(Number(value) || 0, 0);
      else if (role === 'template') template = value;
      else if (role.startsWith('param:') && role.length > 'param:'.length) parameters[role.slice('param:'.length)] = value;
      else if (role.startsWith('field:')) data[role.slice('field:'.length)] = value;
    }
    if (isBake.value) {
      data.template = templateByLabel.value.get(String(template).toLowerCase()) || '';
      data.parameters = parameters;
    }
    rows.push({ name, data, quantity });
  }
  return rows;
});

const rowErrors = computed(() => {
  const errors = [];
  if (!isBake.value) return errors;
  preparedRows.value.forEach((row, index) => {
    if (!row.data.template) {
      errors.push(t('tableImport.unmatchedTemplate', { row: index + 2 + headerRowIndex.value, value: row.name }));
    }
    if (!Object.keys(row.data.parameters || {}).length) {
      errors.push(t('tableImport.noParameters', { row: index + 2 + headerRowIndex.value }));
    }
  });
  return errors.slice(0, 10);
});

const previewRows = computed(() => dataRows.value.slice(0, 5).map(row => columns.value
  .filter(column => roleOf(column.index) !== 'ignore')
  .map(column => ({ label: column.label, value: cellAt(row, column.index) }))
  .slice(0, 8)));

const rowCountLabel = computed(() => t('tableImport.rowCount', { n: dataRows.value.length }));
const planLabel = computed(() => {
  const total = preparedRows.value.reduce((sum, row) => sum + Math.max(Number(row.quantity) || 1, 1), 0);
  return t('tableImport.plan', { rows: preparedRows.value.length, total });
});

async function loadPayload() {
  const payloadUrl = instancePayloadFileUrl(props.entity?.attachments?.primary);
  if (!payloadUrl) {
    parseError.value = t('tableImport.noPayload');
    return;
  }
  try {
    const response = await fetch(payloadUrl);
    if (!response.ok) throw new Error(String(response.status));
    const buffer = await response.arrayBuffer();
    if (props.typeId === 'csv-table') {
      const text = new TextDecoder().decode(buffer);
      // SheetJS sniffs the delimiter itself.
      workbook.value = XLSX.read(text, { type: 'string' });
    } else {
      workbook.value = XLSX.read(buffer, { type: 'array' });
    }
    sheetName.value = workbook.value.SheetNames?.[0] || '';
    headerRowIndex.value = 0;
  } catch {
    parseError.value = t('tableImport.parseFailed');
  } finally {
    loading.value = false;
  }
}

async function loadTemplateOptions() {
  if (!isBake.value) {
    templateOptions.value = [];
    return;
  }
  try {
    const rows = await $fetch('/api/instances/cassette', { query: { limit: 500 } });
    templateOptions.value = (Array.isArray(rows) ? rows : []).map(row => ({
      label: row.identity?.name || row.name || String(row._id),
      value: String(row._id)
    }));
  } catch {
    templateOptions.value = [];
  }
}

async function runImport() {
  running.value = true;
  result.value = null;
  try {
    const body = {
      mode: isBake.value ? 'bake' : 'genericCreate',
      rows: preparedRows.value,
      ...(parentTypeId.value && parentId.value ? { parent: { typeId: parentTypeId.value, id: parentId.value } } : {}),
      source: { typeId: props.typeId, id: String(props.entity?._id || '') },
      mapping: Object.fromEntries(Object.entries(columnRoles.value).map(([index, role]) => [columns.value[index]?.label || index, role]))
    };
    const response = await $fetch(`/api/instances/${encodeURIComponent(targetTypeId.value)}/batch`, {
      method: 'POST',
      body
    });
    result.value = { failed: false, message: t('tableImport.created', { n: response.count }) };
    toast.add({ severity: 'success', summary: t('tableImport.created', { n: response.count }), life: 4000 });
  } catch (error) {
    result.value = { failed: true, message: error?.data?.statusMessage || error?.message || t('tableImport.failed') };
    toast.add({ severity: 'error', summary: result.value.message, life: 8000 });
  } finally {
    running.value = false;
  }
}

onMounted(() => {
  loadPayload();
});

// Template options load once the bake target is chosen (the template
// column resolves cassette records by identifier).
watch(targetTypeId, () => {
  columnRoles.value = {};
  loadTemplateOptions();
});
watch(sheetName, () => { headerRowIndex.value = 0; columnRoles.value = {}; });
</script>
