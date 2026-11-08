<template>
  <!-- The lens travels over its own GET, so the region mounts only with
       it: a region seeded before the state lands freezes every view
       model at its empty default. -->
  <RegionBlock
    v-if="node && viewState"
    :key="view._id"
    :node="node"
    :pool="pool"
    :bundle="bundle"
    :view-state="viewState"
    :label="view.name"
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
// The saved-view embed (SPEC §26): a page's view fence renders the
// saved lens as a live collection region through the ordinary machinery
// — a minimal single-list-region screen composed by composeScreen,
// materialized by RegionBlock, loaded through the instances store list
// transport (org-scoped, grants respected). A view is a lens: it
// renders whatever the current member can read and carries no access
// of its own.
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RegionBlock from '~/components/ui-mapping/RegionBlock.vue';
import RegionDataState from '~/components/ui-mapping/RegionDataState.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useViewsStore } from '~/stores/views';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { composeScreen, statePolicyByType, stateTransitionsByType } from '#shared/ui-mapping/index.js';

const props = defineProps({
  viewId: { type: String, required: true },
  // The name the fence carried at authoring time — the deleted-view
  // title and the fallback while the store loads.
  fallbackName: { type: String, default: '' }
});

const { t } = useI18n();
const authStore = useAuthStore();
const instancesStore = useInstancesStore();
const viewsStore = useViewsStore();

const view = computed(() => viewsStore.viewById(props.viewId));
const viewState = computed(() => viewsStore.viewStates[props.viewId] || null);
const name = computed(() => view.value?.name || props.fallbackName);

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

// The minimal single-list-region screen for the view's type — the same
// floor the detail synthesis builds from a type's list screen, with no
// actions: creation and quick actions belong to the collection's own
// screens, and the embed renders the lens.
const screen = computed(() => (view.value ? {
  id: `view:${view.value._id}`,
  screenKey: `view:${view.value._id}`,
  template: 'typeList',
  typeId: view.value.typeId,
  sources: [{ id: view.value.typeId, typeId: view.value.typeId }],
  regions: [{ id: 'main', slot: 'main', sourceId: view.value.typeId }]
} : null));

// Source state: loading only while the fetch is in flight; the pool
// itself derives ready/empty at compose time, so an already-loaded type
// renders at once on both sides of hydration. A pending lens is a
// loading region whatever the pool holds — the region cannot render.
const fetchState = ref(null);
const lensPending = computed(() => Boolean(view.value) && viewState.value === null);
const sourceState = computed(() => {
  if (lensPending.value) return 'loading';
  return fetchState.value
    ?? (Object.keys(pool.value[view.value?.typeId] || {}).length ? 'ready' : 'loading');
});

const composed = computed(() => (screen.value
  ? composeScreen(screen.value, contract.value, bundle.value, pool.value, {
    sourceStates: { [view.value.typeId]: sourceState.value }
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
  if (!view.value) return;
  try {
    await viewsStore.loadView(props.viewId);
  } catch {
    return;
  }
  const typeKey = instancesStore.canonicalTypeKey(view.value.typeId);
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
