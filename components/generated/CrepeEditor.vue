<template>
  <div
    ref="editorHost"
    v-bind="$attrs"
    :class="scroll ? 'crepe-host text-prose min-h-0 flex-1 overflow-y-auto' : 'crepe-host text-prose min-h-0'"
  />
  <span ref="caretAnchor" class="pointer-events-none fixed h-0 w-0" aria-hidden="true" />
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
  <InstanceMentionPicker
    ref="mentionPicker"
    @select="applyInstancePick"
    @hide="focus"
  />
  <ImageInsertDialog
    :visible="imageDialogOpen"
    @close="imageDialogOpen = false"
    @insert="applyImage"
  />
  <FileInsertDialog
    :visible="fileDialogOpen"
    @close="fileDialogOpen = false"
    @insert="applyFile"
  />
</template>

<script setup>
// The one inline editor engine mount (SPEC §26): every markdown
// authoring surface — the custom page, the instance overlay's text
// blocks — mounts the crepe engine through this component, with the
// shared block vocabulary and slash panel (the documents plugin's
// surfaces/lib) and the code/theme assets consumed by relative import.
// Engine pieces load through dynamic imports so SSR and the browser
// bundle stay clean.
import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { renderMarkdown, stripSerializerTail } from '#shared/markdown.js';
import InstanceMentionPicker from './InstanceMentionPicker.vue';
import ImageInsertDialog from './ImageInsertDialog.vue';
import FileInsertDialog from './FileInsertDialog.vue';
import { createInstanceRefPlugins, insertInstanceRef } from './instance-ref-node.js';
import { createFileRefPlugins, insertFileRef } from './file-ref-node.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';

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
  initialPoint: { type: Object, default: null },
  // Enter splits the block at the caret; the host starts the next
  // document block (the Notion block break).
  splitOnEnter: { type: Boolean, default: false },
  // Enter emits `enter`; the host commits this line as a document block.
  commitOnEnter: { type: Boolean, default: false },
  // The live-source markers are page-editor signage; in-place document
  // blocks render their content without marker glyphs.
  showSourceMarkers: { type: Boolean, default: false },
  // Backspace in an empty document block removes the block.
  deleteOnEmptyBackspace: { type: Boolean, default: false },
  // The engine owns the scroll column; embedded document hosts provide
  // the page scroll and mount the engine flush.
  scroll: { type: Boolean, default: true },
  // The block's collaborative document session: `{ doc, awareness, owner,
  // markSeeded }` from composables/usePageCollab.
  collab: { type: Object, default: null }
});

const emit = defineEmits(['update', 'ready', 'enter', 'split', 'merge-backward', 'merge-forward', 'delete-empty', 'caret-boundary', 'request-view', 'request-reference', 'request-graph-output', 'request-file-reference']);

const { t } = useI18n();
const instance = getCurrentInstance();
const appContext = instance?.appContext;
const editorHost = ref(null);
const caretAnchor = ref(null);
const addressPopover = ref(null);
const mentionPicker = ref(null);
const linkUrl = ref('');
const imageDialogOpen = ref(false);
const fileDialogOpen = ref(false);
const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] });

let crepe = null;
let slashMenu = null;
let editorDiagramClick = null;
let editorEnterKey = null;
let loaded = false;
let disposed = false;
let applyBlockAt = () => null;
let editorViewCtx = null;
let TextSelection = null;
let parser = null;
let serializer = null;
let pendingRange = null;

function markdownValue() {
  return stripSerializerTail(crepe ? crepe.getMarkdown() : props.defaultValue);
}

function withView(callback) {
  if (!crepe) return null;
  let result = null;
  crepe.editor.action(ctx => { result = callback(ctx.get(editorViewCtx)); });
  return result;
}

function currentRange() {
  return withView(view => ({ from: view.state.selection.from, to: view.state.selection.to }));
}

function restoreRange(view, range) {
  if (!range || !TextSelection) return;
  const from = Math.min(range.from, view.state.doc.content.size);
  const to = Math.min(range.to, view.state.doc.content.size);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

function focus(point = null) {
  if (!crepe) {
    editorHost.value?.querySelector('.ProseMirror')?.focus();
    return;
  }
  withView(view => {
    view.focus();
    if (!point || !TextSelection) return;
    const hit = view.posAtCoords({ left: point.x, top: point.y });
    const at = hit ? hit.pos : view.state.doc.content.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))));
  });
}

function focusEnd() {
  if (!crepe) {
    editorHost.value?.querySelector('.ProseMirror')?.focus();
    return;
  }
  withView(view => {
    view.focus();
    if (!TextSelection) return;
    const end = view.state.doc.content.size;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end))));
  });
}

