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
          :severity="isActive(control) ? 'primary' : 'secondary'"
          text
          rounded
          size="small"
          :class="control.class"
          :disabled="sourceView"
          :aria-label="$t(control.labelKey)"
          :aria-pressed="isActive(control)"
          @click="runFormat(control)"
        />
        <Button
          icon="pi pi-link"
          :severity="linkActive ? 'primary' : 'secondary'"
          text
          rounded
          size="small"
          :disabled="sourceView"
          :aria-label="$t('editors.link')"
          :aria-pressed="linkActive"
          @click="toggleLinkPopover"
        />
      </div>
      <Popover ref="linkPopover">
        <div class="flex items-center gap-2 p-2">
          <InputText
            v-model="linkUrl"
            size="small"
            class="w-72"
            type="url"
            :placeholder="$t('editors.linkAddress')"
            :aria-label="$t('editors.linkAddress')"
            @keydown.enter.prevent="applyLink"
          />
          <Button icon="pi pi-check" severity="secondary" text rounded size="small" :aria-label="$t('common.apply')" @click="applyLink" />
        </div>
      </Popover>
      <Button
        label="MD"
        :severity="sourceView ? 'primary' : 'secondary'"
        text
        rounded
        size="small"
        data-testid="source-toggle"
        :aria-label="$t(sourceView ? 'editors.renderView' : 'editors.sourceView')"
        :aria-pressed="sourceView"
        @click="toggleSource"
      />
      <Button
        v-if="remoteChanged && dirty"
        icon="pi pi-refresh"
        severity="secondary"
        text
        rounded
        size="small"
        class="ml-auto"
        :aria-label="$t('common.refresh')"
        @click="reloadFromRemote"
      />
      <Button :label="$t('common.save')" icon="pi pi-save" size="small" text :class="remoteChanged && dirty ? '' : 'ml-auto'" :loading="saving" :disabled="!dirty" @click="save" />
    </div>
    <div v-show="!sourceView" ref="editorHost" class="crepe-host text-prose min-h-0 flex-1 overflow-y-auto" :aria-label="$t('editors.text')" />
    <div v-show="sourceView" ref="sourceHost" class="source-host text-prose min-h-0 flex-1 overflow-y-auto" :aria-label="$t('editors.sourceView')" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import { useDocumentName } from './useDocumentName.js';
import { useRemoteDocumentSync } from './useRemoteDocumentSync.js';
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
const { t } = useI18n();

const editorHost = ref(null);
const sourceHost = ref(null);
const sourceView = ref(false);
const saving = ref(false);
const dirty = ref(false);
const { displayName, nameDraft, editingName, nameDirty, commitName } = useDocumentName(props.persistence, () => emit('refresh'));

// Remote saves/renames reconcile this surface: clean reloads the text,
// dirty raises the refresh affordance.
const { remoteChanged, reloadFromRemote, reloading } = useRemoteDocumentSync(props.persistence, {
  dirty,
  reload: async () => {
    if (!crepe) return;
    const { replaceAll } = await loadCommands();
    crepe.editor.action(replaceAll((await props.persistence.loadText()) || ''));
  }
});

// Quiet document text, not form chrome: the pt styles strip the
// outlined fill and border — the focus ring keeps the edit affordance.
const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

