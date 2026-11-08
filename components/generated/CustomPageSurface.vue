<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <!-- The custom page's header (SPEC §22.3): the unified anatomy with
         the page's own concerns — in-place name editing, the class dialog
         entry on a class page, and the dirty-gated save. A page is no
         instance: no type label, no state surface, no comments entry. -->
    <SurfaceHeader
      :title="displayName"
      :on-rename="commitName"
    >
      <template #cluster>
        <Button
          v-if="classEditAvailable"
          :label="t('classes.editTitle')"
          icon="pi pi-pencil"
          size="small"
          text
          severity="secondary"
          @click="classEditorOpen = true"
        />
        <Button
          v-if="dirty"
          :label="t('common.save')"
          icon="pi pi-save"
          size="small"
          text
          severity="secondary"
          :loading="saving"
          @click="save"
        />
      </template>
    </SurfaceHeader>
    <div
      class="text-prose min-h-0 flex-1 overflow-y-auto p-6"
      :aria-label="t('pages.page')"
    >
      <GeneratedScreenHost
        v-if="classListScreen"
        :screen="classListScreen"
        class="mb-6"
        keep-empty-lists
        @open-instance="openClassInstance"
      />
      <!-- The read presentation is the host markdown pipeline; the live
           engine replaces it after mount. -->
      <MarkdownBlocks v-if="!editorReady" :source="pagesStore.contents[docId] || ''" />
      <CrepeEditor
        v-if="contentReady"
        v-show="editorReady"
        ref="editor"
        :default-value="pagesStore.contents[docId] || ''"
        :placeholder="t('editors.slashHint')"
        :scroll="false"
        show-source-markers
        @ready="editorReady = true"
        @update="onMarkdown"
      />
    </div>
    <ClassDialog
      v-if="classType"
      v-model:visible="classEditorOpen"
      :type="classType"
      :type-id="classType.id"
      :read-only="!classEditAvailable"
    />
  </div>
</template>

<script setup>
// The custom page surface (SPEC §26): one markdown document authored
// through the one editor engine (CrepeEditor) and persisted through the
// pages API alone. A class page leads with its class's live collection.
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import CrepeEditor from './CrepeEditor.vue';
import MarkdownBlocks from './MarkdownBlocks.vue';
import GeneratedScreenHost from './GeneratedScreenHost.vue';
import ClassDialog from '~/components/type-designer/ClassDialog.vue';
import { classListScreenForTypeId } from './detail-screen-actions.js';
import { usePagesStore } from '~/stores/pages';
import { useAuthStore } from '~/stores/auth';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { stripSerializerTail } from '#shared/markdown.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';

const props = defineProps({
  docId: { type: String, required: true }
});

const { t } = useI18n();
const pagesStore = usePagesStore();
const authStore = useAuthStore();
const fileTypeView = useFileTypeView();
const tabKey = inject('workspacePageKey', '');

const editor = ref(null);
const dirty = ref(false);
const saving = ref(false);
const contentReady = ref(false);
const editorReady = ref(false);
const classEditorOpen = ref(false);

const page = computed(() => pagesStore.pageById(props.docId));
const displayName = computed(() => page.value?.name || '');
const classTypeId = computed(() => page.value?.classTypeId || '');
const classType = computed(() => (classTypeId.value ? fileTypeView.typeById(classTypeId.value) : null));
const classEditAvailable = computed(() => Boolean(classType.value)
  && classType.value.scope === 'org'
  && authStore.hasPermission('organizations', 'admin'));
const classListScreen = computed(() => (classTypeId.value
  ? classListScreenForTypeId({
    screens: authStore.screenManifest || [],
    typeId: classTypeId.value
  })
  : null));

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

function openClassInstance({ typeId, instanceId } = {}) {
  if (!typeId || !instanceId) return;
  openInstanceInWorkspace({ typeId, instanceId: String(instanceId) });
}

onMounted(async () => {
  await pagesStore.ensureLoaded();
  await pagesStore.loadContent(props.docId).catch(() => {});
  contentReady.value = true;
});
</script>
