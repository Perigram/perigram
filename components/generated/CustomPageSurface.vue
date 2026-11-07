<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <div class="flex min-w-0 flex-wrap items-center gap-2 border-b border-chrome-border py-1">
      <div class="flex min-w-40 max-w-72 flex-1 items-center gap-1">
        <InputText
          v-model="nameValue"
          size="small"
          class="w-full min-w-0"
          :pt="nameFieldPt"
          :placeholder="t('common.unnamed')"
          :aria-label="t('common.rename')"
          @keydown.enter.prevent.stop="commitName"
          @blur="commitName"
        />
        <Button
          v-if="nameDirty"
          icon="pi pi-check"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="t('common.apply')"
          @click="commitName"
        />
      </div>
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
      <Button
        :label="t('common.save')"
        icon="pi pi-save"
        size="small"
        text
        class="ml-auto"
        :loading="saving"
        :disabled="!dirty"
        @click="save"
      />
    </div>
    <!-- The read presentation is the host markdown pipeline (the one
         renderer every authored surface reads through); the live engine
         replaces it after mount. -->
    <div
      v-if="!editorReady"
      class="ck-markdown-body text-prose min-h-0 flex-1 overflow-y-auto p-6"
      :aria-label="t('pages.page')"
      v-html="rendered"
    />
    <div
      v-show="editorReady"
      ref="editorHost"
      class="crepe-host text-prose min-h-0 flex-1 overflow-y-auto"
      :aria-label="t('pages.page')"
    />
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import { renderMarkdown } from '#shared/markdown.js';
import { usePagesStore } from '~/stores/pages';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

// The custom page surface (SPEC §26): one markdown document authored
// through the one editor engine — the crepe mount follows the documents
// plugin's reference (text-editor.mjs), the block vocabulary and slash
// panel come from the same share module (surfaces/lib), and persistence
// rides the pages API alone.
const props = defineProps({
  docId: { type: String, required: true }
});

const { t } = useI18n();
const pagesStore = usePagesStore();
const tabKey = inject('workspacePageKey', '');

const editorHost = ref(null);
const linkPopover = ref(null);
const linkUrl = ref('');
const dirty = ref(false);
const saving = ref(false);
const editorReady = ref(false);
const nameDraft = ref(null);
const blockState = ref({ block: 'paragraph', headingLevel: null, bullet: false, ordered: false, quote: false, task: false, marks: [] });

const page = computed(() => pagesStore.pageById(props.docId));
const displayName = computed(() => page.value?.name || '');
const nameValue = computed({
  get: () => nameDraft.value ?? displayName.value,
  set: value => { nameDraft.value = value; }
});
const nameDirty = computed(() => nameDraft.value !== null
  && nameDraft.value.trim() !== ''
  && nameDraft.value.trim() !== displayName.value);
const rendered = computed(() => renderMarkdown(pagesStore.contents[props.docId] || ''));

let crepe = null;
let slashMenu = null;
let editorDiagramClick = null;
let loaded = false;
let applyBlockAt = () => null;

const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

async function commitName() {
  if (nameDraft.value === null) return;
  const name = nameDraft.value.trim();
  nameDraft.value = null;
  if (!name || name === displayName.value) return;
  try {
    await pagesStore.rename(props.docId, name);
  } catch (error) {
    console.error('Failed to rename page:', error?.message || error);
  }
}

function focusRenderedEditor() {
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
  focusRenderedEditor();
}

function runSlashPick(id, view) {
  const kind = applyBlockAt(id, view);
  if (kind !== 'link') focusRenderedEditor();
}

// The serializer renders an empty trailing block as `<br />`; every
// markdown export strips the tail.
const stripSerializerTail = text => String(text || '').replace(/(?:\n?<br\s*\/?>)+\s*$/, '\n');

async function save() {
  if (!crepe) return;
  saving.value = true;
  try {
    await pagesStore.saveContent(props.docId, stripSerializerTail(crepe.getMarkdown()));
    dirty.value = false;
    setWorkspacePageDirty(tabKey, false);
  } catch (error) {
    console.error('Failed to save page:', error?.message || error);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await pagesStore.ensureLoaded();
  await pagesStore.loadContent(props.docId).catch(() => {});
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
    openLinkEditor
  });

  crepe = new CrepeEditor({
    root: editorHost.value,
    defaultValue: pagesStore.contents[props.docId] || '',
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
        previewOnlyByDefault: true,
        renderPreview: (language, content) => {
          if (String(language || '').toLowerCase() !== 'mermaid') return null;
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
    items: vocabulary.BLOCK_VOCABULARY.map(({ id, labelKey, glyph, glyphText, match }) => ({ id, label: t(labelKey), glyph, glyphText, match })),
    onPick: runSlashPick
  });
  crepe.editor.use($prose(() => slashMenu.plugin));
  crepe.on(api => api.markdownUpdated(() => {
    if (loaded) {
      dirty.value = true;
      setWorkspacePageDirty(tabKey, true);
    }
  }));
  await crepe.create();
  loaded = true;
  editorReady.value = true;
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
  setWorkspacePageDirty(tabKey, false);
  if (editorDiagramClick && editorHost.value) {
    editorHost.value.removeEventListener('click', editorDiagramClick);
    editorDiagramClick = null;
  }
  slashMenu?.destroy();
  slashMenu = null;
  crepe?.destroy();
  crepe = null;
});
</script>
