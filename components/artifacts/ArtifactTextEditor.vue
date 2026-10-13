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
        <Button :label="$t('common.save')" icon="pi pi-save" size="small" text class="ml-auto" :loading="saving" :disabled="!dirty" @click="save" />
      </div>
      <DataTable :value="rows" edit-mode="cell" scrollable scroll-height="flex" size="small" class="mt-2 min-h-80 flex-1">
        <Column v-for="column in columns" :key="column" :field="column" :header="column">
          <template #editor="{ data, field }"><InputText v-model="data[field]" size="small" /></template>
        </Column>
      </DataTable>
    </template>
    <!-- Markdown documents edit their source, honestly: the payload IS
         markdown, so the text surface edits it directly in the technical
         mono voice and renders a sanitized preview in the prose voice —
         no rich-text proxy converting HTML↔markdown and losing whatever
         its model cannot carry. The document chrome is one toolbar row
         shared with the csv surface: the name edits in place (enter,
         apply control, or blur — rename rides the persistence seam),
         the preview toggle, and save. -->
    <template v-else>
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
        <Button
          :icon="previewing ? 'pi pi-pencil' : 'pi pi-eye'"
          severity="secondary"
          text
          rounded
          size="small"
          class="ml-auto"
          :aria-label="previewing ? $t('common.edit') : $t('common.preview')"
          @click="previewing = !previewing"
        />
        <Button :label="$t('common.save')" icon="pi pi-save" size="small" text :loading="saving" :disabled="!dirty" @click="save" />
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized below -->
      <div v-if="previewing" class="text-prose min-h-0 flex-1 overflow-y-auto pt-3" v-html="previewHtml" />
      <Textarea
        v-else
        v-model="markdown"
        class="text-technical min-h-0 flex-1 resize-none"
        :pt="sourceFieldPt"
        :aria-label="$t('editors.text')"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DOMPurify from 'dompurify';
import * as XLSX from 'xlsx';
import { marked } from 'marked';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';

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
const markdown = ref('');
const previewing = ref(false);
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
const previewHtml = computed(() => {
  if (!markdown.value || typeof window === 'undefined') return '';
  return DOMPurify.sanitize(marked.parse(markdown.value));
});

// The name field is quiet document text, not a form box: the pt styles
// strip the outlined fill and border — the focus ring keeps the edit
// affordance. The source field strips the same chrome: it is the
// document, not a form control.
const nameFieldPt = {
  root: { style: { background: 'transparent', borderColor: 'transparent' } }
};
const sourceFieldPt = {
  root: { style: { background: 'transparent', borderColor: 'transparent', outline: 'none', boxShadow: 'none' } }
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

onMounted(async () => {
  const text = await props.persistence.loadText();
  if (isCsv.value) {
    const sheet = XLSX.read(text, { type: 'string' }).Sheets.Sheet1;
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    columns.value = (values.shift() || []).map((value, index) => String(value || `${index + 1}`));
    rows.value = values.map(row => Object.fromEntries(columns.value.map((column, index) => [column, row[index] ?? ''])));
    return;
  }
  markdown.value = text || '';
});

watch(displayName, value => {
  if (!editingName.value) nameDraft.value = value;
}, { immediate: true });
watch([markdown, rows], () => { dirty.value = true; }, { deep: true });

async function save() {
  saving.value = true;
  try {
    const extension = props.persistence.extension || (isCsv.value ? '.csv' : '.md');
    emit('saved', await props.persistence.saveText(markdown.value, `${displayName.value || 'document'}${extension}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
