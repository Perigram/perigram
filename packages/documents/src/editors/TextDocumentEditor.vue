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
      <div class="ml-auto flex items-center gap-1">
        <Button
          v-for="option in viewOptions"
          :key="option.value"
          :icon="option.icon"
          size="small"
          :text="view !== option.value"
          :outlined="view === option.value"
          rounded
          :aria-label="$t(option.labelKey)"
          @click="view = option.value"
        />
      </div>
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" text :loading="saving" :disabled="!dirty" @click="save" />
    </div>
    <div class="flex min-h-0 flex-1 gap-4 pt-3">
      <Textarea
        v-if="view !== 'preview'"
        v-model="source"
        class="text-technical min-h-0 flex-1 resize-none"
        :pt="sourceFieldPt"
        :aria-label="$t('editors.text')"
      />
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized by shared/markdown.js -->
      <div
        v-if="view !== 'source'"
        class="text-prose min-h-0 flex-1 overflow-y-auto"
        v-html="previewHtml"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { renderMarkdown } from '#shared/markdown.js';
import { useDocumentName } from './useDocumentName.js';

// The documents pack's markdown editor: the payload IS the text, so the
// surface edits the source directly and renders it LIVE beside the
// source (split view — what you type is what you read), with source-only
// and preview-only states for narrow panes. Persistence contract,
// host-supplied: `title`, `loadText()`, `saveText(text, filename)`,
// `extension`, optional `rename(name)`.
const props = defineProps({
  persistence: { type: Object, required: true }
});
const emit = defineEmits(['saved', 'refresh']);

const source = ref('');
const saving = ref(false);
const dirty = ref(false);
const view = ref('split');
const previewHtml = computed(() => renderMarkdown(source.value));
const viewOptions = [
  { value: 'split', icon: 'pi pi-window-maximize', labelKey: 'editors.viewSplit' },
  { value: 'source', icon: 'pi pi-pencil', labelKey: 'common.edit' },
  { value: 'preview', icon: 'pi pi-eye', labelKey: 'common.preview' }
];
const { displayName, nameDraft, editingName, nameDirty, commitName } = useDocumentName(props.persistence, () => emit('refresh'));

// Quiet document text, not form chrome: the pt styles strip the
// outlined fill and border — the focus ring keeps the edit affordance.
const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };
const sourceFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent', outline: 'none', boxShadow: 'none' } } };

// Loading is not editing: the guard keeps the initial populate from
// enabling save on a pristine open.
let loading = true;
watch(source, () => { if (!loading) dirty.value = true; });

onMounted(async () => {
  try {
    source.value = await props.persistence.loadText() || '';
  } finally {
    loading = false;
  }
});

async function save() {
  saving.value = true;
  try {
    // The name carries no extension of its own — strip a trailing one
    // before the persistence extension lands (`notes.md` stays
    // `notes.md`, never `notes.md.md`).
    const stem = String(displayName.value || 'document').replace(/\.(md|txt)$/i, '');
    emit('saved', await props.persistence.saveText(source.value, `${stem}${props.persistence.extension || '.md'}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