// The format row speaks markdown's own vocabulary. Marks carry their
// meaning typographically (B is bold, I is italic) — every other label
// is plain content on an unmodified PrimeVue small button, carrying no
// typography of its own. Every control toggles: an active block control
// unsets it (heading and list turns return the block to body text,
// quote lifts the block out), and the pressed state shows what the
// focused block carries. Markdown input rules (typing `# `, `- `, `> `)
// keep working beside these. Heading commands take the LEVEL as the
// raw command payload.
const formatControls = [
  { id: 'strong', label: 'B', class: 'font-bold', labelKey: 'editors.bold', command: 'toggleStrongCommand' },
  { id: 'emphasis', label: 'I', class: 'italic', labelKey: 'editors.italic', command: 'toggleEmphasisCommand' },
  { id: 'code', label: '</>', labelKey: 'editors.inlineCode', command: 'toggleInlineCodeCommand' },
  { id: 'h1', label: 'H1', labelKey: 'editors.heading1', command: 'wrapInHeadingCommand', payload: 1, off: 'turnIntoTextCommand' },
  { id: 'h2', label: 'H2', labelKey: 'editors.heading2', command: 'wrapInHeadingCommand', payload: 2, off: 'turnIntoTextCommand' },
  { id: 'h3', label: 'H3', labelKey: 'editors.heading3', command: 'wrapInHeadingCommand', payload: 3, off: 'turnIntoTextCommand' },
  { id: 'h4', label: 'H4', labelKey: 'editors.heading4', command: 'wrapInHeadingCommand', payload: 4, off: 'turnIntoTextCommand' },
  { id: 'h5', label: 'H5', labelKey: 'editors.heading5', command: 'wrapInHeadingCommand', payload: 5, off: 'turnIntoTextCommand' },
  { id: 'h6', label: 'H6', labelKey: 'editors.heading6', command: 'wrapInHeadingCommand', payload: 6, off: 'turnIntoTextCommand' },
  { id: 'codeblock', icon: 'pi pi-code', labelKey: 'editors.codeBlock', command: 'createCodeBlockCommand', off: 'turnIntoTextCommand' },
  { id: 'paragraph', label: '¶', labelKey: 'editors.paragraph', command: 'turnIntoTextCommand' },
  { id: 'bullet', icon: 'pi pi-list', labelKey: 'editors.bulletList', command: 'wrapInBulletListCommand', off: 'liftListItemCommand' },
  { id: 'ordered', icon: 'pi pi-list-check', labelKey: 'editors.numberedList', command: 'wrapInOrderedListCommand', off: 'liftListItemCommand' },
  { id: 'quote', icon: 'pi pi-comment', labelKey: 'editors.quote', command: 'wrapInBlockquoteCommand', off: 'lift' }
];

// The focused block as the toolbar sees it, reported by the
// source-markers plugin on every selection or document change.
const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, marks: [] });
const linkActive = computed(() => blockState.value.marks.includes('link'));

function isActive(control) {
  const state = blockState.value;
  switch (control.id) {
    case 'strong': return state.marks.includes('strong');
    case 'emphasis': return state.marks.includes('emphasis');
    case 'code': return state.marks.includes('code_inline');
    case 'h1': return state.block === 'heading' && state.headingLevel === 1;
    case 'h2': return state.block === 'heading' && state.headingLevel === 2;
    case 'h3': return state.block === 'heading' && state.headingLevel === 3;
    case 'h4': return state.block === 'heading' && state.headingLevel === 4;
    case 'h5': return state.block === 'heading' && state.headingLevel === 5;
    case 'h6': return state.block === 'heading' && state.headingLevel === 6;
    case 'codeblock': return state.block === 'code_block';
    case 'paragraph': return state.block === 'paragraph' && !state.bullet && !state.ordered && !state.quote;
    case 'bullet': return state.bullet;
    case 'ordered': return state.ordered;
    case 'quote': return state.quote;
    default: return false;
  }
}

// The engine commands resolve lazily (browser-only modules), once.
let commands = null;
async function loadCommands() {
  if (commands) return commands;
  const [{ callCommand, replaceAll }, preset, { editorViewCtx }, { lift }] = await Promise.all([
    import('@milkdown/utils'),
    import('@milkdown/preset-commonmark'),
    import('@milkdown/core'),
    import('@milkdown/prose/commands')
  ]);
  commands = { callCommand, replaceAll, preset, editorViewCtx, lift };
  return commands;
}

// The toolbar row suppresses mousedown so pointer clicks never steal
// focus from the editor; keyboard activation returns it here.
function focusRenderedEditor() {
  editorHost.value?.querySelector('.ProseMirror')?.focus();
}

