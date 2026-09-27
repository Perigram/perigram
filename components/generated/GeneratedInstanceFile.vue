<template>
  <section
    v-if="item?.entity"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <div data-pane-header class="flex h-8 shrink-0 items-stretch border-b border-chrome-border">
      <GeneratedWorkspaceTabs
        :tabs="tabs"
        :active-key="item.key"
        @select="$emit('select-tab', $event)"
        @close="$emit('close-tab', $event)"
        @add="$emit('add-tab', $event)"
        @refresh="$emit('refresh')"
      />
      <div class="flex shrink-0 items-center pr-1">
        <GeneratedWorkspacePaneMenu
          :splittable="splittable"
          :closeable="closeable"
          @split="$emit('split', $event)"
          @close="$emit('close')"
        />
      </div>
    </div>

    <div
      v-if="tabActionIds.length || boundedDetail"
      class="flex shrink-0 flex-wrap items-center justify-end gap-1 border-b border-content-border px-2 py-1"
      data-tab-actions
    >
      <GeneratedActionButton
        v-for="actionId in tabActionIds"
        :key="actionId"
        :action-id="actionId"
        @execute="executeAction"
      />
      <!-- A bounded detail host cannot carry the inline conversation section:
           its column is an h-full no-scroll frame, so an in-flow thread would
           collapse against the body. The pane therefore exposes the thread
           through the shared chat popup, the same route every other entity
           surface uses. -->
      <Button
        v-if="boundedDetail"
        icon="pi pi-comments"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('support.instanceChat')"
        @click="openInstanceChat"
      />
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
import Button from 'primevue/button';
import GeneratedInstanceDetail from '~/components/generated/GeneratedInstanceDetail.vue';
import { resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import GeneratedWorkspaceTabs from '~/components/generated/GeneratedWorkspaceTabs.vue';
import GeneratedWorkspacePaneMenu from '~/components/generated/GeneratedWorkspacePaneMenu.vue';
import GeneratedActionButton from '~/components/generated/GeneratedActionButton.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { actionAppliesToEntity, isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { generatedInstanceDetailConsumesAction } from '~/components/generated/detail-action-ownership.js';
import { generatedActionRendersAt } from '~/components/generated/action-placement.js';
import { openInstanceChat as openSharedInstanceChat } from '~/utils/instance-chat.js';
import {
  generatedDetailActionIds,
  generatedDetailScreenForTypeId
} from '~/components/generated/detail-screen-actions.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, default: null },
  tabs: { type: Array, default: () => [] },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  showGeneratedActions: { type: Boolean, default: true }
});

const emit = defineEmits(['execute-action', 'open-entity', 'open-page', 'refresh', 'select-tab', 'close-tab', 'add-tab', 'split', 'close']);
const authStore = useAuthStore();
const instanceId = computed(() => props.item?.entity?._id || props.item?.entity?.identity?.uid || '');
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
// The bounded pane's conversation entry: the shared chat popup, the one route
// every entity surface opens its thread through.
function openInstanceChat() {
  openSharedInstanceChat({
    type: props.item?.type || '',
    id: instanceId.value,
    name: props.item?.entity?.identity?.name || ''
  });
}
const detailChildActionIds = computed(() => [...new Set(detailChildRegions.value.flatMap(region => region.actions || []))]);
const detailActionContext = computed(() => ({
  parentInstance: props.item?.entity || null,
  parentTypeId: props.item?.type || ''
}));
const detailErrorMessage = computed(() => detailError.value?.data?.message || detailError.value?.message || '');
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
