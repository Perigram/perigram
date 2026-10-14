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
    <div ref="editorHost" class="crepe-host text-prose min-h-0 flex-1 overflow-y-auto" :aria-label="$t('editors.text')" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useDocumentName } from './useDocumentName.js';
import './text-document-editor.css';

// The documents pack's markdown editor: a single-surface live editor
// (milkdown crepe) — the document renders in place while writing, the
// focused block shows its markdown source, and the payload stays
// markdown (the editor's model is markdown; serialization is the
// framework's own, no rich-text proxy). Persistence contract,
// host-supplied: `title`, `loadText()`, `saveText(text, filename)`,
// `extension`, optional `rename(name)`.
const props = defineProps({
  persistence: { type: Object, required: true }
});
const emit = defineEmits(['saved', 'refresh']);

const editorHost = ref(null);
const saving = ref(false);
const dirty = ref(false);
const { displayName, nameDraft, editingName, nameDirty, commitName } = useDocumentName(props.persistence, () => emit('refresh'));

// Quiet document text, not form chrome: the pt styles strip the
// outlined fill and border — the focus ring keeps the edit affordance.
const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

// Browser-only surface (milkdown touches the DOM): the editor is built
// after mount and destroyed with the component.
let crepe = null;
let loaded = false;

onMounted(async () => {
  const initial = (await props.persistence.loadText()) || '';
  const [{ Crepe: CrepeEditor }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/crepe/theme/common/style.css')
  ]);
  if (!editorHost.value) return;
  crepe = new CrepeEditor({ root: editorHost.value, defaultValue: initial });
  crepe.on(api => api.markdownUpdated((_context, markdown) => {
    // The framework reports every doc change; only post-load changes
    // are edits.
    if (loaded) dirty.value = true;
    void markdown;
  }));
  await crepe.create();
  loaded = true;
});

onBeforeUnmount(() => {
  loaded = false;
  crepe?.destroy();
  crepe = null;
});

async function save() {
  if (!crepe) return;
  saving.value = true;
  try {
    // The name carries no extension of its own — strip a trailing one
    // before the persistence extension lands (`notes.md` stays
    // `notes.md`, never `notes.md.md`). The serializer renders an empty
    // trailing block as `<br />`; that is its artifact, not content.
    const stem = String(displayName.value || 'document').replace(/\.(md|txt)$/i, '');
    const markdown = crepe.getMarkdown().replace(/(?:\n?<br\s*\/?>)+\s*$/, '\n');
    emit('saved', await props.persistence.saveText(markdown, `${stem}${props.persistence.extension || '.md'}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
