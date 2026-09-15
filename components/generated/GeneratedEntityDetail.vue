<template>
  <!-- Flush mode: a bounded operational overload (designer/editor) owns the
       whole file body, so the canonical EntityPage chrome is bypassed and the
       body fills the pane directly instead of scrolling inside it. -->
  <div
    v-if="entity && flush"
    class="flex h-full min-h-0 w-full flex-col"
  >
    <GeneratedEntityDetailBody
      :entity="entity"
      :entity-type="entityType"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      mode="file"
      @refresh="$emit('refresh')"
    />
    <slot />
  </div>
  <EntityPage
    v-else-if="entity"
    :entity="entity"
    :entity-type="entityType"
    :show-trace="!embedded"
    :show-header="!embedded"
    :show-identity="showIdentity || forceIdentityForEditor"
    :trace-exclusions="traceExclusions"
    @refresh="$emit('refresh')"
  >
    <GeneratedEntityDetailBody
      :entity="entity"
      :entity-type="entityType"
      :surface="surface"
      :screen-key="screenKey"
      :actions="resolvedBodyActions"
      :suppress-child-summaries="suppressChildSummaries"
      @refresh="$emit('refresh')"
    />
    <slot />
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
  </EntityPage>
</template>

<script setup>
import { computed, inject, provide, unref } from 'vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import GeneratedEntityDetailBody from '~/components/generated/GeneratedEntityDetailBody.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import { useAuthStore } from '~/stores/auth';
import { entityEditorActionFor, entityEditorForcesIdentity } from '~/components/generated/entity-editor-action.js';
import {
  isGeneratedSurfaceAction,
  resolveGeneratedEntityActions,
  resolveScopedGeneratedActions
} from '~/components/generated/action-visibility.js';
import {
  generatedEntityDetailConsumesAction
} from '~/components/generated/detail-action-ownership.js';

const props = defineProps({
  entityType: { type: String, required: true },
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
const editorActionComponent = computed(() => entityEditorActionFor(props.entityType));
const forceIdentityForEditor = computed(() => entityEditorForcesIdentity(props.entityType));
const parentDisplayedEntityContexts = inject('displayedEntityContexts', computed(() => []));
if (props.flush) {
  provide('displayedEntityContexts', computed(() => [
    ...(unref(parentDisplayedEntityContexts) || []),
    { type: props.entityType, entity: props.entity }
  ]));
}
provide('generatedExecuteAction', (action, entity, context = {}) => {
  emit('execute-action', action, entity, context);
});
const resolvedActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.entity,
  entityType: props.entityType,
  excludedActionIds: props.excludedActions
}));
const resolvedBodyActions = computed(() => resolveGeneratedEntityActions({
  actionIds: props.actions,
  actionManifest: authStore.actionManifest,
  entity: props.entity,
  entityType: props.entityType
}).concat(resolveScopedGeneratedActions({
  actionIds: props.bodyActions,
  actionManifest: authStore.actionManifest
})).filter((action, index, actions) => (
  actions.findIndex(candidate => candidate.actionId === action.actionId) === index
)));
const headerActionIds = computed(() => resolvedActions.value
  .filter(isGeneratedSurfaceAction)
  .filter(action => !generatedEntityDetailConsumesAction(props.entityType, action))
  .map(action => action.actionId));
</script>
