<template>
  <!-- Flush mode: a bounded operational overload (designer/editor) owns the
       whole file body, so the canonical InstancePage chrome is bypassed and the
       body fills the pane directly instead of scrolling inside it. The column
       therefore carries no inline thread: an in-flow section would either
       collapse against the h-full body or force the pane to scroll, breaking
       the bounded-editor contract. Bounded hosts expose the conversation
       through the shared chat popup instead (the pane's own action strip, the
       same route every other instance surface uses). -->
  <div
    v-if="instance && flush"
    class="flex h-full min-h-0 w-full flex-col"
  >
    <GeneratedInstanceDetailBody
      :instance="instance"
      :type-id="typeId"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      mode="file"
      @refresh="$emit('refresh')"
    />
    <slot />
  </div>
  <InstancePage
    v-else-if="instance"
    :instance="instance"
    :type-id="typeId"
    :show-trace="!embedded"
    :show-header="!embedded"
    :show-identity="showIdentity || forceIdentityForEditor"
    :trace-exclusions="traceExclusions"
    @refresh="$emit('refresh')"
  >
    <GeneratedInstanceDetailBody
      :instance="instance"
      :type-id="typeId"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      @refresh="$emit('refresh')"
    />
    <slot />
    <!-- The conversation is a SIDEBAR RAIL, not a section appended to the
         main column: InstancePage already owns the two-track detail layout
         (body + sidebar from 48rem), and a rail is what that slot is for. A
         bottom disclosure buried the thread under the whole body, made it
         undiscoverable, and broke the page's reading order. -->
    <template #sidebar>
      <InstanceChatPanel :type="typeId" :id="instanceIdValue" :name="instanceNameValue" />
    </template>
    <template v-if="editorActionComponent || headerActionIds.length" #actions>
      <component
        :is="editorActionComponent"
        v-if="editorActionComponent"
        :instance="instance"
        menu-item
        :open-in-workspace="openActionsInWorkspace"
        @open-page="page => $emit('open-page', page)"
        @refresh="$emit('refresh')"
      />
      <GeneratedActionButton
        v-for="actionId in headerActionIds"
        :key="actionId"
        :action-id="actionId"
        menu-item
        @execute="action => $emit('execute-action', action, instance)"
      />
    </template>
  </InstancePage>
</template>

<script setup>
import { computed, inject, provide, unref } from 'vue';
import InstancePage from '~/components/shared/InstancePage.vue';
import GeneratedInstanceDetailBody from '~/components/generated/GeneratedInstanceDetailBody.vue';
import InstanceChatPanel from '~/components/shared/InstanceChatPanel.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useAuthStore } from '~/stores/auth';
import { instanceEditorActionFor, instanceEditorForcesIdentity } from '~/components/generated/instance-editor-action.js';
import {
  isGeneratedSurfaceAction,
  resolveGeneratedEntityActions,
  resolveScopedGeneratedActions
} from '~/components/generated/action-visibility.js';
import {
  generatedInstanceDetailConsumesAction
} from '~/components/generated/detail-action-ownership.js';

const props = defineProps({
  typeId: { type: String, required: true },
  instance: { type: Object, default: null },
  surface: { type: String, default: 'detail' },
  screenKey: { type: String, default: '' },
  excludedActions: { type: Array, default: () => [] },
  bodyActions: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] },
  showIdentity: { type: Boolean, default: false },
  openActionsInWorkspace: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  flush: { type: Boolean, default: false },
  suppressChildSummaries: { type: Boolean, default: false },
  traceExclusions: { type: Array, default: () => [] }
});

const emit = defineEmits(['refresh', 'execute-action', 'open-page']);

const authStore = useAuthStore();
const instanceNameValue = computed(() => props.instance?.identity?.name || '');
const instanceIdValue = computed(() => {
  const id = props.instance?._id || props.instance?.id || props.instance?.identity?.uid || '';
  return id ? String(id) : '';
});
const editorActionComponent = computed(() => instanceEditorActionFor(props.typeId));
const forceIdentityForEditor = computed(() => instanceEditorForcesIdentity(props.typeId));
const parentDisplayedEntityContexts = inject('displayedEntityContexts', computed(() => []));
if (props.flush) {
  provide('displayedEntityContexts', computed(() => [
    ...(unref(parentDisplayedEntityContexts) || []),
    { type: props.typeId, entity: props.instance }
  ]));
}
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.instance,
  typeId: props.typeId,
  excludedActionIds: props.excludedActions
}));
const resolvedBodyActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.instance,
  typeId: props.typeId
}).concat(resolveScopedGeneratedActions({
  actionIds: props.bodyActions,
  actionManifest: authStore.actionManifest
})).filter((action, index, actions) => (
  actions.findIndex(candidate => candidate.id === action.id) === index
)));
const headerActionIds = computed(() => resolvedActions.value
  .filter(isGeneratedSurfaceAction)
  .filter(action => !generatedInstanceDetailConsumesAction(props.typeId, action))
  .map(action => action.id));
</script>