function focusStart() {
  if (!crepe) {
    editorHost.value?.querySelector('.ProseMirror')?.focus();
    return;
  }
  withView(view => {
    view.focus();
    if (!TextSelection) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(0), 1)));
  });
}

function markdownOf(node) {
  if (!node || !serializer) return '';
  return stripSerializerTail(serializer(node));
}

// The Notion block break: split a top-level textblock at the caret into
// the current block's markdown and the new block's markdown.
function splitAtSelection() {
  if (!crepe || !TextSelection) return null;
  return withView(view => {
    const { state } = view;
    const { selection } = state;
    if (!selection.empty) return null;
    const { $from } = selection;
    if ($from.depth !== 1 || !$from.parent.isTextblock) return null;
    if ($from.parent.type.name === 'code_block') return null;
    if ($from.parent.content.size === 0) return null;
    const node = $from.parent;
    const index = $from.index(0);
    const offset = $from.parentOffset;
    const beforeNodes = [];
    for (let i = 0; i < index; i += 1) beforeNodes.push(state.doc.child(i));
    const beforeContent = node.content.cut(0, offset);
    if (beforeContent.size) beforeNodes.push(node.copy(beforeContent));
    const afterNodes = [];
    const afterContent = node.content.cut(offset);
    if (afterContent.size) afterNodes.push(node.copy(afterContent));
    for (let i = index + 1; i < state.doc.childCount; i += 1) afterNodes.push(state.doc.child(i));
    if (!beforeNodes.length) beforeNodes.push(state.schema.nodes.paragraph.create());
    const beforeDoc = state.schema.nodes.doc.create(null, beforeNodes);
    const afterDoc = state.schema.nodes.doc.create(null, afterNodes);
    const tr = state.tr.replaceWith(0, state.doc.content.size, beforeDoc.content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size), -1));
    view.dispatch(tr);
    return { before: markdownOf(beforeDoc), after: markdownOf(afterDoc) };
  });
}

// Backspace at a block's start joins the block into its predecessor. The
// two leading textblocks append inline; later nodes append as siblings.
function appendMarkdown(markdown) {
  if (!crepe || !parser) return false;
  const value = String(markdown || '');
  if (!value.trim()) return false;
  const source = parser(value);
  if (!source?.childCount) return false;
  return withView(view => {
    const { state } = view;
    const last = state.doc.lastChild;
    const first = source.firstChild;
    let tr = state.tr;
    let joinPos;
    if (last?.isTextblock && first?.isTextblock) {
      joinPos = state.doc.content.size - 1;
      tr = tr.replaceWith(joinPos, joinPos, first.content);
      if (source.childCount > 1) {
        tr = tr.insert(tr.doc.content.size, source.content.cut(first.nodeSize));
      }
    } else {
      joinPos = state.doc.content.size;
      tr = tr.insert(joinPos, source.content);
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(joinPos), 1));
    view.dispatch(tr);
    view.focus();
    return true;
  });
}

function placeCaretAnchor(pos) {
  const anchor = caretAnchor.value;
  if (!anchor) return false;
  return withView(view => {
    const at = Math.max(0, Math.min(pos, view.state.doc.content.size));
    const coords = view.coordsAtPos(at);
    anchor.style.left = `${coords.left}px`;
    anchor.style.top = `${coords.bottom}px`;
    return true;
  });
}

// The slash item that hands off runs inside its own click; the overlay
// opens on the next task so that click cannot dismiss it as an outside
// click.
function openAddressEditor() {
  if (!caretAnchor.value) return;
  pendingRange = currentRange();
  const from = pendingRange?.from ?? 0;
  placeCaretAnchor(from);
  linkUrl.value = '';
  setTimeout(() => {
    addressPopover.value?.show({ currentTarget: caretAnchor.value }, caretAnchor.value);
  }, 0);
}

function openLinkEditor() {
  openAddressEditor();
}

function openImageEditor() {
  pendingRange = currentRange();
  setTimeout(() => { imageDialogOpen.value = true; }, 0);
}

function openFilePicker() {
  pendingRange = currentRange();
  setTimeout(() => { fileDialogOpen.value = true; }, 0);
}

function openInstancePicker() {
  pendingRange = currentRange();
  placeCaretAnchor(pendingRange?.from ?? 0);
  setTimeout(() => mentionPicker.value?.open(caretAnchor.value), 0);
}

function openMention(pos) {
  pendingRange = { from: pos, to: pos };
  placeCaretAnchor(pos);
  setTimeout(() => mentionPicker.value?.open(caretAnchor.value), 0);
}

function applyInstancePick(ref) {
  withView(view => {
    restoreRange(view, pendingRange);
    insertInstanceRef(view, ref);
  });
  pendingRange = null;
  focus();
}

