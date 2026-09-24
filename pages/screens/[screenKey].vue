<template>
  <StateBlock v-if="refreshingAuth" state="loading" :message="$t('common.loading')" />
  <GeneratedScreen v-else-if="screen && !isGeneratedScreen" :screen="screen" />
  <StandardPage v-else-if="screen" workspace>
    <template #actions>
      <Button icon="pi pi-refresh" :label="$t('common.refresh')" severity="secondary" outlined size="small" :loading="poolLoading" @click="reload" />
    </template>
    <Message v-if="poolError" severity="error" :closable="false">{{ poolError }}</Message>
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-section-heading">{{ screen.label || screen.screenKey }}</span>
      </div>
      <GeneratedMappingScreen
        :screen="screen"
        :contract="{ actions: processActions }"
        :bundle="processBundle"
        :instances="instanceGroups"
        :source-states="poolStates"
        :on-run="runGeneratedAction"
        :on-transition="runRuntimeTransition"
        :on-transition-applied="applyTransitionSnapshot"
        :runtime-transitions="runtimeTransitions"
        :on-open="openInstance"
      />
    </div>
  </StandardPage>
  <StandardPage v-else>
    <StateBlock state="error" :message="$t('generatedScreen.notFound')" />
  </StandardPage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useStateController } from '~/composables/useStateController.js';
