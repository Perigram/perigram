<template>
  <div class="flex h-full min-h-0 flex-1 flex-col gap-2 p-4">
    <ActionToolbar :title="displayName" :level="2">
      <template #actions>
        <Button icon="pi pi-pencil" severity="secondary" text rounded size="small" :aria-label="$t('common.rename')" @click="openRename" />
        <Button :label="$t('common.save')" icon="pi pi-save" size="small" :loading="saving" :disabled="!dirty" @click="save" />
      </template>
    </ActionToolbar>
    <Popover ref="renameMenu">
      <div class="flex min-w-72 flex-col gap-2" @mousedown.stop @click.stop>
        <InputText
          v-model="renameDraft"
          :placeholder="$t('common.rename')"
          class="w-full"
          :aria-label="$t('common.rename')"
          @keydown.enter.stop.prevent="applyRename"
        />
        <Button icon="pi pi-check" :label="$t('common.save')" size="small" :disabled="!renameDraft.trim()" @click="applyRename" />
      </div>
    </Popover>
    <DataTable v-if="isCsv" :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="min-h-80 flex-1">
      <Column v-for="column in columns" :key="column" :field="column" :header="column">
        <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
      </Column>
    </DataTable>
    <!-- Markdown documents edit through the PrimeVue rich text editor
         (Quill): the payload is markdown by default — the editor content
         converts HTML → markdown on save and markdown → HTML on load.
         The editing surface reads and writes in the app's serif document
         voice (the `editor` typography role, one step above prose) and
         carries its own pane padding — it is a document surface, not a
         flush canvas editor. -->
    <div v-else class="text-editor flex min-h-0 flex-1 flex-col">
      <Editor
        v-model="html"
        :formats="editorFormats"
        :pt="editorPt"
        editor-style="flex: 1 1 0; min-height: 12rem"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import * as XLSX from 'xlsx';
import TurndownService from 'turndown';
import { marked } from 'marked';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Editor from 'primevue/editor';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import 'quill/dist/quill.snow.css';

// Persistence contract, host-supplied: `title`, `loadText()` returning
// the raw text, `saveText(text, filename)`, and an optional
// `rename(name)`. `format` selects the csv table surface vs the markdown
// text document. One editor serves artifact-backed and instance-backed
// hosts.
const props = defineProps({
  persistence: { type: Object, required: true },
  format: { type: String, default: 'text' }
});
const emit = defineEmits(['saved', 'refresh']);
const html = ref('');
const columns = ref([]);
const rows = ref([]);
const saving = ref(false);
const dirty = ref(false);
const isCsv = computed(() => props.format === 'csv');
const localTitle = ref('');
const displayName = computed(() => localTitle.value || props.persistence.title || '');
const renameMenu = ref(null);
const renameDraft = ref('');

function openRename() {
  renameDraft.value = displayName.value;
  renameMenu.value?.show?.();
}

async function applyRename() {
  const name = renameDraft.value.trim();
  renameMenu.value?.hide?.();
  if (!name || name === displayName.value || typeof props.persistence.rename !== 'function') return;
  try {
    await props.persistence.rename(name);
    localTitle.value = name;
    emit('refresh');
  } catch (error) {
    console.error('Failed to rename document:', error);
  }
}
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
// Quill's document model covers the markdown subset; the formats list
// keeps the toolbar and the round-trip honest (no colors/aligns that
// markdown cannot carry).
const editorFormats = ['bold', 'italic', 'underline', 'strike', 'code', 'blockquote', 'header', 'list', 'indent', 'link', 'code-block'];
// Quill's bundled themes hardcode a Helvetica 13px document voice on the
// editor container and toolbar. The app's document voice lives on the
// host (the `editor` typography role) and is carried into the editor
// internals through inline pt styles — they sit above every theme class
// in the cascade without scoped CSS, and the root flex layout is applied
// the same way because PrimeVue injects `.p-editor { display: block }`
// after Tailwind. The root grows into its host (the workspace page host
// is flush for this editor, so the editor owns the shell) and the content
// scrolls inside it — long documents never push the page.
const editorPt = {
  root: { style: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: '0', height: '100%' } },
  toolbar: { style: { fontFamily: 'var(--ck-font-ui)' } },
  content: { style: { flex: '1 1 0', minHeight: '0', overflowY: 'auto', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' } }
};

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

watch([html, rows], () => { dirty.value = true; }, { deep: true });

async function save() {
  saving.value = true;
  try {
    const extension = props.persistence.extension || (isCsv.value ? '.csv' : '.md');
    const nextContent = isCsv.value
      ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.value, { header: columns.value }))
      : turndown.turndown(html.value || '');
    emit('saved', await props.persistence.saveText(nextContent, `${displayName.value || 'document'}${extension}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
