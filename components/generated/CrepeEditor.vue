<template>
  <div
    ref="editorHost"
    v-bind="$attrs"
    class="crepe-host text-prose min-h-0 flex-1 overflow-y-auto"
  />
  <Popover ref="addressPopover">
    <div class="flex items-center gap-2 p-2">
      <InputText
        v-model="linkUrl"
        size="small"
        class="w-72"
        type="url"
        :placeholder="t('editors.linkAddress')"
        :aria-label="t('editors.linkAddress')"
        @keydown.enter.prevent="applyAddress"
      />
      <Button
        icon="pi pi-check"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-label="t('common.apply')"
        @click="applyAddress"
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
import { renderMarkdown, parseViewRef, stripSerializerTail } from '#shared/markdown.js';
import { useViewsStore } from '~/stores/views';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  // The markdown the engine opens with; external edits after mount are
  // the host's own channel (the editor is the live source).
  defaultValue: { type: String, default: '' },
  // A user-space page invites its first block; the engine placeholder
  // renders the hint.
  placeholder: { type: String, default: '' },
  // The block kind a freshly inserted document block opens as.
  initialBlock: { type: String, default: '' },
  // The click point the caret lands on when an in-place block opens.
  initialPoint: { type: Object, default: null }
});

const emit = defineEmits(['update', 'pick-view', 'ready']);

const { t } = useI18n();
const viewsStore = useViewsStore();
const editorHost = ref(null);
const addressPopover = ref(null);
const linkUrl = ref('');
const addressKind = ref('link');
const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] });

let crepe = null;
let slashMenu = null;
let editorDiagramClick = null;
let loaded = false;
let applyBlockAt = () => null;
let editorViewCtx = null;
let TextSelection = null;

function markdownValue() {
  return stripSerializerTail(crepe ? crepe.getMarkdown() : props.defaultValue);
}

function focus(point = null) {
  const prose = editorHost.value?.querySelector('.ProseMirror');
  if (!prose) return;
  prose.focus();
  if (!point || !crepe || !editorViewCtx || !TextSelection) return;
  crepe.editor.action(ctx => {
    const view = ctx.get(editorViewCtx);
    const hit = view.posAtCoords({ left: point.x, top: point.y });
    const at = hit ? hit.pos : view.state.doc.content.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
  });
}

function openAddressEditor(kind) {
  const anchor = editorHost.value?.querySelector('.ProseMirror') || editorHost.value;
  if (!anchor) return;
  addressKind.value = kind;
  linkUrl.value = '';
  addressPopover.value?.show({ currentTarget: anchor }, anchor);
}

function openLinkEditor() {
  openAddressEditor('link');
}

function openImageEditor() {
  openAddressEditor('image');
}

async function applyAddress() {
  const href = linkUrl.value.trim();
  if (!href || !crepe) return;
  addressPopover.value?.hide();
  const [{ callCommand }, { toggleLinkCommand, insertImageCommand }] = await Promise.all([
    import('@milkdown/utils'),
    import('@milkdown/preset-commonmark')
  ]);
  const image = addressKind.value === 'image';
  crepe.editor.action(callCommand(
    (image ? insertImageCommand : toggleLinkCommand).key,
    image ? { src: href } : { href }
  ));
  focus();
}

function runSlashPick(id, view) {
  const kind = applyBlockAt(id, view);
  if (kind !== 'link' && kind !== 'image' && kind !== 'view') focus();
}

// The host resolves the picked saved view; the fence it inserts carries
// the view ref (`{ id, name }`, the deleted-view name).
function openViewPicker(insert) {
  emit('pick-view', insert);
}

onMounted(async () => {
  if (!editorHost.value) return;
  const [{ Crepe: CrepeEditor }, { $prose }, { languages: codeLanguages }, { editorViewCtx: viewCtx }, { TextSelection: selectionType }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/utils'),
    import('@codemirror/language-data'),
    import('@milkdown/core'),
    import('@milkdown/prose/state')
  ]);
  editorViewCtx = viewCtx;
  TextSelection = selectionType;
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
    openImageEditor,
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
    if (loaded) emit('update', markdownValue());
  }));
  await crepe.create();
  loaded = true;
  if (props.initialBlock && props.initialBlock !== 'paragraph') {
    let proseView = null;
    crepe.editor.action(ctx => { proseView = ctx.get(editorViewCtx); });
    applyBlockAt(props.initialBlock, proseView);
    emit('update', markdownValue());
  }
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
  return markdownValue();
}

defineExpose({ focus, getMarkdown });
</script>
