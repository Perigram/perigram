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
    :show-identity="showIdentity"
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
    <template #actions>
      <!-- The composed instance-chat entry: the record header owns the
           conversation affordance — no embedded comments section. -->
      <Button
        icon="pi pi-comments"
        text
        rounded
        severity="secondary"
        :aria-label="$t('support.openChat')"
        :title="$t('support.openChat')"
        @click="openConversation"
      />
      <component
        :is="editorActionComponent"
        v-if="editorActionComponent"
        :entity="instance"
        :type-id="typeId"
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
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import Button from 'primevue/button';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { useAuthStore } from '~/stores/auth';
import { instanceEditorActionFor } from '~/components/generated/instance-editor-action.js';
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
// The header's conversation entry: same seam as the card/pane chat
// actions — a user-typed record opens the direct thread, every other
// type the composed instance thread.
const openConversation = () => {
  if (!instanceIdValue.value) return;
  openInstanceChat({ type: props.typeId, id: instanceIdValue.value, name: instanceNameValue.value });
};
const instanceIdValue = computed(() => {
  const id = props.instance?._id || props.instance?.id || props.instance?.identity?.uid || '';
  return id ? String(id) : '';
});
const editorActionComponent = computed(() => instanceEditorActionFor(props.typeId));
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
