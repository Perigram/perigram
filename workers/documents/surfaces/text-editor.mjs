// The documents plugin's markdown editor surface (surface contract 3 —
// the capability mount): the single-surface live editing engine
// (milkdown, through crepe) with every piece of engine chrome disabled —
// the visible chrome is this toolbar's host primitives and the app's
// theme. Markdown remains the model: the payload round-trips through the
// framework's own serializer, no rich-text proxy. The milkdown/codemirror
// families are declared vendored dependencies (the split vendor build
// keeps one prosemirror class identity); the crepe theme and the editor
// voice css are static assets beside the module, injected as links.
// Remote saves reconcile through the host's record-change bridge.
import { Crepe as CrepeEditor } from '@milkdown/crepe';
import { $prose, callCommand, replaceAll } from '@milkdown/utils';
import { editorViewCtx } from '@milkdown/core';
import { wrapInHeadingCommand, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, turnIntoTextCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand, toggleLinkCommand, insertHrCommand, liftListItemCommand } from '@milkdown/preset-commonmark';
import { lift } from '@milkdown/prose/commands';
import { createSourceMarkersPlugin } from './lib/source-markers-plugin.js';
import { codeMirrorTheme } from './lib/cm-theme.js';
import { createSlashMenu } from './lib/slash-menu.js';

const CSS_ASSETS = ['../assets/vendor/crepe-theme/style.css', '../assets/text-editor.css'];

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

