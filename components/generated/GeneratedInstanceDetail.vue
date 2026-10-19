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
           conversation affordance. -->
      <InstanceChatEntry :type-id="typeId" :instance="instance" :name="identityLabel" />
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
import InstanceChatEntry from '~/components/shared/InstanceChatEntry.vue';
import { useI18n } from 'vue-i18n';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { useRegistryStore } from '~/stores/registry';
import { useAuthStore } from '~/stores/auth';
import { instanceEditorActionFor } from '~/components/generated/instance-editor-action.js';
import {
  isGeneratedSurfaceAction,
  isFieldEditAction,
  resolveGeneratedEntityActions,
  resolveScopedGeneratedActions
} from '~/utils/action-visibility.js';
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

const { t } = useI18n();
const authStore = useAuthStore();
const registry = useRegistryStore();
// The chat target's display name resolves through the one title resolver
// (the declared identifier field value; unnamed otherwise).
const typeView = computed(() => registry.typeRecord(props.typeId));
const identityLabel = computed(() => titleFor(
  typeView.value ? dtoToScreenInstance(props.instance, typeView.value) : null,
  typeView.value,
  { unnamedLabel: t('common.unnamed') }
));
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
  .filter(action => !isFieldEditAction(action))
  .filter(action => !generatedInstanceDetailConsumesAction(props.typeId, action))
  .map(action => action.id));
</script>
