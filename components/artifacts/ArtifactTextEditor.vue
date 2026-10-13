<template>
  <div class="flex h-full min-h-0 flex-1 flex-col p-4">
    <template v-if="isCsv">
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
        <Button :label="$t('common.save')" icon="pi pi-save" size="small" class="ml-auto" :loading="saving" :disabled="!dirty" @click="save" />
      </div>
      <DataTable :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="mt-2 min-h-80 flex-1">
        <Column v-for="column in columns" :key="column" :field="column" :header="column">
          <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
        </Column>
      </DataTable>
    </template>
    <!-- Markdown documents edit through the PrimeVue rich text editor
         (Quill): the payload is markdown by default — the editor content
         converts HTML → markdown on save and markdown → HTML on load.
         The document chrome is one toolbar: the name edits in place
         (committed through enter, the apply control beside the field, or
         blur — rename rides the persistence seam), save sits beside it,
         and the format controls follow in the editor's own toolbar slot
         — not a header row plus a second control strip. The csv surface
         shares the same name/save row.
         The editing surface reads and writes in the app's serif document
         voice (the `editor` typography role) and carries the pane
         padding — it is a document surface, not a flush canvas
         editor. -->
    <div v-else class="text-editor flex h-full min-h-0 flex-col">
      <Editor v-model="html" :formats="editorFormats" :pt="editorPt">
        <template #toolbar>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
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
              <Button v-if="nameDirty" icon="pi pi-check" severity="secondary" text rounded size="small" :pt="toolbarButtonPt" :aria-label="$t('common.apply')" @click="commitName" />
            </div>
            <span class="ql-formats flex items-center">
              <select class="ql-header">
                <option value="1">Heading</option>
                <option value="2">Subheading</option>
                <option value="0">Normal</option>
              </select>
              <button class="ql-bold" type="button" />
              <button class="ql-italic" type="button" />
              <button class="ql-underline" type="button" />
              <button class="ql-strike" type="button" />
              <button class="ql-code" type="button" />
              <button class="ql-blockquote" type="button" />
              <button class="ql-list" value="ordered" type="button" />
              <button class="ql-list" value="bullet" type="button" />
              <button class="ql-indent" value="-1" type="button" />
              <button class="ql-indent" value="+1" type="button" />
              <button class="ql-link" type="button" />
              <button class="ql-code-block" type="button" />
            </span>
            <Button :label="$t('common.save')" icon="pi pi-save" size="small" text class="ml-auto" :pt="toolbarButtonPt" :loading="saving" :disabled="!dirty" @click="save" />
          </div>
        </template>
      </Editor>
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
const nameDraft = ref('');
const editingName = ref(false);
// The apply control rides the name field while its draft differs from
// the applied name — the pending-rename state is visible, not silent.
const nameDirty = computed(() => Boolean(nameDraft.value.trim()) && nameDraft.value.trim() !== displayName.value);

// The name field is quiet document text, not a form box: the outlined
// InputText carries the form-field fill (a white box on the canvas once
// everything around it went transparent), so the pt styles strip the
// background and border — the focus ring keeps the edit affordance and
// the apply control marks the pending rename.
const nameFieldPt = {
  root: { style: { background: 'transparent', borderColor: 'transparent' } }
};

// The toolbar name field commits on enter, the apply control, or blur:
// the draft becomes the document name (so the save filename follows
// immediately) and the rename rides the persistence seam when the host
// provides it.
async function commitName() {
  editingName.value = false;
  const name = nameDraft.value.trim();
  if (!name || name === displayName.value) {
    nameDraft.value = displayName.value;
    return;
  }
  localTitle.value = name;
  try {
    if (typeof props.persistence.rename === 'function') {
      await props.persistence.rename(name);
      emit('refresh');
    }
  } catch (error) {
    localTitle.value = props.persistence.title || '';
    nameDraft.value = displayName.value;
    console.error('Failed to rename document:', error);
  }
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
// Quill's document model covers the markdown subset; the authored toolbar
// carries exactly these controls (nothing markdown cannot round-trip).
const editorFormats = ['bold', 'italic', 'underline', 'strike', 'code', 'blockquote', 'header', 'list', 'indent', 'link', 'code-block'];
// Quill never loads its own stylesheet here: the PrimeVue editor theme
// embeds the complete snow base with token-driven overrides inside the
// `primevue` cascade layer, and importing `quill/dist/quill.snow.css`
// again stacks an unlayered hardcoded copy (#ccc borders, #444 icons)
// on top of that layer — the layered tokens can never win (the
// white-borders defect). The editor rides the zero canvas: surfaces are
// transparent through the editor tokens in assets/tokens/index.js (no
// form-field fill on the toolbar or the editable — the pane Panel
// hairline is the box), and these pt inline styles carry only layout
// and the document voice — the toolbar keeps the UI font under one
// chrome hairline, the content grows into the host and scrolls inside
// it. Child internals the pt surface cannot reach (editable voice,
// blockquote, code, link tooltip) are re-homed in the main.css quill
// block.
const editorPt = {
  root: { style: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: '0', border: 'none' } },
  toolbar: { style: { fontFamily: 'var(--ck-font-ui)', padding: '0.375rem 0', borderWidth: '0 0 1px', borderStyle: 'solid', borderColor: 'var(--ck-chrome-border)' } },
  content: { style: { flex: '1 1 0', minHeight: '0', overflowY: 'auto', paddingTop: '0.5rem', border: 'none', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' } }
};
// Snow's embedded stylesheet styles EVERY button inside its toolbar
// (28×24, background none, inline-block) and its selector outranks
// `.p-button` inside the same theme layer — app buttons placed in the
// toolbar slot render as invisible 28×24 shells. The pt styles re-assert
// the control box above the layer; save/apply ride the text recipe so
// the stripped fill is the intended look (their snow hover color is
// re-homed in the main.css quill block).
const toolbarButtonPt = {
  root: { style: { width: 'auto', height: 'auto', display: 'inline-flex', padding: '0.25rem 0.5rem' } }
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

watch(displayName, value => {
  if (!editingName.value) nameDraft.value = value;
}, { immediate: true });
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