async function runFormat(control, { force = false } = {}) {
  if (!crepe) return;
  const active = isActive(control);
  if (active && control.off === 'lift') {
    // Blockquotes have no preset unwrap command: lift the focused block
    // out of the quote through the raw prose command.
    const { editorViewCtx, lift } = await loadCommands();
    crepe.editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      lift(view.state, view.dispatch, view);
    });
    focusRenderedEditor();
    return;
  }
  const { callCommand, preset } = await loadCommands();
  const command = preset[active && !force && control.off ? control.off : control.command];
  if (!command) return;
  crepe.editor.action(callCommand(command.key, control.payload));
  focusRenderedEditor();
}

// The link control: the address popover applies the href to the
// selection (toggleMark semantics — re-applying the href a marked
// selection already carries lifts the link).
const linkPopover = ref(null);
const linkUrl = ref('');

function toggleLinkPopover(event) {
  linkPopover.value?.toggle(event);
}

async function applyLink() {
  const href = linkUrl.value.trim();
  if (!href || !crepe) return;
  const { callCommand, preset } = await loadCommands();
  crepe.editor.action(callCommand(preset.toggleLinkCommand.key, { href }));
  linkPopover.value?.hide();
  focusRenderedEditor();
}

// A three-by-three table node over the gfm schema crepe already mounts.
function insertTable(view) {
  const { table, table_row, table_header, table_cell, paragraph } = view.state.schema.nodes;
  const row = (cellType, count) => table_row.createChecked(null, Array.from({ length: count }, () => cellType.createChecked(null, paragraph.create())));
  const node = table.createChecked(null, [row(table_header, 3), row(table_cell, 3), row(table_cell, 3)]);
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}

// The slash vocabulary: every pick rides the same command path the
// toolbar uses; `match` carries the lowercase prefixes a query may
// start with to find the item.
function slashItems() {
  const headings = [1, 2, 3, 4, 5, 6].map(level => ({
    id: `h${level}`,
    label: t(`editors.heading${level}`),
    match: [`h${level}`, `heading${level}`, 'heading']
  }));
  return [
    { id: 'paragraph', label: t('editors.paragraph'), match: ['text', 'paragraph', 'p'] },
    ...headings,
    { id: 'bullet', label: t('editors.bulletList'), match: ['bullet', 'list', 'ul'] },
    { id: 'ordered', label: t('editors.numberedList'), match: ['ordered', 'numbered', 'ol'] },
    { id: 'quote', label: t('editors.quote'), match: ['quote', 'blockquote'] },
    { id: 'codeblock', label: t('editors.codeBlock'), match: ['code', 'codeblock'] },
    { id: 'divider', label: t('editors.divider'), match: ['divider', 'hr', 'line'] },
    { id: 'table', label: t('editors.table'), match: ['table'] }
  ];
}

async function runSlashPick(id, view) {
  const control = formatControls.find(entry => entry.id === id);
  if (control) return runFormat(control, { force: true });
  if (!crepe) return;
  const { callCommand, preset } = await loadCommands();
  if (id === 'divider') crepe.editor.action(callCommand(preset.insertHrCommand.key));
  if (id === 'table' && view) insertTable(view);
  focusRenderedEditor();
}

// Browser-only surface (the engine touches the DOM): built after mount,
// destroyed with the component.
let crepe = null;
let slashMenu = null;
let loaded = false;

