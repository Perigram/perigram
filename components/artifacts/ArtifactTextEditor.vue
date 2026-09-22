<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2">
    <DataTable v-if="isCsv" :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="min-h-80 flex-1">
      <Column v-for="column in columns" :key="column" :field="column" :header="column">
        <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
      </Column>
    </DataTable>
    <!-- Markdown documents edit through the PrimeVue rich text editor
         (Quill): the payload is markdown by default — the editor content
         converts HTML → markdown on save and markdown → HTML on load.
         The editing surface reads and writes in the app's serif prose
         voice, matching the preview. -->
    <div v-else class="flex min-h-0 flex-1 flex-col text-prose">
      <Editor v-model="html" editor-style="min-height: 12rem" class="flex min-h-0 flex-1 flex-col" :formats="editorFormats" />
    </div>
    <div class="flex justify-end">
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" :loading="saving" @click="save" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import * as XLSX from 'xlsx';
import TurndownService from 'turndown';
import { marked } from 'marked';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Editor from 'primevue/editor';
import InputText from 'primevue/inputtext';
import 'quill/dist/quill.snow.css';

// Persistence contract, host-supplied: `title`, `loadText()` returning
// the raw text, `saveText(text, filename)`. `format` selects the csv
// table surface vs the markdown text document. One editor serves
// artifact-backed and instance-backed hosts.
const props = defineProps({
  persistence: { type: Object, required: true },
  format: { type: String, default: 'text' }
});
const emit = defineEmits(['saved']);
const html = ref('');
const columns = ref([]);
const rows = ref([]);
const saving = ref(false);
const isCsv = computed(() => props.format === 'csv');
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
// Quill's document model covers the markdown subset; the formats list
// keeps the toolbar and the round-trip honest (no colors/aligns that
// markdown cannot carry).
const editorFormats = ['bold', 'italic', 'underline', 'strike', 'code', 'blockquote', 'header', 'list', 'indent', 'link', 'code-block'];

onMounted(async () => {
  const text = await props.persistence.loadText();
  if (isCsv.value) {
    const sheet = XLSX.read(text, { type: 'string' }).Sheets.Sheet1;
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
    rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
    return;
  }
  html.value = text ? marked.parse(text) : '';
});

async function save() {
  saving.value = true;
  try {
    const extension = props.persistence.extension || (isCsv.value ? '.csv' : '.md');
    const nextContent = isCsv.value
      ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }))
      : turndown.turndown(html.value || '');
    emit('saved', await props.persistence.saveText(nextContent, `${props.persistence.title || 'document'}${extension}`));
  } finally { saving.value = false; }
}
</script>
