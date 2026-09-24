<template>
  <!-- Flush mode: a bounded operational overload (designer/editor) owns the
       whole file body, so the canonical InstancePage chrome is bypassed and the
       body fills the pane directly instead of scrolling inside it. The
       overflow boundary owns the scroll so the thread section below the body
       stays reachable — the body alone must not claim the full height, or the
       thread collapses to nothing. -->
  <div
    v-if="entity && flush"
    class="flex h-full min-h-0 w-full flex-col overflow-y-auto"
  >
    <GeneratedInstanceDetailBody
      :entity="entity"
      :type-id="typeId"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      mode="file"
      class="shrink-0"
      @refresh="$emit('refresh')"
    />
    <!-- The instance conversation rides the detail column in BOTH branches, so
         abstract detail pages and bounded overloads (workspace editors, file
         modes) carry the same thread. -->
    <InstanceChatPanel :type="typeId" :id="instanceIdValue" :name="entityNameValue" />
    <slot />
  </div>
  <InstancePage
    v-else-if="entity"
    :entity="entity"
    :type-id="typeId"
    :show-trace="!embedded"
    :show-header="!embedded"
    :show-identity="showIdentity || forceIdentityForEditor"
    :trace-exclusions="traceExclusions"
    @refresh="$emit('refresh')"
  >
    <GeneratedInstanceDetailBody
      :entity="entity"
      :type-id="typeId"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      @refresh="$emit('refresh')"
    />
    <slot />
    <InstanceChatPanel :type="typeId" :id="instanceIdValue" :name="entityNameValue" />
    <template v-if="editorActionComponent || headerActionIds.length" #actions>
      <component
        :is="editorActionComponent"
        v-if="editorActionComponent"
        :entity="entity"
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
        @execute="action => $emit('execute-action', action, entity)"
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
  generatedEntityDetailConsumesAction
} from '~/components/generated/detail-action-ownership.js';

const props = defineProps({
  typeId: { type: String, required: true },
  entity: { type: Object, default: null },
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
const entityNameValue = computed(() => props.entity?.identity?.name || '');
const instanceIdValue = computed(() => {
  const id = props.entity?._id || props.entity?.id || props.entity?.identity?.uid || '';
  return id ? String(id) : '';
});
const editorActionComponent = computed(() => instanceEditorActionFor(props.typeId));
const forceIdentityForEditor = computed(() => instanceEditorForcesIdentity(props.typeId));
const parentDisplayedEntityContexts = inject('displayedEntityContexts', computed(() => []));
if (props.flush) {
  provide('displayedEntityContexts', computed(() => [
    ...(unref(parentDisplayedEntityContexts) || []),
    { type: props.typeId, entity: props.entity }
  ]));
}
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.entity,
  typeId: props.typeId,
  excludedActionIds: props.excludedActions
}));
const resolvedBodyActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.entity,
  typeId: props.typeId
}).concat(resolveScopedGeneratedActions({
  actionIds: props.bodyActions,
  actionManifest: authStore.actionManifest
})).filter((action, index, actions) => (
  actions.findIndex(candidate => candidate.id === action.id) === index
)));
const headerActionIds = computed(() => resolvedActions.value
  .filter(isGeneratedSurfaceAction)
  .filter(action => !generatedEntityDetailConsumesAction(props.typeId, action))
  .map(action => action.id));
</script>
