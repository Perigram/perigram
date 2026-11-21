<template>
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <!-- The custom page's header (SPEC §22.3, §27.1): the unified
         anatomy with the page's own concerns — in-place name editing,
         the class dialog entry on a class page, and the dirty-gated
         save. A page is no instance: no type label, no state surface,
         no comments entry. Header, collection, and document share one
         surface frame (SPEC §27.1). -->
    <div
      class="min-h-0 flex-1 overflow-y-auto"
      :aria-label="t('pages.page')"
    >
      <div :class="[LAYOUT.measure, 'flex flex-col']">
        <SurfaceHeader
          :title="displayName"
          :on-rename="commitName"
          class="mb-6"
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
              v-if="session.dirty"
              :label="t('common.save')"
              icon="pi pi-save"
              size="small"
              text
              severity="secondary"
              :loading="session.saving"
              @click="session.save"
            />
          </template>
        </SurfaceHeader>
        <GeneratedScreenHost
          v-if="classListScreen"
          :screen="classListScreen"
          class="mb-6"
          keep-empty-lists
          @open-instance="openClassInstance"
        />
        <div v-if="session.loaded" :class="[spacing.screenRoot, 'w-full']">
          <DocumentSectionShell
            v-for="(key, index) in session.order"
            :key="key"
            :session="session"
            :section-key="key"
            :index="index"
            :block="session.blockByKey(key)"
          >
            <OverlayTextBlock
              v-if="session.blockByKey(key)?.kind === 'text'"
              :block="session.blockByKey(key)"
              :session="session"
            />
            <ViewEmbed
              v-else-if="session.blockByKey(key)?.kind === 'view'"
              :view-id="session.blockByKey(key).view?.definitionSnapshot ? '' : (session.blockByKey(key).view?.id || '')"
              :type-id="session.blockByKey(key).view?.typeId || ''"
              :parent-type-id="session.blockByKey(key).view?.parentTypeId || ''"
              :parent-id="session.blockByKey(key).view?.parentId || ''"
              :source-id="session.blockByKey(key).view?.sourceId || ''"
              :fallback-name="session.blockByKey(key).view?.name || ''"
              :pinned-view-state="session.blockByKey(key).view?.definitionSnapshot?.viewState || null"
              :definition-revision="session.blockByKey(key).view?.definitionRevision || ''"
            />
            <PageFileEmbed
              v-else-if="session.blockByKey(key)?.kind === 'file'"
              :file="session.blockByKey(key).file"
            />
            <ReferenceEmbed
              v-else-if="session.blockByKey(key)?.kind === 'reference'"
              :result="referenceByBlockId[key] || null"
            />
            <GraphOutputEmbed
              v-else-if="session.blockByKey(key)?.kind === 'collection'"
              :collection="session.blockByKey(key).collection"
              :resolution="referenceByBlockId[key] || null"
            />
          </DocumentSectionShell>
          <TrailingTextBlock :session="session" />
        </div>
      </div>
    </div>
    <ReferencePickerDialog :visible="session.referencePickerAt !== null" @close="session.closeReferencePicker" @pick="session.pickReference" />
    <GraphOutputPickerDialog :visible="session.graphOutputPickerAt !== null" @close="session.closeGraphOutputPicker" @pick="session.pickGraphOutput" />
    <ViewPickerDialog
      :visible="session.viewPickerAt !== null"
      @close="session.closeViewPicker"
      @pick="session.pickView"
    />
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
// The custom page surface (SPEC §26): one ordered block document — text
// blocks mount their own editor instances, collection blocks mount
// ViewEmbed beside them — persisted through the pages API. A class page
// leads with its class's live collection.
import { computed, inject, onMounted, provide, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import DocumentSectionShell from '~/components/ui-mapping/DocumentSectionShell.vue';
import OverlayTextBlock from './OverlayTextBlock.vue';
import TrailingTextBlock from './TrailingTextBlock.vue';
import ViewEmbed from './ViewEmbed.vue';
import PageFileEmbed from './PageFileEmbed.vue';
import ReferenceEmbed from './ReferenceEmbed.vue';
import ViewPickerDialog from './ViewPickerDialog.vue';
import ReferencePickerDialog from './ReferencePickerDialog.vue';
import GraphOutputEmbed from './GraphOutputEmbed.vue';
import GraphOutputPickerDialog from './GraphOutputPickerDialog.vue';
import GeneratedScreenHost from './GeneratedScreenHost.vue';
import ClassDialog from '~/components/type-designer/ClassDialog.vue';
import { classListScreenForTypeId } from './detail-screen-actions.js';
import { usePageDocumentSession } from '~/composables/usePageDocument.js';
import { usePagesStore } from '~/stores/pages';
import { useAuthStore } from '~/stores/auth';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { spacingClasses, LAYOUT } from '#shared/ui-mapping/index.js';

const props = defineProps({
  docId: { type: String, required: true }
});

const { t } = useI18n();
const pagesStore = usePagesStore();
const authStore = useAuthStore();
const fileTypeView = useFileTypeView();
const tabKey = inject('workspacePageKey', '');
const session = usePageDocumentSession({ docId: computed(() => props.docId), tabKey });
const spacing = spacingClasses(1);
provide('uiMappingSpacing', reactive(spacing));

const classEditorOpen = ref(false);
const referenceResults = ref([]);
const referenceByBlockId = computed(() => Object.fromEntries(referenceResults.value.map(result => [result.blockId, result])));
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

function openClassInstance({ typeId, instanceId } = {}) {
  if (!typeId || !instanceId) return;
  openInstanceInWorkspace({ typeId, instanceId: String(instanceId) });
}

async function refreshReferences() {
  try {
    referenceResults.value = await $fetch(`/api/pages/${encodeURIComponent(props.docId)}/references`);
  } catch {
    referenceResults.value = [];
  }
}

watch(() => session.dirty, async (dirty, previous) => {
  if (!dirty && previous) await refreshReferences();
});

onMounted(async () => {
  await pagesStore.ensureLoaded();
  await pagesStore.loadDocument(props.docId).catch(() => {});
  await refreshReferences();
});
</script>
