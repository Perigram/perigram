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
         renderer every authored surface reads through) composed with
         live view embeds; the live engine replaces it after mount. -->
    <div
      v-if="!editorReady"
      class="text-prose min-h-0 flex-1 overflow-y-auto p-6"
      :aria-label="t('pages.page')"
    >
      <MarkdownBlocks :source="pagesStore.contents[docId] || ''" />
    </div>
    <CrepeEditor
      v-show="editorReady"
      ref="editor"
      :default-value="pagesStore.contents[docId] || ''"
      @ready="editorReady = true"
      @update="onMarkdown"
      @pick-view="insert => openFencePicker(insert)"
    />
    <ViewPickerDialog
      :visible="viewPickerOpen"
      @close="viewPickerOpen = false"
      @pick="pickView"
    />
  </div>
</template>

<script setup>
// The custom page surface (SPEC §26): one markdown document authored
// through the one editor engine (CrepeEditor) and persisted through the
// pages API alone.
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';
import ViewPickerDialog from './ViewPickerDialog.vue';
import { usePagesStore } from '~/stores/pages';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

const props = defineProps({
  docId: { type: String, required: true }
});

const { t } = useI18n();
const pagesStore = usePagesStore();
const tabKey = inject('workspacePageKey', '');

const editor = ref(null);
const dirty = ref(false);
const saving = ref(false);
const editorReady = ref(false);
const nameDraft = ref(null);
const viewPickerOpen = ref(false);
let insertFenceAt = () => {};

const nameFieldPt = { root: { style: { background: 'transparent', borderColor: 'transparent' } } };

const page = computed(() => pagesStore.pageById(props.docId));
const displayName = computed(() => page.value?.name || '');
const nameValue = computed({
  get: () => nameDraft.value ?? displayName.value,
  set: value => { nameDraft.value = value; }
});
const nameDirty = computed(() => nameDraft.value !== null
  && nameDraft.value.trim() !== ''
  && nameDraft.value.trim() !== displayName.value);

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

function onMarkdown() {
  dirty.value = true;
  setWorkspacePageDirty(tabKey, true);
}

function openFencePicker(insert) {
  insertFenceAt = insert;
  viewPickerOpen.value = true;
}

function pickView(view) {
  viewPickerOpen.value = false;
  insertFenceAt({ id: view._id, name: view.name });
  editor.value?.focus();
}

// The serializer renders an empty trailing block as `<br />`; every
// markdown export strips the tail.
const stripSerializerTail = text => String(text || '').replace(/(?:\n?<br\s*\/?>)+\s*$/, '\n');

async function save() {
  saving.value = true;
  try {
    await pagesStore.saveContent(props.docId, stripSerializerTail(editor.value?.getMarkdown()));
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
});
</script>
