<template>
  <div class="flex h-full min-h-0 flex-1 flex-col p-4">
    <div class="flex min-w-0 flex-wrap items-center gap-2 border-b border-chrome-border py-1">
      <div class="flex min-w-40 max-w-72 flex-1 items-center gap-1">
        <InputText
          v-model="nameDraft"
          size="small"
          class="w-full min-w-0"
          :pt="nameFieldPt"
          :placeholder="$t('common.unnamed')"
          :aria-label="$t('common.rename')"
          @focus="editingName = true"
          @keydown.enter.stop.prevent="commitName"
          @blur="commitName"
        />
        <Button v-if="nameDirty" icon="pi pi-check" severity="secondary" text rounded size="small" :aria-label="$t('common.apply')" @click="commitName" />
      </div>
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" text class="ml-auto" :loading="saving" :disabled="!dirty" @click="save" />
    </div>
    <DataTable
      :value="rows"
      edit-mode="cell"
      scrollable
      scroll-height="flex"
      size="small"
      class="mt-2 min-h-80 flex-1"
      @cell-edit-complete="applyCellEdit"
    >
      <Column v-for="column in columns" :key="column" :field="column" :header="column">
        <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import { useDocumentName } from './useDocumentName.js';

// The documents pack's csv editor: rows edit in a cell table and
// serialize back to CSV text on save. Persistence contract matches the
// text editor (`title`, `loadText()`, `saveText(text, filename)`,
// `extension`, optional `rename(name)`).
const props = defineProps({
  persistence: { type: Object, required: true }
});
const emit = defineEmits(['saved', 'refresh']);

const columns = ref([]);
const rows = ref([]);
const saving = ref(false);
const dirty = ref(false);
const { displayName, nameDraft, editingName, nameDirty, commitName } = useDocumentName(props.persistence, () => emit('refresh'));

const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

let loading = true;
watch(rows, () => { if (!loading) dirty.value = true; }, { deep: true });

onMounted(async () => {
  try {
    const sheet = XLSX.read(await props.persistence.loadText(), { type: 'string' }).Sheets.Sheet1;
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
    rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
  } finally {
    loading = false;
  }
});

// PrimeVue's cell editor binds a working copy and delivers the edit
// through `cell-edit-complete` ({ data = the table's row object,
// newValue, field }): applying it here is what makes the edit land in
// `rows` — unhandled, the table re-renders the original value.
function applyCellEdit({ data, field, newValue }) {
  if (!data) return;
  data[field] = newValue;
}

async function save() {
  saving.value = true;
  try {
    const stem = String(displayName.value || 'document').replace(/\.csv$/i, '');
    const text = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }));
    emit('saved', await props.persistence.saveText(text, `${stem}${props.persistence.extension || '.csv'}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
