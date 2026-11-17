<template>
  <!-- The lens travels over its own GET, so the region mounts only with
       it: a region seeded before the state lands freezes every view
       model at its empty default. A collection entry carries no saved
       lens and renders the type's live view directly. -->
  <RegionBlock
    v-if="node && (viewState || !viewId)"
    :key="viewKey"
    :node="node"
    :pool="pool"
    :bundle="bundle"
    :view-state="viewState"
    :label="name"
    openable
    :load-type="loadType"
    @open="openInstance"
  />
  <RegionDataState v-else-if="node" :node="node" />
  <!-- A fence naming a deleted (or unloaded-org) view renders its name
       and a quiet empty state. -->
  <div v-else-if="viewsStore.loaded" class="flex flex-col gap-1 py-3">
    <span class="text-label">{{ name }}</span>
    <span class="text-supporting text-muted">{{ t('uiMapping.viewMissing') }}</span>
  </div>
</template>

<script setup>
// The saved-view or collection embed (SPEC §26): a view fence renders
// the chosen lens as a live collection region through the ordinary
// machinery — a minimal single-list-region screen composed by
// composeScreen, materialized by RegionBlock, loaded through the
// instances store list transport (org-scoped, grants respected). A view
// is a lens: it renders whatever the current member can read and
// carries no access of its own. A collection entry names its type and
// keeps the region's view tabs live.
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RegionBlock from '~/components/ui-mapping/RegionBlock.vue';
import RegionDataState from '~/components/ui-mapping/RegionDataState.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useViewsStore } from '~/stores/views';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { generatedDetailScreenForTypeId } from './detail-screen-actions.js';
import { composeScreen, statePolicyByType, stateTransitionsByType } from '#shared/ui-mapping/index.js';

const props = defineProps({
  viewId: { type: String, default: '' },
  // A collection entry's type id (no saved lens).
  typeId: { type: String, default: '' },
  // A record's child collection: the parent record and its detail-screen
  // child source.
  parentTypeId: { type: String, default: '' },
  parentId: { type: String, default: '' },
  sourceId: { type: String, default: '' },
  // The name the fence carried at authoring time — the deleted-view
  // title and the fallback while the store loads.
  fallbackName: { type: String, default: '' },
  pinnedViewState: { type: Object, default: null },
  definitionRevision: { type: String, default: '' }
});

const { te, t } = useI18n();
const authStore = useAuthStore();
const instancesStore = useInstancesStore();
const viewsStore = useViewsStore();

const view = computed(() => (props.viewId ? viewsStore.viewById(props.viewId) : null));
const targetTypeId = computed(() => view.value?.typeId || props.typeId);
const viewState = computed(() => props.pinnedViewState || (props.viewId ? (viewsStore.viewStates[props.viewId] || null) : null));
const typeLabel = computed(() => {
  const type = (authStore.processPayload?.bundle?.types || []).find(candidate => candidate.id === targetTypeId.value);
  return type ? generatedEntityLabel(type, { t, te }) : '';
});
const name = computed(() => view.value?.name || props.fallbackName || typeLabel.value);
const viewKey = computed(() => view.value?._id || `type:${targetTypeId.value}:${props.definitionRevision || 'live'}`);

const pool = computed(() => instancesStore.instancePool);
const bundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const contract = computed(() => {
  const producerOutputs = authStore.processPayload?.producerOutputs || {};
  return {
    actions: {},
    statePolicy: statePolicyByType(producerOutputs, bundle.value.types || []),
    stateTransitions: stateTransitionsByType(producerOutputs)
  };
});

const recordScoped = computed(() => Boolean(props.parentTypeId && props.parentId));
const parentDetail = computed(() => (recordScoped.value
  ? generatedDetailScreenForTypeId({
    screens: authStore.screenManifest || [],
    typeId: props.parentTypeId
  })
  : null));
