<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <!-- The custom page's header (SPEC §22.3): the unified anatomy with
         the page's own concerns — in-place name editing and the
         dirty-gated save. A page is no instance: no type label, no state
         surface, no comments entry. -->
    <SurfaceHeader
      :title="displayName"
      :on-rename="commitName"
    >
      <template #cluster>
        <Button
          :label="t('common.save')"
          icon="pi pi-save"
          size="small"
          text
          severity="secondary"
          :loading="saving"
          :disabled="!dirty"
          @click="save"
        />
      </template>
    </SurfaceHeader>
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
      :placeholder="t('editors.slashHint')"
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
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';
import ViewPickerDialog from './ViewPickerDialog.vue';
import { usePagesStore } from '~/stores/pages';
import { stripSerializerTail } from '#shared/markdown.js';
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
const viewPickerOpen = ref(false);
let insertFenceAt = () => {};

const page = computed(() => pagesStore.pageById(props.docId));
const displayName = computed(() => page.value?.name || '');

async function commitName(name) {
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