export default function createSurface({ vue, components, locale, sync }) {
  const { h, ref, computed, onMounted, onBeforeUnmount, defineComponent } = vue;
  const t = locale.t;
  const { Button, InputText, Popover } = components;

  if (!sync) {
    throw new Error('text-editor requires the contract-3 mount context (sync capability)');
  }

  return defineComponent({
    name: 'TextDocumentEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const editorHost = ref(null);
      const saving = ref(false);
      const dirty = ref(false);
      const remoteChanged = ref(false);
      const reloading = ref(false);
      const localTitle = ref('');
      const nameDraft = ref('');

      const displayName = () => localTitle.value || props.record?.name || props.persistence?.title || '';
      const nameDirty = computed(() => Boolean(nameDraft.value.trim()) && nameDraft.value.trim() !== displayName());

      async function commitName() {
        const name = nameDraft.value.trim();
        if (!name || name === displayName()) return;
        try {
          await props.persistence.rename(props.record, name);
          localTitle.value = name;
        } catch (error) {
          console.error('Failed to rename document:', error?.message || error);
        }
      }

      // The format row speaks markdown's own vocabulary. Marks carry
      // their meaning typographically; every control toggles; heading
      // commands take the LEVEL as the raw command payload.
      const formatControls = [
        { id: 'strong', label: 'B', class: 'font-bold', labelKey: 'editors.bold', command: toggleStrongCommand, off: toggleStrongCommand },
        { id: 'emphasis', label: 'I', class: 'italic', labelKey: 'editors.italic', command: toggleEmphasisCommand, off: toggleEmphasisCommand },
        { id: 'code', label: '</>', labelKey: 'editors.inlineCode', command: toggleInlineCodeCommand, off: toggleInlineCodeCommand },
        { id: 'h1', label: 'H1', labelKey: 'editors.heading1', command: wrapInHeadingCommand, payload: 1, off: turnIntoTextCommand },
        { id: 'h2', label: 'H2', labelKey: 'editors.heading2', command: wrapInHeadingCommand, payload: 2, off: turnIntoTextCommand },
        { id: 'h3', label: 'H3', labelKey: 'editors.heading3', command: wrapInHeadingCommand, payload: 3, off: turnIntoTextCommand },
        { id: 'h4', label: 'H4', labelKey: 'editors.heading4', command: wrapInHeadingCommand, payload: 4, off: turnIntoTextCommand },
        { id: 'h5', label: 'H5', labelKey: 'editors.heading5', command: wrapInHeadingCommand, payload: 5, off: turnIntoTextCommand },
        { id: 'h6', label: 'H6', labelKey: 'editors.heading6', command: wrapInHeadingCommand, payload: 6, off: turnIntoTextCommand },
        { id: 'codeblock', icon: 'pi pi-code', labelKey: 'editors.codeBlock', command: createCodeBlockCommand, off: turnIntoTextCommand },
        { id: 'paragraph', label: '¶', labelKey: 'editors.paragraph', command: turnIntoTextCommand, off: turnIntoTextCommand },
        { id: 'bullet', icon: 'pi pi-list', labelKey: 'editors.bulletList', command: wrapInBulletListCommand, off: liftListItemCommand },
        { id: 'ordered', icon: 'pi pi-list-check', labelKey: 'editors.numberedList', command: wrapInOrderedListCommand, off: liftListItemCommand },
        { id: 'quote', icon: 'pi pi-comment', labelKey: 'editors.quote', command: wrapInBlockquoteCommand, off: 'lift' }
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

      // The toolbar row suppresses mousedown so pointer clicks never
      // steal focus from the editor; keyboard activation returns it.
      function focusRenderedEditor() {
        editorHost.value?.querySelector('.ProseMirror')?.focus();
      }

      function runFormat(control, { force = false } = {}) {
        if (!crepe) return;
        const active = isActive(control);
        if (active && control.off === 'lift') {
          // Blockquotes have no preset unwrap command: lift the focused
          // block out of the quote through the raw prose command.
          crepe.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            lift(view.state, view.dispatch, view);
          });
          focusRenderedEditor();
          return;
        }
        const command = active && !force && control.off !== null ? control.off : control.command;
        if (!command) return;
        crepe.editor.action(callCommand(command.key, control.payload));
        focusRenderedEditor();
      }

      const linkPopover = ref(null);
      const linkUrl = ref('');

      function toggleLinkPopover(event) {
        linkPopover.value?.toggle(event);
      }

      function applyLink() {
        const href = linkUrl.value.trim();
        if (!href || !crepe) return;
        linkPopover.value?.hide();
        crepe.editor.action(callCommand(toggleLinkCommand.key, { href }));
        focusRenderedEditor();
      }

      // A three-by-three table node over the gfm schema crepe mounts.
      function insertTable(view) {
        const { table, table_row, table_header, table_cell, paragraph } = view.state.schema.nodes;
        const row = (cellType, count) => table_row.createChecked(null, Array.from({ length: count }, () => cellType.createChecked(null, paragraph.create())));
        const node = table.createChecked(null, [row(table_header, 3), row(table_cell, 3), row(table_cell, 3)]);
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
      }

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

      function runSlashPick(id, view) {
        const control = formatControls.find(entry => entry.id === id);
        if (control) return runFormat(control, { force: true });
        if (!crepe) return;
        if (id === 'divider') crepe.editor.action(callCommand(insertHrCommand.key));
        if (id === 'table' && view) insertTable(view);
        focusRenderedEditor();
      }

      async function loadText() {
        return await props.persistence.loadDocument(props.record, { mimeType: 'text/markdown', raw: true }) || '';
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
            [CrepeEditor.Feature.CodeMirror]: { languages: codeLanguages, theme: codeMirrorTheme }
          }
        });
        crepe.editor.use($prose(() => createSourceMarkersPlugin({
          onSelectionState: next => { blockState.value = next; }
        })));
        slashMenu = createSlashMenu({ items: slashItems(), onPick: runSlashPick });
        crepe.editor.use($prose(() => slashMenu.plugin));
        crepe.on(api => api.markdownUpdated(() => {
          // Only post-load changes are edits — a programmatic remote
          // reload is reconciliation, not an edit.
          if (loaded && !reloading.value) dirty.value = true;
        }));
        await crepe.create();
        loaded = true;
      });

      onBeforeUnmount(() => {
        loaded = false;
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

      const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

      return () => h('div', { class: 'flex h-full min-h-0 flex-1 flex-col p-4' }, [
        h('div', { class: 'flex min-w-0 flex-wrap items-center gap-2 border-b border-chrome-border py-1' }, [
          h('div', { class: 'flex min-w-40 max-w-72 flex-1 items-center gap-1' }, [
            h(InputText, {
              modelValue: nameDraft.value,
              size: 'small',
              class: 'w-full min-w-0',
              pt: nameFieldPt,
              placeholder: t('common.unnamed'),
              'aria-label': t('common.rename'),
              'onUpdate:modelValue': value => { nameDraft.value = value; },
              onKeydown: event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  commitName();
                }
              },
              onBlur: commitName
            }),
            nameDirty.value
              ? h(Button, { icon: 'pi pi-check', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('common.apply'), onClick: commitName })
              : null
          ]),
          h('div', { class: 'flex items-center gap-1', onMousedown: event => event.preventDefault() }, [
            ...formatControls.map(control => h(Button, {
              key: control.id,
              icon: control.icon,
              label: control.label,
              severity: isActive(control) ? 'primary' : 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              class: control.class,
              'aria-label': t(control.labelKey),
              'aria-pressed': isActive(control),
              onClick: () => runFormat(control)
            })),
            h(Button, {
              icon: 'pi pi-link',
              severity: linkActive.value ? 'primary' : 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('editors.link'),
              'aria-pressed': linkActive.value,
              onClick: toggleLinkPopover
            })
          ]),
          h(Popover, { ref: linkPopover }, () => h('div', { class: 'flex items-center gap-2 p-2' }, [
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
                  applyLink();
                }
              }
            }),
            h(Button, { icon: 'pi pi-check', severity: 'secondary', text: true, rounded: true, size: 'small', 'aria-label': t('common.apply'), onClick: applyLink })
          ])),
          remoteChanged.value && dirty.value
            ? h(Button, {
              icon: 'pi pi-refresh',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              class: 'ml-auto',
              'aria-label': t('common.refresh'),
              onClick: reloadFromRemote
            })
            : null,
          h(Button, {
            label: t('common.save'),
            icon: 'pi pi-save',
            size: 'small',
            text: true,
            class: remoteChanged.value && dirty.value ? '' : 'ml-auto',
            loading: saving.value,
            disabled: !dirty.value,
            onClick: save
          })
        ]),
        h('div', { ref: editorHost, class: 'crepe-host text-prose min-h-0 flex-1 overflow-y-auto', 'aria-label': t('editors.text') })
      ]);
    }
  });
}
