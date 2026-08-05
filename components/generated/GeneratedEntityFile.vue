<template>
  <section
    v-if="item?.entity"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-content"
  >
    <header class="flex h-10 shrink-0 items-center justify-end gap-2 border-b [border-color:var(--ck-chrome-border)] bg-chrome px-2 text-[var(--ck-chrome-foreground)]">
      <Button
        v-if="splittable"
        icon="pi pi-arrows-h"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitRight')"
        @click="$emit('split', 'horizontal')"
      />
      <Button
        v-if="splittable"
        icon="pi pi-arrows-v"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('project.splitDown')"
        @click="$emit('split', 'vertical')"
      />
      <Button
        v-if="closeable"
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        :aria-label="$t('common.close')"
        @click="$emit('close')"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <GeneratedEntityDetail
        :key="`${item.type}:${entityId}`"
        :entity="item.entity"
        :entity-type="item.type"
        :screen-key="detailScreen?.screenKey || detailScreen?.id || ''"
        :actions="resolvedActionIds"
        :excluded-actions="detailChildActionIds"
        show-identity
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
            template="entityDetail"
            :screen-actions="[]"
            :action-context="detailActionContext"
            @refresh="refreshFile"
            @execute-action="executeAction"
          />
        </template>
      </GeneratedEntityDetail>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import GeneratedEntityDetail from '~/components/generated/GeneratedEntityDetail.vue';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import {
  generatedDetailActionIds,
  generatedDetailScreenForEntityType
} from '~/components/generated/detail-screen-actions.js';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  item: { type: Object, default: null },
  actionEntries: { type: Array, default: () => [] },
  closeable: { type: Boolean, default: false },
  splittable: { type: Boolean, default: true },
  showGeneratedActions: { type: Boolean, default: true }
});

const emit = defineEmits(['execute-action', 'open-page', 'refresh', 'split', 'close']);
const authStore = useAuthStore();
const entityId = computed(() => props.item?.entity?._id || props.item?.entity?.identity?.uid || '');
const detailScreen = computed(() => generatedDetailScreenForEntityType({
  screens: authStore.screenManifest,
  entityType: props.item?.type
}));
const scopedDetailScreen = computed(() => detailScreen.value ? {
  ...detailScreen.value,
  scope: {
    ...(detailScreen.value.scope || {}),
    entityId: entityId.value,
    [`${props.item?.type}Id`]: entityId.value
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
const detailChildActionIds = computed(() => [...new Set(detailChildRegions.value.flatMap(region => region.actions || []))]);
const detailActionContext = computed(() => ({
  parentEntity: props.item?.entity || null,
  parentEntityType: props.item?.type || ''
}));
const detailErrorMessage = computed(() => detailError.value?.data?.message || detailError.value?.message || '');
const ownDetailActionIds = computed(() => props.showGeneratedActions
  ? generatedDetailActionIds({
      screens: authStore.screenManifest,
      entityType: props.item?.type,
      preferredRoute: detailScreen.value?.route || ''
    })
  : []);
const resolvedEntries = computed(() => {
  const context = props.actionEntries[0]?.context || {};
  const ownEntries = ownDetailActionIds.value.map(actionId => ({
    key: `detail:${props.item?.type}:${entityId.value}:${actionId}`,
    actionId,
    entity: props.item?.entity,
    context
  }));
  return Array.from(new Map([...ownEntries, ...props.actionEntries]
    .filter(entry => {
      const action = authStore.actionManifest.find(item => item.actionId === entry.actionId);
      return action && actionAppliesToEntity(action, props.item?.entity, props.item?.type);
    })
    .map(entry => [entry.actionId, entry])
  ).values());
});
const resolvedActionIds = computed(() => resolvedEntries.value.map(entry => entry.actionId));

function executeAction(action, entity = null, context = {}) {
  const entry = resolvedEntries.value.find(item => item.actionId === action.actionId) || {
    actionId: action.actionId,
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
