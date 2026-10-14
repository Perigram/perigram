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
      <div class="flex items-center gap-1" @mousedown.prevent>
        <Button
          v-for="control in formatControls"
          :key="control.id"
          :icon="control.icon"
          :label="control.label"
          severity="secondary"
          text
          rounded
          size="small"
          class="format-control"
          :class="control.class"
          :aria-label="$t(control.labelKey)"
          @click="runFormat(control)"
        />
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

// The documents pack's markdown editor: the single-surface live editing
// engine (milkdown, through crepe) with EVERY piece of engine chrome
// disabled — the visible chrome is this toolbar's PrimeVue controls and
// the app's theme. Markdown remains the model: the payload round-trips
// through the framework's own serializer, no rich-text proxy.
// Persistence contract, host-supplied: `title`, `loadText()`,
// `saveText(text, filename)`, `extension`, optional `rename(name)`.
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

// The format row speaks markdown's own vocabulary. Marks carry their
// meaning typographically (B is bold); blocks use the icon set. Heading
// and paragraph turns address the focused block; markdown input rules
// (typing `# `, `- `, `> `) keep working beside these.
const formatControls = [
  { id: 'strong', label: 'B', class: 'font-bold', labelKey: 'editors.bold', command: 'toggleStrongCommand' },
  { id: 'emphasis', label: 'I', class: 'italic', labelKey: 'editors.italic', command: 'toggleEmphasisCommand' },
  { id: 'code', label: '</>', class: 'text-technical text-xs', labelKey: 'editors.inlineCode', command: 'toggleInlineCodeCommand' },
  { id: 'h1', label: 'H1', class: 'text-xs', labelKey: 'editors.heading1', command: 'wrapInHeadingCommand', payload: { level: 1 } },
  { id: 'h2', label: 'H2', class: 'text-xs', labelKey: 'editors.heading2', command: 'wrapInHeadingCommand', payload: { level: 2 } },
  { id: 'paragraph', label: '¶', class: 'text-xs', labelKey: 'editors.paragraph', command: 'turnIntoTextCommand' },
  { id: 'bullet', icon: 'pi pi-list', labelKey: 'editors.bulletList', command: 'wrapInBulletListCommand' },
  { id: 'ordered', icon: 'pi pi-list-check', labelKey: 'editors.numberedList', command: 'wrapInOrderedListCommand' },
  { id: 'quote', icon: 'pi pi-comment', labelKey: 'editors.quote', command: 'wrapInBlockquoteCommand' }
];

// The engine commands resolve lazily (browser-only modules), once.
let commands = null;
async function loadCommands() {
  if (commands) return commands;
  const [{ callCommand }, preset] = await Promise.all([
    import('@milkdown/utils'),
    import('@milkdown/preset-commonmark')
  ]);
  commands = { callCommand, preset };
  return commands;
}

async function runFormat(control) {
  if (!crepe) return;
  const { callCommand, preset } = await loadCommands();
  const command = preset[control.command];
  if (!command) return;
  crepe.editor.action(callCommand(command.key, control.payload));
  editorHost.value?.focus();
}

// Browser-only surface (the engine touches the DOM): built after mount,
// destroyed with the component.
let crepe = null;
let loaded = false;

onMounted(async () => {
  const initial = (await props.persistence.loadText()) || '';
  const [{ Crepe: CrepeEditor }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/crepe/theme/common/style.css')
  ]);
  if (!editorHost.value) return;
  crepe = new CrepeEditor({
    root: editorHost.value,
    defaultValue: initial,
    features: {
      [CrepeEditor.Feature.Toolbar]: false,
      [CrepeEditor.Feature.BlockEdit]: false,
      [CrepeEditor.Feature.TopBar]: false,
      [CrepeEditor.Feature.LinkTooltip]: false,
      [CrepeEditor.Feature.Latex]: false,
      [CrepeEditor.Feature.AI]: false
    }
  });
  crepe.on(api => api.markdownUpdated(() => {
    // The framework reports every doc change; only post-load changes
    // are edits.
    if (loaded) dirty.value = true;
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
