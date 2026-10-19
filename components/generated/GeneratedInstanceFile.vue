<template>
  <section
    v-if="item?.entity"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <GeneratedPaneHeader
      :tabs="tabs"
      :active-key="item.key"
      :closeable="closeable"
      :splittable="splittable"
      :back="back"
      @back="$emit('back')"
      @select-tab="$emit('select-tab', $event)"
      @close-tab="$emit('close-tab', $event)"
      @add="$emit('add-tab', $event)"
      @split="orientation => $emit('split', orientation)"
      @close="$emit('close')"
    />

    <div
      v-if="tabActionIds.length || boundedDetail || editorActionComponent"
      class="flex shrink-0 flex-wrap items-center justify-end gap-1 border-b border-content-border px-2 py-1"
      data-tab-actions
    >
      <component
        :is="editorActionComponent"
        v-if="editorActionComponent"
        :entity="item.entity"
        :type-id="item.type"
        :open-in-workspace="true"
        @open-page="page => $emit('open-page', page)"
        @refresh="refreshFile"
      />
      <GeneratedActionButton
        v-for="actionId in tabActionIds"
        :key="actionId"
        :action-id="actionId"
        @execute="executeAction"
      />
      <!-- A bounded detail host exposes the thread through the shared chat
           popup: its column is an h-full no-scroll frame, so an in-flow
           section would collapse against the body. -->
      <InstanceChatEntry v-if="boundedDetail" :type-id="item.type" :instance="item.entity" :name="identityLabel" />
    </div>

    <div :class="boundedDetail ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto p-4'">
      <GeneratedInstanceDetail
        :key="`${item.type}:${instanceId}`"
        :flush="boundedDetail"
        :instance="item.entity"
        :type-id="item.type"
        :screen-key="detailScreen?.screenKey || detailScreen?.id || ''"
        :actions="resolvedActionIds"
        :excluded-actions="detailChildActionIds"
        :body-actions="detailChildActionIds"
        :suppress-child-summaries="detailChildRegions.length > 0"
        embedded
        open-actions-in-workspace
        @execute-action="executeAction"
        @open-page="page => $emit('open-page', page)"
        @refresh="refreshFile"
      >
        <StateBlock v-if="detailLoading" state="loading" :message="$t('common.loading')" />
        <StateBlock v-else-if="detailError" state="error" :message="detailErrorMessage || $t('generatedScreen.loadFailed')" />
        <template v-else>
          <GeneratedRegion
            v-for="region in detailChildRegions"
            :key="region.id"
            :region="region"
            :screen-key="detailScreen?.screenKey || detailScreen?.id || ''"
            :source-state="detailSourceState(region.sourceId)"
            template="instanceDetail"
            :screen-actions="[]"
            :action-context="detailActionContext"
            open-in-workspace
            @refresh="refreshFile"
            @open-entity="request => $emit('open-entity', request)"
            @open-page="page => $emit('open-page', page)"
            @execute-action="executeAction"
          />
        </template>
      </GeneratedInstanceDetail>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import GeneratedInstanceDetail from '~/components/generated/GeneratedInstanceDetail.vue';
import { resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import GeneratedPaneHeader from '~/components/generated/GeneratedPaneHeader.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { actionAppliesToEntity, isFieldEditAction, isGeneratedSurfaceAction } from '~/utils/action-visibility.js';
import { generatedInstanceDetailConsumesAction } from '~/components/generated/detail-action-ownership.js';
import { instanceEditorActionFor } from '~/components/generated/instance-editor-action.js';
import { generatedActionRendersAt } from '~/components/generated/action-placement.js';
import InstanceChatEntry from '~/components/shared/InstanceChatEntry.vue';
import {
  generatedDetailActionIds,
  generatedDetailScreenForTypeId
} from '~/components/generated/detail-screen-actions.js';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { useI18n } from 'vue-i18n';
import { titleFor } from '#shared/ui-mapping/index.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';

const props = defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  showGeneratedActions: { type: Boolean, default: true },
  back: { type: Boolean, default: false }
});