function applyImage(src) {
  withView(view => {
    restoreRange(view, pendingRange);
    const image = view.state.schema.nodes.image;
    if (!image) return;
    view.dispatch(view.state.tr.replaceSelectionWith(image.create({ src, alt: '', title: '' })).scrollIntoView());
  });
  pendingRange = null;
  focus();
}

function applyFile(file) {
  if (file?.typeId && file?.instanceId && file.entity) {
    emit('request-file-reference', {
      typeId: file.typeId,
      instanceId: file.instanceId,
      name: file.entity.name || file.name
    });
    openWorkspacePageFromChrome({ pageId: 'graph-editor', typeId: file.typeId, entity: file.entity });
    pendingRange = null;
    return;
  }
  withView(view => {
    restoreRange(view, pendingRange);
    insertFileRef(view, file);
  });
  pendingRange = null;
  focus();
}

async function applyAddress() {
  const href = linkUrl.value.trim();
  if (!href || !crepe) return;
  addressPopover.value?.hide();
  withView(view => {
    restoreRange(view, pendingRange);
    const { from, to, empty } = view.state.selection;
    if (!empty) {
      view.dispatch(view.state.tr.addMark(from, to, view.state.schema.marks.link.create({ href })));
      return;
    }
    const label = href;
    const tr = view.state.tr.insertText(label);
    tr.addMark(from, from + label.length, view.state.schema.marks.link.create({ href }));
    view.dispatch(tr);
  });
  pendingRange = null;
  focus();
}

function runSlashPick(id, view) {
  if (id === 'view') {
    emit('request-view');
    return;
  }
  if (id === 'reference') {
    emit('request-reference');
    return;
  }
  if (id === 'graph-output') {
    emit('request-graph-output');
    return;
  }
  const kind = applyBlockAt(id, view);
  if (kind !== 'link' && kind !== 'image' && kind !== 'file' && kind !== 'instance' && kind !== 'view') focus();
}

