<template>
  <div
    ref="editorHost"
    class="crepe-host text-prose min-h-0 flex-1 overflow-y-auto"
  />
  <Popover ref="linkPopover">
    <div class="flex items-center gap-2 p-2">
      <InputText
        v-model="linkUrl"
        size="small"
        class="w-72"
        type="url"
        :placeholder="t('editors.linkAddress')"
        :aria-label="t('editors.linkAddress')"
        @keydown.enter.prevent="applyLink"
      />
      <Button
        icon="pi pi-check"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-label="t('common.apply')"
        @click="applyLink"
      />
    </div>
  </Popover>
</template>

<script setup>
// The one inline editor engine mount (SPEC §26): every markdown
// authoring surface — the custom page, the instance overlay's text
// blocks — mounts the crepe engine through this component, with the
// shared block vocabulary and slash panel (the documents plugin's
// surfaces/lib) and the code/theme assets consumed by relative import.
// Engine pieces load through dynamic imports so SSR and the browser
// bundle stay clean.
import { onBeforeUnmount, onMounted, ref} from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { renderMarkdown, parseViewRef } from '#shared/markdown.js';
import { useViewsStore } from '~/stores/views';

const props = defineProps({
  // The markdown the engine opens with; external edits after mount are
  // the host's own channel (the editor is the live source).
  defaultValue: { type: String, default: '' },
  // A user-space page invites its first block; the engine placeholder
  // renders the hint.
  placeholder: { type: String, default: '' }
});

const emit = defineEmits(['update', 'pick-view', 'ready']);

const { t } = useI18n();
const viewsStore = useViewsStore();
const editorHost = ref(null);
const linkPopover = ref(null);
const linkUrl = ref('');
const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] });

let crepe = null;
let slashMenu = null;
let editorDiagramClick = null;
let loaded = false;
let applyBlockAt = () => null;

function focus() {
  editorHost.value?.querySelector('.ProseMirror')?.focus();
}

function openLinkEditor() {
  const anchor = editorHost.value?.querySelector('.ProseMirror') || editorHost.value;
  if (!anchor) return;
  linkPopover.value?.show({ currentTarget: anchor }, anchor);
}

async function applyLink() {
  const href = linkUrl.value.trim();
  if (!href || !crepe) return;
  linkPopover.value?.hide();
  const [{ callCommand }, { toggleLinkCommand }] = await Promise.all([
    import('@milkdown/utils'),
    import('@milkdown/preset-commonmark')
  ]);
  crepe.editor.action(callCommand(toggleLinkCommand.key, { href }));
  focus();
}

function runSlashPick(id, view) {
  const kind = applyBlockAt(id, view);
  if (kind !== 'link' && kind !== 'view') focus();
}

// The host resolves the picked saved view; the fence it inserts carries
// the view ref (`{ id, name }`, the deleted-view name).
function openViewPicker(insert) {
  emit('pick-view', insert);
}

onMounted(async () => {
  if (!editorHost.value) return;
  const [{ Crepe: CrepeEditor }, { $prose }, { languages: codeLanguages }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/utils'),
    import('@codemirror/language-data')
  ]);
  const [{ createSourceMarkersPlugin }, { createSlashMenu }, vocabulary, { codeMirrorTheme }] = await Promise.all([
    import('../../workers/documents/surfaces/lib/source-markers-plugin.js'),
    import('../../workers/documents/surfaces/lib/slash-menu.js'),
    import('../../workers/documents/surfaces/lib/block-vocabulary.mjs'),
    import('../../workers/documents/surfaces/lib/cm-theme.js')
  ]);
  await Promise.all([
    import('../../workers/documents/assets/vendor/crepe-theme.css'),
    import('../../workers/documents/assets/text-editor.css')
  ]);
  applyBlockAt = (id, view) => vocabulary.applyBlock({
    id,
    state: blockState.value,
    editor: crepe,
    view,
    t,
    openLinkEditor,
    openViewPicker
  });

  crepe = new CrepeEditor({
    root: editorHost.value,
    defaultValue: props.defaultValue,
    features: {
      [CrepeEditor.Feature.Toolbar]: false,
      [CrepeEditor.Feature.BlockEdit]: false,
      [CrepeEditor.Feature.TopBar]: false,
      [CrepeEditor.Feature.LinkTooltip]: false,
      [CrepeEditor.Feature.Latex]: false,
      [CrepeEditor.Feature.AI]: false,
      [CrepeEditor.Feature.Cursor]: false,
      [CrepeEditor.Feature.Placeholder]: props.placeholder ? { text: props.placeholder } : false
    },
    featureConfigs: {
      [CrepeEditor.Feature.CodeMirror]: {
        languages: codeLanguages,
        theme: codeMirrorTheme,
        previewOnlyByDefault: true,
        renderPreview: (language, content) => {
          const lang = String(language || '').toLowerCase();
          if (lang === 'mermaid') {
            const host = document.createElement('div');
            host.innerHTML = renderMarkdown(`\`\`\`mermaid\n${String(content || '')}\n\`\`\``);
            return host.querySelector('.mermaid-diagram') || null;
          }
          if (lang === 'view') {
            const ref = parseViewRef(content);
            if (!ref) return null;
            const host = document.createElement('div');
            host.className = 'ck-view-embed';
            host.textContent = viewsStore.viewById(ref.id)?.name || ref.name || t('editors.view');
            return host;
          }
          return null;
        }
      }
    }
  });
  crepe.editor.use($prose(() => createSourceMarkersPlugin({
    onSelectionState: next => { blockState.value = next; }
  })));
  slashMenu = createSlashMenu({
    items: vocabulary.BLOCK_VOCABULARY.map(({ id, labelKey, glyph, glyphText, match }) => ({ id, label: t(labelKey), glyph, glyphText, match })),
    onPick: runSlashPick
  });
  crepe.editor.use($prose(() => slashMenu.plugin));
  crepe.on(api => api.markdownUpdated(() => {
    if (loaded) emit('update', crepe.getMarkdown());
  }));
  await crepe.create();
  loaded = true;
  emit('ready');
  editorDiagramClick = event => {
    const block = event.target?.closest?.('.milkdown-code-block');
    if (!block?.querySelector('.preview .mermaid-diagram')) return;
    if (!block.querySelector('.codemirror-host.hidden')) return;
    block.querySelector('.preview-toggle-button')?.click();
  };
  editorHost.value.addEventListener('click', editorDiagramClick);
});

onBeforeUnmount(() => {
  loaded = false;
  if (editorDiagramClick && editorHost.value) {
    editorHost.value.removeEventListener('click', editorDiagramClick);
    editorDiagramClick = null;
  }
  slashMenu?.destroy();
  slashMenu = null;
  crepe?.destroy();
  crepe = null;
});

function getMarkdown() {
  return crepe ? crepe.getMarkdown() : props.defaultValue;
}

defineExpose({ focus, getMarkdown });
</script>