onMounted(async () => {
  const initial = (await props.persistence.loadText()) || '';
  const [{ Crepe: CrepeEditor }, { $prose }, { createSourceMarkersPlugin }, { codeMirrorTheme }, { createSlashMenu }, { languages: codeLanguages }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/utils'),
    import('./source-markers-plugin.js'),
    import('./cm-theme.js'),
    import('./slash-menu.js'),
    import('@codemirror/language-data'),
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
      [CrepeEditor.Feature.AI]: false,
      // The virtual cursor overlays an animated caret beside the
      // native one, and the placeholder coaches.
      [CrepeEditor.Feature.Cursor]: false,
      [CrepeEditor.Feature.Placeholder]: false
    },
    // Fenced code blocks: the full language registry for syntax
    // highlighting and the app-token CodeMirror theme. Feature configs
    // are the supported channel — crepe applies them in its
    // constructor, so a later config-slice update never reaches the
    // live block.
    featureConfigs: {
      [CrepeEditor.Feature.CodeMirror]: { languages: codeLanguages, theme: codeMirrorTheme }
    }
  });
  // The selection seam: the source-markers plugin renders the focused
  // block's markdown prefix as a view-only widget and reports the
  // selection state to the toolbar.
  crepe.editor.use($prose(() => createSourceMarkersPlugin({
    onSelectionState: next => { blockState.value = next; }
  })));
  // The slash command menu over the same command path as the toolbar.
  slashMenu = createSlashMenu({ items: slashItems(), onPick: runSlashPick });
  crepe.editor.use($prose(() => slashMenu.plugin));
  crepe.on(api => api.markdownUpdated(() => {
    // The framework reports every doc change; only post-load changes
    // are edits — a programmatic remote reload is reconciliation, not
    // an edit, and must not arm the save button.
    if (loaded && !reloading.value) dirty.value = true;
  }));
  await crepe.create();
  loaded = true;
});

onBeforeUnmount(() => {
  loaded = false;
  slashMenu?.destroy();
  slashMenu = null;
  sourceEditor?.destroy();
  sourceEditor = null;
  crepe?.destroy();
  crepe = null;
});

// The source view: the markdown itself, symbols and all. Toggling in
// serializes the rendered document; toggling out parses the edited
// source back through the markdown parser. The visible surface is
// always what saves.
let sourceEditor = null;
async function ensureSourceEditor(text) {
  if (sourceEditor) {
    sourceEditor.dispatch({ changes: { from: 0, to: sourceEditor.state.doc.length, insert: text } });
    return;
  }
  const [{ EditorView, keymap }, { EditorState }, { basicSetup }, { markdown: markdownLanguage }, { defaultKeymap, indentWithTab }, { codeMirrorTheme }] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('codemirror'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/commands'),
    import('./cm-theme.js')
  ]);
  if (!sourceHost.value) return;
  sourceEditor = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        markdownLanguage(),
        keymap.of(defaultKeymap.concat(indentWithTab)),
        EditorView.lineWrapping,
        codeMirrorTheme
      ]
    }),
    parent: sourceHost.value
  });
}

// The serializer renders an empty trailing block as `<br />`; that is
// its artifact, never content — every markdown export strips the tail.
const stripSerializerTail = text => String(text || '').replace(/(?:\n?<br\s*\/?>)+\s*$/, '\n');

async function toggleSource() {
  if (!crepe) return;
  if (!sourceView.value) {
    await ensureSourceEditor(stripSerializerTail(crepe.getMarkdown()));
    sourceView.value = true;
    await nextTick();
    // The clicked toggle button keeps DOM focus through the click —
    // hand it to the source editor past the render flip.
    requestAnimationFrame(() => sourceEditor?.focus());
    return;
  }
  const text = sourceEditor?.state.doc.toString() || '';
  const { replaceAll } = await loadCommands();
  sourceView.value = false;
  await nextTick();
  crepe.editor.action(replaceAll(stripSerializerTail(text) || ''));
  if (loaded) dirty.value = true;
  requestAnimationFrame(focusRenderedEditor);
}

async function save() {
  if (!crepe) return;
  saving.value = true;
  try {
    // The visible surface is what saves: the markdown text in source
    // view, the serialized document in the rendered view.
    const markdown = stripSerializerTail(sourceView.value
      ? sourceEditor?.state.doc.toString()
      : crepe.getMarkdown());
    // The name carries no extension of its own — strip a trailing one
    // before the persistence extension lands (`notes.md` stays
    // `notes.md`, never `notes.md.md`).
    const stem = String(displayName.value || 'document').replace(/\.(md|txt)$/i, '');
    emit('saved', await props.persistence.saveText(markdown, `${stem}${props.persistence.extension || '.md'}`));
    dirty.value = false;
  } finally { saving.value = false; }
}
</script>
