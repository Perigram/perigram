// The documents plugin's markdown editor surface (surface contract 3 —
// the capability mount): the single-surface live editing engine
// (milkdown, through crepe) with every piece of engine chrome disabled —
// the visible chrome is the host header (the document name and save,
// through the page-chrome binding) and the slash panel on the app's
// theme. Markdown remains the model: the
// payload round-trips through the
// framework's own serializer, no rich-text proxy. The milkdown/codemirror
// families are declared vendored dependencies (the split vendor build
// keeps one prosemirror class identity); the crepe theme and the editor
// voice css are static assets beside the module, injected as links.
// Remote saves reconcile through the host's record-change bridge.
import { Crepe as CrepeEditor } from '@milkdown/crepe';
import { $prose, callCommand, replaceAll } from '@milkdown/utils';
import { insertImageCommand, toggleLinkCommand } from '@milkdown/preset-commonmark';
import { createSourceMarkersPlugin } from './lib/source-markers-plugin.js';
import { codeMirrorTheme } from './lib/cm-theme.js';
import { createSlashMenu } from './lib/slash-menu.js';
import { BLOCK_VOCABULARY, applyBlock } from './lib/block-vocabulary.mjs';

const CSS_ASSETS = ['../assets/vendor/crepe-theme.css', '../assets/text-editor.css'];

