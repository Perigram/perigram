<template>
  <GeneratedMappingScreen
    :screen="screen"
    :contract="{ actions: processActions, statePolicy, stateTransitions }"
    :bundle="processBundle"
    :instances="instanceGroups"
    :source-states="poolStates"
    :on-run="runGeneratedAction"
    :on-transition="runRuntimeTransition"
    :on-transition-applied="applyTransitionSnapshot"
    :on-fetch-transitions="fetchTransitions"
    :on-load-type="loadTypeIntoPool"
    :runtime-transitions="runtimeTransitions"
    :on-patch="runGeneratedPatch"
    :on-open="openInstance"
    :navigation="navigation"
    @instance-mounted="loadRuntimeTransitions"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useStateController } from '~/composables/useStateController.js';
import { applyOptimisticState } from '~/utils/optimistic-state.js';
import { useScreenSourceSync } from '~/composables/useScreenSourceSync.js';
import { isCreateAction } from '~/components/generated/action-visibility.js';
import { isEditorProtocolCreate, resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { statePolicyByType, stateTransitionsByType, stateDisplayFor } from '#shared/ui-mapping/index.js';

// The generator-screen host: the single home of the compiled-screen
// wiring (bundle/contract projection, pool hydration, action runs,
// runtime machine transitions) for the ui-mapping generator. The routed
// screens page and floating hosts (the entity popup) render compiled
// screens through this component — no duplicated wiring.

const props = defineProps({
  screen: { type: Object, required: true },
  // The routed screen key, used only for create-open route targets.
  screenKey: { type: String, default: '' },
  // Host-injected back affordance for the record header
  // (`{ icon, label, command }` — SurfaceHeader's navigation channel):
  // the routed screens page feeds it so a detail screen deep link can
  // return to where the user came from.
  navigation: { type: Object, default: null }
});

const emit = defineEmits(['open-instance', 'refresh']);

const toast = useToast();
const { t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();

const processBundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const processActions = computed(() => authStore.processPayload?.actions || {});
const statePolicy = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}));
const stateTransitions = computed(() => stateTransitionsByType(authStore.processPayload?.producerOutputs || {}));

// The store exposes the keyed pool ({ type -> { id -> instance }}); the
// generator's instances prop is the grouped-array shape.
const pool = computed(() => instances.instancePool);
const instanceGroups = computed(() => Object.fromEntries(
  Object.entries(pool.value).map(([typeKey, byId]) => [typeKey, Object.values(byId)])
));
const poolStates = ref({});

async function reload() {
  if (import.meta.server) return;
  const screenValue = props.screen;
  if (!screenValue) return;
  const sources = (screenValue.sources || []).filter(source => source.id && source.typeId);
  if (!sources.length) {
    poolStates.value = {};
    return;
  }
  poolStates.value = Object.fromEntries(sources.map(source => [source.id, 'loading']));
  try {
    for (const source of sources) {
      await instances.listInstances(instances.canonicalTypeKey(source.typeId));
      poolStates.value[source.id] = Object.keys(instances.records[instances.canonicalTypeKey(source.typeId)] || {}).length
        ? 'ready'
        : 'empty';
    }
  } catch (err) {
    const denied = err?.status === 403 || err?.statusCode === 403 || err?.data?.statusCode === 403;
    poolStates.value = Object.fromEntries(Object.entries(poolStates.value)
      .map(([id, value]) => [id, value === 'loading' ? (denied ? 'denied' : 'error') : value]));
  }
}

watch([() => props.screen, processBundle], () => reload(), { immediate: true });
useScreenSourceSync(() => props.screen, reload);
defineExpose({ reload });

// Runtime state transitions land their updated entity straight into the
// shared instance cache; open screens reconcile through the store event.
function applyTransitionSnapshot(updated = {}) {
  const typeKey = instances.canonicalTypeKey(updated.type || props.screen?.typeId || '');
  const id = String(updated._id || updated.id || '');
  if (!typeKey || !id) return;
  instances.upsertRecord?.(typeKey, updated);
}

const runtimeTransitions = ref({});
const stateController = useStateController();

