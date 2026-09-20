<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <DataTable v-if="isCsv" :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="min-h-80 flex-1">
      <Column v-for="column in columns" :key="column" :field="column" :header="column">
        <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
      </Column>
    </DataTable>
    <Textarea v-else v-model="content" auto-resize class="min-h-80 w-full flex-1 text-prose" />
    <div class="flex justify-end">
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" :loading="saving" @click="save" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import * as XLSX from 'xlsx';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';

// Persistence contract, host-supplied: `title`, `loadText()` returning
// the raw text, `saveText(text, filename)`. `format` selects the csv
// table surface vs plain text. One editor serves artifact-backed and
// instance-backed hosts.
const props = defineProps({
  persistence: { type: Object, required: true },
  format: { type: String, default: 'text' }
});
const emit = defineEmits(['saved']);
const content = ref('');
const columns = ref([]);
const rows = ref([]);
const saving = ref(false);
const isCsv = computed(() => props.format === 'csv');

onMounted(async () => {
  content.value = await props.persistence.loadText();
  if (!isCsv.value) return;
  const sheet = XLSX.read(content.value, { type: 'string' }).Sheets.Sheet1;
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
  rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
});

async function save() {
  saving.value = true;
  try {
    const extension = isCsv.value ? '.csv' : '.txt';
    const nextContent = isCsv.value
      ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }))
      : content.value;
    emit('saved', await props.persistence.saveText(nextContent, `${props.persistence.title || 'document'}${extension}`));
  } finally { saving.value = false; }
}
</script>