function injectStyles() {
  for (const href of CSS_ASSETS) {
    const url = new URL(href, import.meta.url).href;
    if (document.head.querySelector(`link[data-surface-style="${url}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.surfaceStyle = url;
    document.head.appendChild(link);
  }
}

export default function createSurface({ vue, components, locale, sync, renderMarkdown = null }) {
  const { h, ref, computed, reactive, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Popover } = components;

  if (!sync) {
    throw new Error('text-editor requires the contract-3 mount context (sync capability)');
  }

  return defineComponent({
    name: 'TextDocumentEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null },
      // 'read' (the opener holds no write grant) renders the document —
      // the read-only presentation is the rendered markdown itself.
      mode: { type: String, default: 'edit' },
      // The editor page chrome channel (SPEC §4): the host header owns
      // the document name and save; the editor binds its document
      // state into it.
      pageChrome: { type: Object, default: null }
    },
    setup(props) {
      const editorHost = ref(null);
      const saving = ref(false);
      const dirty = ref(false);
      const remoteChanged = ref(false);
      const reloading = ref(false);
      const localTitle = ref('');

      async function loadText() {
        return await props.persistence.loadDocument(props.record, { mimeType: 'text/markdown', raw: true }) || '';
      }

      if (props.mode === 'read') {
        const readText = ref('');
        const renderRead = () => {
          readText.value = '';
          loadText().then(text => { readText.value = text; }).catch(() => {});
        };
        renderRead();
        sync.onRecordChanged(renderRead);
        return () => h('div', {
          class: 'ck-markdown-body text-prose h-full min-h-0 flex-1 overflow-y-auto p-6',
          'aria-label': t('editors.text'),
          innerHTML: renderMarkdown ? renderMarkdown(readText.value) : ''
        });
      }

      const displayName = () => localTitle.value || props.record?.name || props.persistence?.title || '';

      // The header's rename channel: the page header owns the draft; the
      // editor applies the committed name through the persistence.
      async function rename(name) {
        if (!name || name === displayName()) return;
        try {
          await props.persistence.rename(props.record, name);
          localTitle.value = name;
        } catch (error) {
          console.error('Failed to rename document:', error?.message || error);
        }
      }

      // Block authoring rides the slash panel (SPEC §26): the
      // source-markers plugin reports the focused block's state on
      // every selection or document change, and the vocabulary actions
      // (lib/block-vocabulary.mjs) apply at the caret.
      const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] });

      function focusRenderedEditor() {
        editorHost.value?.querySelector('.ProseMirror')?.focus();
      }

      const addressPopover = ref(null);
      const linkUrl = ref('');
      const addressKind = ref('link');

      // The link and image entries' hand-off: the address input opens
      // anchored to the editing surface — the editor selection survives
      // the panel pick, so the applied target lands at the caret.
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

      function applyAddress() {
        const href = linkUrl.value.trim();
        if (!href || !crepe) return;
        addressPopover.value?.hide();
        const image = addressKind.value === 'image';
        crepe.editor.action(callCommand(
          (image ? insertImageCommand : toggleLinkCommand).key,
          image ? { src: href } : { href }
        ));
        focusRenderedEditor();
      }

      function runSlashPick(id, view) {
        const kind = applyBlock({ id, state: blockState.value, editor: crepe, view, openLinkEditor, openImageEditor });
        if (kind !== 'link' && kind !== 'image' && kind !== 'file') focusRenderedEditor();
      }

      async function reloadFromRemote() {
        if (!crepe) return;
        reloading.value = true;
        try {
          crepe.editor.action(replaceAll(await loadText()));
          remoteChanged.value = false;
        } finally {
          reloading.value = false;
        }
      }

      // Remote saves/renames reconcile: clean reloads the text, dirty
      // raises the refresh affordance (own publications skip host-side).
      sync.onRecordChanged(() => {
        if (dirty.value) {
          remoteChanged.value = true;
          return;
        }
        reloadFromRemote();
      });

      // Browser-only surface (the engine touches the DOM): built after
      // mount, destroyed with the component.
      let crepe = null;
      let slashMenu = null;
      let editorDiagramClick = null;
      let loaded = false;

      onMounted(async () => {
        injectStyles();
        const initial = await loadText();
        const [{ languages: codeLanguages }] = await Promise.all([
          import('@codemirror/language-data')
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
            [CrepeEditor.Feature.Cursor]: false,
            [CrepeEditor.Feature.Placeholder]: false
          },
          featureConfigs: {
            [CrepeEditor.Feature.CodeMirror]: {
              languages: codeLanguages,
              theme: codeMirrorTheme,
              // Mermaid fences preview as diagrams (owner direction
              // 2026-10-17) through the host-provided read pipeline —
              // pele stays single-homed in the platform, the plugin
              // never vendors it. Blocks start in preview-only (the
              // Obsidian read), crepe's own Edit toggle and a click on
              // the diagram flip to the CodeMirror source with the
              // diagram kept live beside it; fences that do not parse
              // stay plain source blocks.
              previewOnlyByDefault: true,
              renderPreview: (language, content) => {
                if (!renderMarkdown || String(language || '').toLowerCase() !== 'mermaid') return null;
                const host = document.createElement('div');
                host.innerHTML = renderMarkdown(`\`\`\`mermaid\n${String(content || '')}\n\`\`\``);
                return host.querySelector('.mermaid-diagram') || null;
              }
            }
          }
        });
        crepe.editor.use($prose(() => createSourceMarkersPlugin({
          onSelectionState: next => { blockState.value = next; }
        })));
        slashMenu = createSlashMenu({
          // The picker entries (view, reference, graph-output) and the
          // record/file entries ride hosts that own those pickers (the
          // custom-page surface); this editor keeps them out until its
          // surfaces mount the same embeds.
          items: BLOCK_VOCABULARY
            .filter(({ id }) => id !== 'view' && id !== 'instance' && id !== 'file' && id !== 'reference' && id !== 'graph-output')
            .map(({ id, labelKey, glyph, glyphText, match }) => ({ id, label: t(labelKey), glyph, glyphText, match })),
          onPick: runSlashPick
        });
        crepe.editor.use($prose(() => slashMenu.plugin));
        crepe.on(api => api.markdownUpdated(() => {
          // Only post-load changes are edits — a programmatic remote
          // reload is reconciliation, not an edit.
          if (loaded && !reloading.value) dirty.value = true;
        }));
        await crepe.create();
        loaded = true;
        // Clicking a rendered diagram enters its source (the Obsidian
        // flip): the delegation drives crepe's own preview toggle only
        // while the block is diagram-only — a click in the split view
        // (source beside the live diagram) never hides the editor.
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

      // The serializer renders an empty trailing block as `<br />`; that
      // is its artifact, never content — every markdown export strips
      // the tail.
      const stripSerializerTail = text => String(text || '').replace(/(?:\n?<br\s*\/?>)+\s*$/, '\n');

      async function save() {
        if (!crepe) return;
        saving.value = true;
        try {
          const markdown = stripSerializerTail(crepe.getMarkdown());
          const stem = String(displayName() || 'document').replace(/\.(md|txt)$/i, '');
          await props.persistence.saveDocument(props.record, markdown, { fileName: `${stem}.md`, mimeType: 'text/markdown' });
          dirty.value = false;
        } catch (error) {
          console.error('Failed to save document:', error?.message || error);
        } finally {
          saving.value = false;
        }
      }

      // The document chrome hand-off (SPEC §4): the header renders the
      // name, the dirty-marked save, and the divergence refresh from
      // this binding; the surface below is the editor alone.
      props.pageChrome?.bind?.(Object.assign(
        reactive({
          name: computed(displayName),
          dirty,
          saving,
          diverged: computed(() => remoteChanged.value && dirty.value)
        }),
        { save, rename, reload: reloadFromRemote }
      ));

      return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col p-4' }, [
        h(Popover, { ref: addressPopover }, () => h('div', { class: 'flex items-center gap-2 p-2' }, [
          h(InputText, {
            modelValue: linkUrl.value,
            size: 'small',
            class: 'w-72',
            type: 'url',
            placeholder: t('editors.linkAddress'),
            'aria-label': t('editors.linkAddress'),
            'onUpdate:modelValue': value => { linkUrl.value = value; },
            onKeydown: event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyAddress();
              }
            }
          }),
          h(Button, { icon: 'pi pi-check', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('common.apply'), onClick: applyAddress })
        ])),
        h('div', { ref: editorHost, class: 'crepe-host text-prose min-h-0 flex-1 overflow-y-auto', 'aria-label': t('editors.text') })
      ]);
    }
  });
}