async function loadRuntimeTransitions(instance = {}) {
  const typeId = instance.type || props.screen?.typeId || '';
  const id = String(instance._id || instance.id || '');
  if (!typeId || !id) { runtimeTransitions.value = {}; return; }
  try {
    const actions = await stateController.fetchActions(typeId, id);
    runtimeTransitions.value = {
      [typeId]: actions
        .filter(action => action.to)
        .map(action => ({
          __runtime: true,
          actionKind: 'updateInstance',
          trigger: { mode: 'manual' },
          state: { to: action.to },
          intent: action.intent || null,
          region: action.region || null,
          label: action.label || null
        }))
    };
  } catch {
    runtimeTransitions.value = {};
  }
}

// Board drags resolve legality through the machine authority — the same
// state-service fetch the header's transition buttons use.
async function fetchTransitions(instance = {}) {
  const typeId = instance.type || props.screen?.typeId || '';
  const id = String(instance._id || instance.id || '');
  if (!typeId || !id) return [];
  const actions = await stateController.fetchActions(typeId, id);
  return actions.filter(action => action.to)
    .map(action => ({ to: action.to, intent: action.intent || null, region: action.region || null }));
}

async function runRuntimeTransition(payload = {}) {
  const instance = payload.instance || {};
  const typeId = instance.type || props.screen?.typeId;
  const id = String(instance._id || instance.id || props.screen?.scope?.instanceId || '');
  if (!typeId || !id || !payload.to) return;
  const rollback = applyOptimisticState(instances, { typeId, id, to: payload.to });
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
    rollback?.();
    toast.add({ severity: 'error', summary: labelForState(typeId, payload.to), detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

function labelForState(typeId = '', value = '') {
  const display = stateDisplayFor(statePolicy.value[typeId] || null, value);
  return display?.label || value;
}

async function runGeneratedAction(action, data = {}, context = {}) {
  const scope = props.screen?.scope || {};
  const instanceId = context.instance?.id || scope.instanceId || null;
  // Unscoped editor creates defer to the editor (SPEC §UI): the blank
  // page opens and the first save creates the record. A context-bound
  // create arrives with its binding in `data` and keeps the construct.
  if (isEditorProtocolCreate(action) && !Object.keys(data || {}).length && openBlankFileEditor(action.typeId)) return;
  try {
    const result = await instances.runAction({ actionId: action.id, instanceId, entities: {}, data, parameters: {} });
    // Created entities open in the home workspace (the same-tab
    // contract); hosts without a compiled home keep the routed detail
    // destination.
    if (isCreateAction(action)) {
      const target = resolveCreatedInstanceOpen({
        action,
        result,
        screenKey: props.screenKey,
        manifest: authStore.screenManifest
      });
      if (target?.kind === 'workspace') {
        toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
        openInstanceInWorkspace({ typeId: target.typeId, instanceId: target.instanceId, editor: target.editor === true });
        return;
      }
      if (target?.kind === 'route') {
        await navigateTo(target.route);
        return;
      }
    }
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await reload();
    emit('refresh');
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    toast.add({ severity: 'error', summary: action.label || action.id, detail: error?.data?.message || error?.message || '', life: 5000 });
  }
}

// Detail edit patches persist through the generic instance update
// transport; the store emits the shared entity event, so every open
// surface reconciles without a host-owned reload.
async function runGeneratedPatch({ instance, patch } = {}) {
  if (!instance?.type || !instance?.id) return;
  await instances.updateInstance(instance.type, instance.id, patch);
}

// Lazy type loader for the containment cross-cut.
async function loadTypeIntoPool(typeId = '') {
  const key = instances.canonicalTypeKey(typeId);
  if (!key) return [];
  await instances.listInstances(key);
  return Object.values(instances.instancePool?.[key] || {});
}

// Collection identity navigation: emits the resolved detail target; the
// host consumer decides whether it routes (the screens page) or swaps the
// popup subject. Types without a paired detail screen stay
// non-navigable.
function openInstance(instance) {
  if (!instance?.type || !instance?.id) return;
  const detailKey = `auto_${instance.type}_detail`;
  const exists = authStore.screenManifest.some(item => item.screenKey === detailKey);
  if (!exists) return;
  emit('open-instance', { screenKey: detailKey, typeId: instance.type, instanceId: String(instance.id) });
}
</script>