const parentRegion = computed(() => {
  const detail = parentDetail.value;
  if (!detail) return null;
  const region = (detail.regions || []).find(candidate => candidate.slot === 'children'
    && (props.sourceId
      ? candidate.sourceId === props.sourceId
      : (detail.sources || []).some(source => source.id === candidate.sourceId
        && String(source.typeId) === String(targetTypeId.value))));
  if (!region) return null;
  const source = (detail.sources || []).find(candidate => candidate.id === region.sourceId);
  return source ? { region, source } : null;
});
const collectionSourceId = computed(() => parentRegion.value?.source?.id || targetTypeId.value);

// The collection region: a record's child collection composes the parent
// detail screen's child source over the parent scope; a type entry keeps
// the minimal single-list-region screen. Both render through the same
// collection machinery, with no actions: creation and quick actions
// belong to the collection's own screens, and the embed renders the lens.
const screen = computed(() => {
  if (!targetTypeId.value) return null;
  if (recordScoped.value && parentDetail.value && parentRegion.value) {
    return {
      id: `view:${viewKey.value}`,
      screenKey: `view:${viewKey.value}`,
      template: 'typeList',
      typeId: props.parentTypeId,
      scope: { instanceId: props.parentId },
      sources: parentDetail.value.sources,
      regions: [{ ...parentRegion.value.region, slot: 'main' }]
    };
  }
  return {
    id: `view:${viewKey.value}`,
    screenKey: `view:${viewKey.value}`,
    template: 'typeList',
    typeId: targetTypeId.value,
    sources: [{ id: targetTypeId.value, typeId: targetTypeId.value }],
    regions: [{ id: 'main', slot: 'main', sourceId: targetTypeId.value }]
  };
});

// Source state: loading only while the fetch is in flight; the pool
// itself derives ready/empty at compose time, so an already-loaded type
// renders at once on both sides of hydration. A pending lens is a
// loading region whatever the pool holds — the region cannot render.
const fetchState = ref(null);
const parentReady = ref(!recordScoped.value
  || Boolean(pool.value[props.parentTypeId]?.[props.parentId]));
const lensPending = computed(() => Boolean(view.value) && props.viewId && viewState.value === null);
const sourceState = computed(() => {
  if (lensPending.value || !parentReady.value) return 'loading';
  return fetchState.value
    ?? (Object.keys(pool.value[targetTypeId.value] || {}).length ? 'ready' : 'loading');
});

const composed = computed(() => (screen.value
  ? composeScreen(screen.value, contract.value, bundle.value, pool.value, {
    sourceStates: { [collectionSourceId.value]: sourceState.value }
  })
  : null));
const node = computed(() => composed.value?.regions?.[0] || null);

async function loadType(typeId) {
  const key = instancesStore.canonicalTypeKey(typeId);
  if (!key) return [];
  await instancesStore.listInstances(key);
  return Object.values(instancesStore.instancePool?.[key] || {});
}

function openInstance(instance) {
  if (!instance?.type || !instance?.id) return;
  openInstanceInWorkspace({ typeId: instance.type, instanceId: String(instance.id) });
}

onMounted(async () => {
  await viewsStore.ensureLoaded().catch(() => {});
  if (props.viewId && !view.value) return;
  if (props.viewId) {
    try {
      await viewsStore.loadView(props.viewId);
    } catch {
      return;
    }
  }
  if (!targetTypeId.value) return;
  if (recordScoped.value) {
    const parentKey = instancesStore.canonicalTypeKey(props.parentTypeId);
    if (parentKey) {
      try {
        await instancesStore.fetchInstance(parentKey, props.parentId);
      } catch {
        // The child source resolves to an empty set without its parent.
      }
    }
    parentReady.value = true;
  }
  const typeKey = instancesStore.canonicalTypeKey(targetTypeId.value);
  if (!typeKey) return;
  fetchState.value = 'loading';
  try {
    await instancesStore.listInstances(typeKey);
    fetchState.value = Object.keys(instancesStore.instancePool?.[typeKey] || {}).length ? 'ready' : 'empty';
  } catch (error) {
    const denied = error?.status === 403 || error?.statusCode === 403 || error?.data?.statusCode === 403;
    fetchState.value = denied ? 'denied' : 'error';
  }
});
</script>