const emit = defineEmits(['execute-action', 'open-entity', 'open-page', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close', 'back']);
const authStore = useAuthStore();
const registry = useRegistryStore();
const { t } = useI18n();
const instanceId = computed(() => props.item?.entity?._id || props.item?.entity?.id || '');
const detailScreen = computed(() => generatedDetailScreenForTypeId({
  screens: authStore.screenManifest,
  typeId: props.item?.type
}));
const scopedDetailScreen = computed(() => detailScreen.value ? {
  ...detailScreen.value,
  scope: {
    ...(detailScreen.value.scope || {}),
    instanceId: instanceId.value,
    [`${props.item?.type}Id`]: instanceId.value
  }
} : {});
const {
  screen: loadedDetailScreen,
  loading: detailLoading,
  error: detailError,
  load: loadDetailScreen,
  sourceState: detailSourceState
} = useGeneratedScreen(scopedDetailScreen);
const detailMainRegion = computed(() => loadedDetailScreen.value.regions.find(region => (
  detailSourceState(region.sourceId).source?.mode === 'single'
)) || loadedDetailScreen.value.regions[0] || null);
const detailChildRegions = computed(() => loadedDetailScreen.value.regions.filter(region => region !== detailMainRegion.value));
// Bounded operational overloads (designers/editors) own the whole file body:
// without child regions they fill the pane directly instead of scrolling
// inside it through the canonical InstancePage chrome.
const boundedDetail = computed(() => (
    Boolean(resolveGeneratedInstanceDetailOverload(props.item?.type))
    && detailChildRegions.value.length === 0
));
// The chat target's display name resolves through the one title resolver
// (the declared identifier field value; unnamed otherwise).
const chatTypeView = computed(() => registry.typeRecord(props.item?.type));
const identityLabel = computed(() => titleFor(
    chatTypeView.value ? dtoToScreenInstance(props.item?.entity, chatTypeView.value) : null,
    chatTypeView.value,
    { unnamedLabel: t('common.unnamed') }
));
const detailChildActionIds = computed(() => [...new Set(detailChildRegions.value.flatMap(region => region.actions || []))]);
const detailActionContext = computed(() => ({
  parentInstance: props.item?.entity || null,
  parentTypeId: props.item?.type || ''
}));
const detailErrorMessage = computed(() => detailError.value?.data?.message || detailError.value?.message || '');
const editorActionComponent = computed(() => instanceEditorActionFor(props.item?.type));
const ownDetailActionIds = computed(() => props.showGeneratedActions
  ? generatedDetailActionIds({
      screens: authStore.screenManifest,
      typeId: props.item?.type,
      preferredRoute: detailScreen.value?.route || ''
    })
  : []);
const resolvedEntries = computed(() => {
  const context = props.actionEntries[0]?.context || {};
  const ownEntries = ownDetailActionIds.value.map(actionId => ({
    key: `detail:${props.item?.type}:${instanceId.value}:${actionId}`,
    actionId,
    entity: props.item?.entity,
    context
  }));
  return Array.from(new Map([...ownEntries, ...props.actionEntries]
    .filter(entry => {
      const action = authStore.actionManifest.find(item => item.id === entry.id);
      return action && actionAppliesToEntity(action, props.item?.entity, props.item?.type);
    })
    .map(entry => [entry.id, entry])
  ).values());
});
const resolvedActionIds = computed(() => resolvedEntries.value.map(entry => entry.id));
const tabActionIds = computed(() => resolvedEntries.value
  .map(entry => authStore.actionManifest.find(action => action.id === entry.id))
  .filter(action => action && !detailChildActionIds.value.includes(action.id))
  .filter(isGeneratedSurfaceAction)
  .filter(action => !isFieldEditAction(action))
  .filter(action => generatedActionRendersAt(action, ['entity', 'relation']))
  .filter(action => !generatedInstanceDetailConsumesAction(props.item?.type, action))
  .map(action => action.id));

function executeAction(action, entity = null, context = {}) {
  const entry = resolvedEntries.value.find(item => item.id === action.id) || {
    actionId: action.id,
    entity: entity || props.item?.entity,
    context: Object.keys(context || {}).length ? context : detailActionContext.value
  };
  emit('execute-action', action, entry);
}

async function refreshFile() {
  await loadDetailScreen();
  emit('refresh');
}
</script>
