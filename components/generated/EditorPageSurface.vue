<template>
  <!-- The editor page (SPEC §4, owner direction 2026-11-07): the
       workspace pane tab an editor-bound record opens as, and the blank
       editor page — the unified header over the editor flush. The
       header's chrome binding carries the editor's name, save, and
       dirty state; the page host's comments channel reaches the header
       the same way the record document's does. An ownsChrome surface
       renders the editor alone: its own dock carries the identity. -->
  <div class="flex h-full min-h-0 flex-1 flex-col">
    <SurfaceHeader
      v-if="!editor.ownsChrome"
      :type="typeRecord"
      :instance="record"
      :chrome="chrome"
      :state-policy="statePolicyForType"
      :level="0"
    />
    <div class="relative flex min-h-0 flex-1 flex-col">
      <component :is="editor.component" v-bind="editorProps" :page-chrome="chrome" />
    </div>
  </div>
</template>

<script setup>
import { computed, inject, watch } from 'vue';
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import { createEditorChrome } from '~/components/generated/editor-page-chrome.js';
import { setWorkspacePageDirty } from '~/utils/workspace-page-dirty.js';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { statePolicyByType } from '#shared/ui-mapping/index.js';

// The editor page host for the file-surface registry's workspace-page
// mount: header + flush editor, entity-bound or blank. The compiled
// action contract stays with the record document's screens — the editor
// page carries the header's state surface alone.
const props = defineProps({
  // The file-surface workspacePage presentation (`{ component, props }`).
  editor: { type: Object, required: true },
  entity: { type: Object, default: null },
  typeId: { type: String, required: true }
});

const authStore = useAuthStore();
const registryStore = useRegistryStore();

const typeRecord = computed(() => registryStore.typeRecord(props.typeId));
const record = computed(() => props.entity || null);
const statePolicyForType = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}, authStore.processPayload?.bundle?.types || [])[props.typeId] || null);

const chrome = createEditorChrome();
const tabKey = inject('workspacePageKey', '');
if (import.meta.client) {
  watch(() => chrome.api?.dirty, dirty => {
    setWorkspacePageDirty(tabKey, Boolean(dirty));
  });
}

const editorProps = computed(() => props.editor.props?.({
  entity: props.entity,
  instanceId: props.entity?._id || props.entity?.id || '',
  typeId: props.typeId
}, props.typeId) || {});
</script>