import GeneratedScreen from '~/components/generated/GeneratedScreen.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { isCreateAction } from '~/components/generated/action-visibility.js';
import { resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { resolveGeneratedInstanceDetailOverload } from '~/components/generated/overloads.js';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const toast = useToast();
const { t } = useI18n();
const authStore = useAuthStore();
// The auth middleware has already hydrated this store for SSR and client route
// navigation. Re-fetching it on mount replaces the manifest and unmounts the
// generated workspace immediately after hydration.
const refreshingAuth = ref(!authStore.userIsSet);

const screenKey = computed(() => Array.isArray(route.params.screenKey)
  ? route.params.screenKey.join('/')
  : route.params.screenKey
);

// Process screens arrive in the compiled UI contract vocabulary
// (typeList/instanceDetail/home + typeId) and render through the generator.
// Workspace overloads (the home shell and editor-backed detail types:
// project/cassette/facade/queue/artifact...) stay on the legacy renderer,
// which owns their data loader and action surface, until the generator
// grows workspace equivalents. Hydration projects every screen into the
// typeId vocabulary — there is no view adapter re-injecting legacy keys.
const detailOverload = computed(() => (
  screen.value?.template === 'instanceDetail' && screen.value?.typeId
    ? resolveGeneratedInstanceDetailOverload(screen.value.typeId)
    : null
));
const isGeneratedScreen = computed(() => (
  screen.value?.template === 'typeList'
  || (screen.value?.template === 'instanceDetail' && !detailOverload.value)
));

const screen = computed(() => {
  const base = authStore.screenManifest.find(item => item.screenKey === screenKey.value)
    || synthesizedDetailScreen(screenKey.value);
  if (!base) return null;
  return {
    ...base,
    scope: {
      ...(base.scope || {}),
      ...scopeFromQuery(route.query)
    }
  };
});
const processBundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const processActions = computed(() => authStore.processPayload?.actions || {});

const instances = useInstancesStore();
// The generator's data layer stands in the instance pool projection of the
// shared instance cache; per-source data states (loading/ready/empty/
// denied/error) fold into composeScreen's region tree exactly as the pool
// composable produced them. The store exposes the keyed pool
// ({ type -> { id -> instance }}); the generator's instances prop is the
// grouped-array shape `buildInstancePool` normalizes — the page is the
// composition boundary between the two.
const pool = computed(() => instances.instancePool);
const instanceGroups = computed(() => Object.fromEntries(
  Object.entries(pool.value).map(([typeKey, byId]) => [typeKey, Object.values(byId)])
));
const poolLoading = ref(false);
const poolError = ref('');
const poolStates = ref({});
async function reload() {
  const screenValue = screen.value;
  if (!screenValue) return;
  const sources = (screenValue.sources || []).filter(source => source.id && source.typeId);
  if (!sources.length) {
    poolStates.value = {};
    return;
  }
  poolLoading.value = true;
  poolError.value = '';
  poolStates.value = Object.fromEntries(sources.map(source => [source.id, 'loading']));
  try {
    for (const source of sources) {
      await instances.listInstances(instances.canonicalTypeKey(source.typeId));
      poolStates.value[source.id] = Object.keys(instances.records[instances.canonicalTypeKey(source.typeId)] || {}).length
        ? 'ready'
        : 'empty';
    }
  } catch (err) {
    poolError.value = err?.data?.message || err?.message || String(err);
    const denied = err?.status === 403 || err?.statusCode === 403 || err?.data?.statusCode === 403;
    poolStates.value = Object.fromEntries(Object.entries(poolStates.value)
      .map(([id, value]) => [id, value === 'loading' ? (denied ? 'denied' : 'error') : value]));
  } finally {
    poolLoading.value = false;
  }
}
watch([screen, processBundle], () => reload(), { immediate: true });

// Action dispatch: the projected manifest action id is the execution
// contract id — the run API resolves the rest server-side. Runs flow
// through the instances store (the offline outbox boundary). An
// instance-scoped quick action (card menu) carries its row instance so
// the run targets that entity instead of the screen scope.
// Runtime state transitions (declaration machines) land their updated
// entity straight into the shared instance cache: the open screen's
// sources reconcile through the same store event every other mutation
// uses, so the chip and strip re-anchor without a full reload.
function applyTransitionSnapshot(updated = {}) {
  const typeKey = instances.canonicalTypeKey(updated.type || screen.value?.typeId || '');
  const id = String(updated._id || updated.id || '');
  if (!typeKey || !id) return;
  instances.upsertRecord?.(typeKey, updated);
}

// The declaration machine's live transitions for the opened detail
// instance: fetched through the state service (the same endpoint the
// strip's steps dispatch through), filtered to declared states, labeled
// by the authored state policy.
const runtimeTransitions = ref({});
const stateController = useStateController();
let runtimeTransitionsKey = '';
watch(() => {
  const typeId = screen.value?.typeId || '';
  const scopeId = String(screen.value?.scope?.instanceId || '');
  // The pool keys by the store's canonical type key (snake), while the
  // screen and bundle speak the registry id (kebab) — translate before
  // looking the opened instance up or the runtime transitions never load.
  const poolRows = typeId ? instanceGroups.value[instances.canonicalTypeKey(typeId)] : null;
  const instance = typeId && scopeId ? (poolRows || []).find(item => String(item._id) === scopeId) : null;
  return instance ? `${typeId}|${scopeId}` : '';
}, async key => {
  if (!key || key === runtimeTransitionsKey) return;
  runtimeTransitionsKey = key;
  const [typeId, scopeId] = key.split('|');
  const typeRecord = (authStore.processPayload?.bundle?.types || []).find(type => type.id === typeId);
  const declared = new Set((typeRecord?.states?.main?.values || []));
  if (!declared.size) { runtimeTransitions.value = {}; return; }
  try {
    const actions = await stateController.fetchActions(typeId, scopeId);
    runtimeTransitions.value = {
      [typeId]: actions
        .filter(action => declared.has(action.to))
        .map(action => ({
          __runtime: true,
          actionKind: 'updateInstance',
          trigger: { mode: 'manual' },
          status: { to: action.to },
          intent: action.intent || null,
          region: action.region || null,
          label: typeRecord?.states?.main?.render?.[action.to]?.label || null
        }))
    };
  } catch {
    runtimeTransitions.value = {};
  }
}, { immediate: true });

async function runRuntimeTransition(payload = {}) {
  const instance = payload.instance || {};
  const typeId = instance.type || screen.value?.typeId;
  const id = String(instance._id || instance.id || screen.value?.scope?.instanceId || '');
  if (!typeId || !id || !payload.to) return;
  try {
    const result = await stateController.transition(typeId, id, payload.to, {
      ...(payload.intent ? { intent: payload.intent } : {}),
      ...(payload.region ? { region: payload.region } : {})
    });
    applyTransitionSnapshot(result?.entity || result);
    toast.add({ severity: 'success', summary: labelForState(typeId, payload.to), detail: t('generatedScreen.actionCompleted'), life: 2000 });
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    toast.add({ severity: 'error', summary: labelForState(typeId, payload.to), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function labelForState(typeId = '', value = '') {
  const typeRecord = (authStore.processPayload?.bundle?.types || []).find(type => type.id === typeId);
  return typeRecord?.states?.main?.render?.[value]?.label || value;
}

async function runGeneratedAction(action, data = {}, context = {}) {  const scope = screen.value?.scope || {};
  const instanceId = context.instance?.id || scope.instanceId || scope.instanceId || null;
  try {
    const result = await instances.runAction({ actionId: action.id, instanceId, entities: {}, data, parameters: {} });
    // Created entities open their destination like every other generated
    // surface (compiled detail route first) instead of stranding the
    // author on the list they came from.
    if (isCreateAction(action)) {
      const target = resolveCreatedInstanceOpen({
        action,
        result,
        screenKey: screenKey.value,
        manifest: authStore.screenManifest
      });
      if (target?.kind === 'route') {
        await navigateTo(target.route);
        return;
      }
    }
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await reload();
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    toast.add({ severity: 'error', summary: action.label || action.id, detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

// Collection identity navigation: opens the compiler-paired detail
// screen (auto_<type>_detail) with the instance id in the route scope.
// Types without a paired detail screen in the user manifest stay
// non-navigable (silent no-op — the generator emits, the route decides).
function openInstance(instance) {
  if (!instance?.type || !instance?.id) return;
  const detailKey = `auto_${instance.type}_detail`;
  const exists = authStore.screenManifest.some(item => item.screenKey === detailKey);
  if (!exists) return;
  navigateTo({ path: `/screens/${encodeURIComponent(detailKey)}`, query: { instanceId: instance.id } });
}

function synthesizedDetailScreen(key = '') {
  if (!String(key).endsWith('_detail')) return null;
  const baseKey = String(key).slice(0, -'_detail'.length);
  const base = authStore.screenManifest.find(item => item.screenKey === baseKey);
  const typeId = base?.typeId;
  if (!base || !typeId) return null;
  const sourceId = base.sources?.[0]?.id || typeId;
  const required = base.required || base.sources?.[0]?.required || null;
  // The synthesized fallback speaks the compiled UI contract vocabulary
  // (instanceDetail + typeId) so it renders through the generator like the
  // compiler-paired detail screens it stands in for.
  return {
    ...base,
    id: `${base.id || baseKey}_detail`,
    screenKey: key,
    route: `/screens/${encodeURIComponent(key)}`,
    template: 'instanceDetail',
    placement: 'detail',
    sources: [{
      id: sourceId,
      typeId,
      mode: 'single',
      required,
      identifier: '$screen.scope.instanceId'
    }],
    regions: [{
      id: 'main',
      slot: 'main',
      sourceId,
      surface: 'detail',
      actions: base.actions || []
    }],
    actions: base.actions || []
  };
}

function scopeFromQuery(query = {}) {
  const scope = Object.fromEntries(Object.entries(query)
    .filter(([key]) => key === 'instanceId' || key.endsWith('Id'))
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
  // The generator resolves single sources through scope.instanceId.
  if (scope.instanceId && !scope.instanceId) scope.instanceId = scope.instanceId;
  return scope;
}
</script>