onMounted(async () => {
  if (!editorHost.value) return;
  const [{ Crepe: CrepeEditor }, { $prose }, { languages: codeLanguages }, { editorViewCtx: viewCtx, parserCtx, serializerCtx }, { TextSelection: selectionType }] = await Promise.all([
    import('@milkdown/crepe'),
    import('@milkdown/utils'),
    import('@codemirror/language-data'),
    import('@milkdown/core'),
    import('@milkdown/prose/state')
  ]);
  editorViewCtx = viewCtx;
  TextSelection = selectionType;
  const collabModule = props.collab ? await import('@milkdown/plugin-collab') : null;
  const [{ createSourceMarkersPlugin }, { createSlashMenu }, vocabulary, { codeMirrorTheme }] = await Promise.all([
    import('#workers/documents/surfaces/lib/source-markers-plugin.js'),
    import('#workers/documents/surfaces/lib/slash-menu.js'),
    import('#workers/documents/surfaces/lib/block-vocabulary.mjs'),
    import('#workers/documents/surfaces/lib/cm-theme.js')
  ]);
  // A surface unmounted mid-load (navigation) owns nothing anymore: the
  // engine never mounts on a dead host.
  if (disposed || !editorHost.value) return;
  await Promise.all([
    import('#workers/documents/assets/vendor/crepe-theme.css'),
    import('#workers/documents/assets/text-editor.css')
  ]);
  applyBlockAt = (id, view) => vocabulary.applyBlock({
    id,
    state: blockState.value,
    editor: crepe,
    view,
    openLinkEditor,
    openImageEditor,
    openFilePicker,
    openInstancePicker
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
      [CrepeEditor.Feature.Placeholder]: Boolean(props.placeholder)
    },
    featureConfigs: {
      [CrepeEditor.Feature.Placeholder]: { text: props.placeholder || '' },
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
          return null;
        }
      }
    }
  });
  crepe.editor.use($prose(() => createSourceMarkersPlugin({
    onSelectionState: next => { blockState.value = next; },
    markers: props.showSourceMarkers
  })));
  const instanceRef = createInstanceRefPlugins({
    appContext,
    onMention: openMention
  });
  const fileRef = createFileRefPlugins({ appContext });
  crepe.editor.use([
    instanceRef.schema, instanceRef.view, instanceRef.behavior,
    fileRef.schema, fileRef.view
  ]);
  slashMenu = createSlashMenu({
    items: vocabulary.BLOCK_VOCABULARY.map(({ id, labelKey, glyph, glyphText, match }) => ({ id, label: t(labelKey), glyph, glyphText, match })),
    onPick: runSlashPick
  });
  crepe.editor.use($prose(() => slashMenu.plugin));
  if (collabModule) crepe.editor.use(collabModule.collab);
  crepe.on(api => api.markdownUpdated(() => {
    if (loaded) emit('update', markdownValue());
  }));
  await crepe.create();
  if (disposed) {
    crepe.destroy();
    crepe = null;
    return;
  }
  parser = crepe.editor.ctx.get(parserCtx);
  serializer = crepe.editor.ctx.get(serializerCtx);
  if (collabModule && props.collab) {
    const service = crepe.editor.ctx.get(collabModule.collabServiceCtx);
    service.bindDoc(props.collab.doc).setAwareness(props.collab.awareness);
    if (props.collab.owner) {
      service.applyTemplate(props.defaultValue);
      service.connect();
      props.collab.markSeeded?.();
    } else {
      service.connect();
    }
  }
  loaded = true;
  if (props.initialBlock && props.initialBlock !== 'paragraph') {
    withView(view => applyBlockAt(props.initialBlock, view));
    emit('update', markdownValue());
  }
  emit('ready');
  editorDiagramClick = event => {
    const instanceRef = event.target?.closest?.('[data-instance-ref]');
    if (instanceRef) return;
    const block = event.target?.closest?.('.milkdown-code-block');
    if (!block?.querySelector('.preview .mermaid-diagram')) return;
    if (!block.querySelector('.codemirror-host.hidden')) return;
    block.querySelector('.preview-toggle-button')?.click();
  };
  editorHost.value.addEventListener('click', editorDiagramClick);
  editorEnterKey = event => {
    if (document.querySelector('.md-slash-menu[data-show="true"]')) return;
    const plain = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (['Backspace', 'Delete'].includes(event.key) && plain) {
      if (!crepe || !editorViewCtx) return;
      let empty = false;
      let atStart = false;
      let atEnd = false;
      withView(view => {
        const { doc, selection } = view.state;
        if (!selection.empty) return;
        const { $to } = selection;
        empty = doc.childCount === 1 && doc.firstChild?.isTextblock && doc.firstChild.content.size === 0;
        atStart = $to.depth === 1 && $to.index(0) === 0 && $to.parentOffset === 0;
        atEnd = $to.depth === 1
          && $to.index(0) === doc.childCount - 1
          && $to.parentOffset === $to.parent.content.size;
      });
      if (event.key === 'Backspace' && empty && props.deleteOnEmptyBackspace) {
        event.preventDefault();
        event.stopPropagation();
        emit('delete-empty');
        return;
      }
      if (props.splitOnEnter && event.key === 'Backspace' && atStart) {
        event.preventDefault();
        event.stopPropagation();
        emit('merge-backward');
        return;
      }
      if (props.splitOnEnter && event.key === 'Delete' && atEnd) {
        event.preventDefault();
        event.stopPropagation();
        emit('merge-forward');
        return;
      }
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && plain) {
      const direction = event.key.slice('Arrow'.length).toLowerCase();
      let boundary = false;
      withView(view => {
        if (!view.state.selection.empty) return;
        boundary = view.endOfTextblock(direction);
      });
      if (boundary) {
        event.preventDefault();
        event.stopPropagation();
        emit('caret-boundary', direction);
        return;
      }
    }
    if (event.key !== 'Enter' || !plain) return;
    let emptyParagraph = false;
    withView(view => {
      const { selection } = view.state;
      if (!selection.empty) return;
      const { $to } = selection;
      emptyParagraph = $to.depth === 1
        && $to.parent.type.name === 'paragraph'
        && $to.parent.content.size === 0;
    });
    if (emptyParagraph) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (props.commitOnEnter) {
      event.preventDefault();
      event.stopPropagation();
      emit('enter');
      return;
    }
    if (!props.splitOnEnter) return;
    const split = splitAtSelection();
    if (!split) return;
    event.preventDefault();
    event.stopPropagation();
    emit('split', split.after);
  };
  editorHost.value.addEventListener('keydown', editorEnterKey, true);
});

onBeforeUnmount(() => {
  loaded = false;
  disposed = true;
  if (editorDiagramClick && editorHost.value) {
    editorHost.value.removeEventListener('click', editorDiagramClick);
    editorDiagramClick = null;
  }
  if (editorEnterKey && editorHost.value) {
    editorHost.value.removeEventListener('keydown', editorEnterKey, true);
    editorEnterKey = null;
  }
  slashMenu?.destroy();
  slashMenu = null;
  crepe?.destroy();
  crepe = null;
});

function getMarkdown() {
  return markdownValue();
}

defineExpose({ focus, focusStart, focusEnd, appendMarkdown, getMarkdown });
</script>
