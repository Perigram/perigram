<template>
  <section
    v-if="definition"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <!-- The pane's content shell: non-flush pages (the organization
         management surfaces) render inside the padded scroll area every
         other pane surface uses; flush pages (canvas designer, call
         stage, self-padding directory surface) own their own shell. A
         record-bound page carrying its own record header (the editor
         page) renders its lineage through that header; the page host's
         lineage strip serves the rest. -->
    <div class="relative flex min-h-0 flex-1 flex-col">
      <div :class="definition.flush ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-4'">
        <TraceChain
          v-if="page.entity && !definition.recordHeader"
          :entity="page.entity"
          :type-id="page.typeId || ''"
          :class="definition.flush ? 'px-4 pt-3' : 'pb-2'"
        />
        <!-- Every editor page resolves the same loader component; the page
             key is what gives each tab its own content instance. -->
        <component
          :is="definition.component"
          :key="page.key"
          v-bind="pageProps"
          @open-page="page => $emit('open-page', page)"
          @open-call="request => $emit('open-call', request)"
          @closed="$emit('close-tab', page.key)"
          @refresh="$emit('refresh')"
        />
      </div>
      <RecordCommentsPanel :target="commentsTarget" @close="commentsTarget = null" />
    </div>
  </section>
</template>

<script setup>
import { computed, provide, ref } from 'vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import RecordCommentsPanel from '~/components/chat/RecordCommentsPanel.vue';
import { resolveGeneratedWorkspacePage } from '~/components/generated/workspace-pages.js';

const props = defineProps({
  page: { type: Object, required: true }
});

provide('workspacePageKey', props.page?.key);

// The page host's comments channel (SPEC §22.17): the hosted surfaces'
// headers open the record's thread as the bounded side panel here.
const commentsTarget = ref(null);
provide('recordCommentsPanel', target => {
  commentsTarget.value = commentsTarget.value?.instanceId === target.instanceId
    && commentsTarget.value?.typeId === target.typeId
    ? null
    : target;
});

defineEmits(['open-page', 'open-call', 'refresh', 'close-tab']);

const definition = computed(() => resolveGeneratedWorkspacePage(props.page?.pageId));
const pageProps = computed(() => definition.value?.props?.(props.page) || {});
</script>
