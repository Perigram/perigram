<template>
  <StateBlock v-if="overload && overloadLoading" state="loading" :message="$t('common.loading')" />
  <StateBlock v-else-if="overload && overloadError" state="error" :message="overloadErrorMessage" />
  <component
    :is="overload.component"
    v-else-if="overload"
    :screen="screen"
    :source-state="overloadSourceState"
    @refresh="refreshOverload"
  />
  <GeneratedMappingScreen
    v-else
    :screen="screen"
    :presentation="presentation"
    :contract="{ actions: processActions, statePolicy, stateTransitions }"
    :bundle="processBundle"
    :instances="instanceGroups"
    :source-states="poolStates"
    :on-run="runGeneratedAction"
    :on-transition="runRuntimeTransition"
    :on-fetch-transitions="fetchTransitions"
    :on-load-type="loadTypeIntoPool"
    :runtime-transitions="runtimeTransitions"
    :on-patch="runGeneratedPatch"
    :on-open="openInstance"
    :navigation="navigation"
    :header-target="headerTarget"
    :expandable="expandable"
    :keep-empty-lists="keepEmptyLists"
    :export-actions="exportActionsByType"
    @instance-mounted="loadRuntimeTransitions"
    @expand="emit('expand')"
  />
  <StandardDialog
    :visible="actionResult !== null"
    size="sm"
    :title="actionResultLabel"
    @update:visible="closeActionResult"
  >
    <div class="flex flex-col gap-2">
      <div v-for="row in actionResultRows" :key="row.label" class="flex items-baseline justify-between gap-4">
        <span class="min-w-0 truncate text-label text-muted">{{ row.label }}</span>
        <span class="shrink-0 text-body">{{ row.value }}</span>
      </div>
    </div>
  </StandardDialog>
  <StandardDialog
    :visible="exportedFile !== null"
    size="xl"
    fill
    :title="exportedFile?.attachment?.name || ''"
    @update:visible="visible => { if (!visible) exportedFile = null; }"
  >
    <div class="h-[70vh] min-h-0">
      <FilePayloadViewer v-if="exportedFile" :source="exportedFile" />
    </div>
    <template #footer>
      <Button
        v-if="exportedFile?.attachment?.fileId"
        :label="$t('common.download')"
        icon="pi pi-download"
        text
        @click="downloadExportedFile"
      />
    </template>
  </StandardDialog>
</template>

<script setup>
// The screen host: the single home of the compiled-screen wiring —
// bundle/contract projection, pool hydration, action runs, runtime
// machine transitions, and screen-template overloads (the home
// workspace). The routed screens page, workspace panes, and mobile home
// tabs all render compiled screens through this component — no
// duplicated wiring. Instance navigation emits to the host consumer;
// created instances resolve through the shared created-open contract
// (utils/created-instance-open).
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import { resolveAttachmentPeek } from '~/components/generated/file-preview-contract.js';
import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useStateController } from '~/composables/useStateController.js';
import { applyOptimisticState } from '~/utils/optimistic-state.js';
import { useScreenSourceSync } from '~/composables/useScreenSourceSync.js';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { resolveSourceIdentifier } from '~/utils/generated-screen-source.js';
import { isCreateAction } from '~/utils/action-visibility.js';
import { isEditorProtocolCreate, resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { refusalFailuresOf } from '~/utils/action-failures.js';
import { useOutboxStore } from '~/stores/outbox';
import { scopedLineagePayload, statePolicyByType, stateTransitionsByType, stateDisplayFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  screen: { type: Object, required: true },
  // The host context's screen key (create-open route targets); panes and
  // mobile tabs omit it and the screen's own key applies.
  screenKey: { type: String, default: '' },
  // Host-injected back affordance for the record header
  // (`{ icon, label, command }` — SurfaceHeader's navigation channel):
  // hosts that opened this record inside another surface feed it so a
  // detail deep link can return to where the user came from.
  navigation: { type: Object, default: null },
  // Host-owned DOM target for the depth-0 record header.
  headerTarget: { type: Object, default: null },
  // The depth-0 record treatment: `record` renders the record header's
  // page chrome, `peek` its compact identity line over the body.
  presentation: { type: String, default: 'record' },
  // Host-selected step-up affordance on the depth-0 record header.
  expandable: { type: Boolean, default: false },
  // Keep an empty list section in the arrangement with its header and
  // empty state (the class page's own collection).
  keepEmptyLists: { type: Boolean, default: false }
});

const emit = defineEmits(['open-instance', 'refresh', 'expand']);

const toast = useToast();
const { te, t } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();

// Screen-template overloads (home) render their registered component;
// every other template renders through the ui-mapping engine below. The
// overload branch feeds on the wire-DTO source loader — a null screen
// keeps that loader idle on generator screens.
const overload = computed(() => resolveGeneratedScreenOverload(props.screen));
const overloadScreen = computed(() => (overload.value ? props.screen : null));
const {
  loading: overloadLoading,
  error: overloadError,
  load: overloadLoad,
  sourceState: overloadSourceState
} = useGeneratedScreen(overloadScreen);
const overloadErrorMessage = computed(() => overloadError.value?.data?.message
  || overloadError.value?.message
  || t('generatedScreen.loadFailed'));

function refreshOverload() {
  overloadLoad();
  emit('refresh');
}

const processBundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const processActions = computed(() => authStore.processPayload?.actions || {});
// Derived export affordances (SPEC §Exports are declarations): the org's
// export bindings — served with the hydration payload — become one manual
// command action per bound (type, kind); no authored action node exists
// or is needed. Execution rides the generic command run path.
const exportActionsByType = computed(() => {
  const byType = {};
  for (const binding of authStore.processPayload?.exports || []) {
    if (!binding?.typeId || !binding.kind) continue;
    const label = te(`uiMapping.exportKinds.${binding.kind}`)
      ? t(`uiMapping.exportKinds.${binding.kind}`)
      : binding.kind;
    (byType[binding.typeId] ||= []).push({
      id: `export:${binding.typeId}:${binding.kind}`,
      __command: true,
      commandId: 'generateAttachment',
      typeId: binding.typeId,
      kind: binding.kind,
      actionKind: 'runCommand',
      trigger: { mode: 'manual' },
      label
    });
  }
  return byType;
});
const statePolicy = computed(() => statePolicyByType(authStore.processPayload?.producerOutputs || {}, authStore.processPayload?.bundle?.types || []));
const stateTransitions = computed(() => stateTransitionsByType(authStore.processPayload?.producerOutputs || {}));

// The store exposes the keyed pool ({ type -> { id -> instance }}); the
// generator's instances prop is the grouped-array shape.
const pool = computed(() => instances.instancePool);
const instanceGroups = computed(() => Object.fromEntries(
  Object.entries(pool.value).map(([typeKey, byId]) => [typeKey, Object.values(byId)])
));
const poolStates = ref({});

async function reload() {
  if (overload.value) {
    if (!import.meta.server) await overloadLoad();
    return;
  }
  const screenValue = props.screen;
  if (!screenValue) return;
  const sources = (screenValue.sources || []).filter(source => source.id && source.typeId);
  poolStates.value = sources.length
    ? Object.fromEntries(sources.map(source => [source.id, 'loading']))
    : {};
  // The loading map above is written on both sides of this gate: the
  // first server and client renders must paint the same skeletons
  // (hydration law) — only the fetches are client-owned.
  if (import.meta.server) return;
  await Promise.all(sources.map(async (source) => {
    const typeKey = instances.canonicalTypeKey(source.typeId);
    let state = 'ready';
    try {
      if (source.mode === 'single') {
        // Single sources resolve the scoped record through the readable
        // reference seam — the same access-filtered transport relation
        // refs resolve through — so a record readable outside the class
        // list (chat-materialized files) still opens.
        const resolvedId = resolveSourceIdentifier(source, screenValue);
        const id = resolvedId ? String(resolvedId) : null;
        const dto = id
          ? await instances.resolveReadableReference(typeKey, id, { silent: true })
          : null;
        state = dto ? 'ready' : 'missing';
      } else {
        await instances.listInstances(typeKey);
        state = Object.keys(instances.records[typeKey] || {}).length ? 'ready' : 'empty';
      }
    } catch (err) {
      const denied = err?.status === 403 || err?.statusCode === 403 || err?.data?.statusCode === 403;
      state = denied ? 'denied' : 'error';
    }
    poolStates.value = { ...poolStates.value, [source.id]: state };
  }));
}

watch([() => props.screen, processBundle], () => reload(), { immediate: true });
useScreenSourceSync(() => (overload.value ? { sources: [] } : props.screen), reload);
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

function labelForState(typeId = '', value = '') {
  const display = stateDisplayFor(statePolicy.value[typeId] || null, value);
  return display?.label || value;
}

function notifyQueued() {
  toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
}

function notifyFailure(error, summary) {
  toast.add({ severity: 'error', summary, detail: error?.data?.message || error?.message || '', life: 5000 });
}

// A service action's value is its result (SPEC §8): the run surface
// shows it — scalars and counts read at a glance, deeper structure stays
// in the run record.
const actionResult = ref(null);
const actionResultLabel = ref('');
const exportedFile = ref(null);

function downloadExportedFile() {
  const fileId = exportedFile.value?.attachment?.fileId;
  if (!fileId || typeof window === 'undefined') return;
  window.open(`/api/files/download/${encodeURIComponent(String(fileId))}?bucket=files&download=1`, '_blank');
}
const actionResultRows = computed(() => {
  const value = actionResult.value;
  if (value === null || typeof value !== 'object') return [];
  const rows = [];
  const walk = (node, prefix, depth) => {
    for (const [key, entry] of Object.entries(node)) {
      if (entry === null || entry === undefined || entry === '') continue;
      const label = prefix ? `${prefix} · ${key}` : key;
      if (Array.isArray(entry)) rows.push({ label, value: String(entry.length) });
      else if (typeof entry === 'object') {
        if (depth < 2) walk(entry, label, depth + 1);
      } else rows.push({ label, value: String(entry) });
    }
  };
  walk(value, '', 0);
  return rows;
});

function closeActionResult(visible) {
  if (!visible) actionResult.value = null;
}

function showActionValueResult(action, result) {
  if (action.kind !== 'cts.service') return;
  if (result === null || result === undefined || typeof result !== 'object') return;
  const empty = Array.isArray(result) ? result.length === 0 : Object.keys(result).length === 0;
  if (empty) return;
  actionResultLabel.value = action.label || action.id || '';
  actionResult.value = result;
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
    // The machine's legal transitions depend on the new state — the
    // opened record's strip refetches after every hop.
    await loadRuntimeTransitions({ type: typeId, _id: id });
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      notifyQueued();
      return;
    }
    rollback?.();
    notifyFailure(error, labelForState(typeId, payload.to));
  }
}

async function runGeneratedAction(action, data = {}, context = {}) {
  const scope = props.screen?.scope || {};
  const instanceId = context.instance?.id || scope.instanceId || null;
  // A context-bound editor create carries the launch parent through the
  // same lineage row the create dialog submits; it runs the construct and
  // opens the created record's editor. Only an unscoped editor create
  // defers to the blank page (SPEC §UI).
  const actionData = isEditorProtocolCreate(action)
    ? {
        ...scopedLineagePayload(action, {
          scopeTypeId: props.screen?.typeId,
          scopeId: scope.instanceId,
          type: (processBundle.value?.types || []).find(candidate => candidate.id === action.typeId) || null,
          bundle: processBundle.value
        }),
        ...(data || {})
      }
    : data;
  if (isEditorProtocolCreate(action) && !Object.keys(actionData || {}).length && openBlankFileEditor(action.typeId)) return;
  // Derived command actions (export bindings) execute through the
  // generic command run path — they are not process-contract actions.
  if (action.__command) return runDerivedCommand(action, context.instance);
  try {
    // The store's runAction lands the created entity in the pool itself
    // (create hosts only decide where the record opens).
    const result = await instances.runAction({ action, actionId: action.rerunOf || action.id, instanceId, entities: {}, data: actionData, parameters: {} });
    // Created entities open through the shared created-open contract
    // (the workspace seam or the compiled detail route); hosts without a
    // compiled home keep the routed detail destination.
    if (isCreateAction(action)) {
      const target = resolveCreatedInstanceOpen({
        action,
        result,
        screenKey: props.screenKey || props.screen?.screenKey || props.screen?.id || '',
        manifest: authStore.screenManifest
      });
      if (target?.kind === 'workspace') {
        toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
        openInstanceInWorkspace({ typeId: target.typeId, instanceId: target.instanceId });
        return;
      }
      if (target?.kind === 'route') {
        await navigateTo(target.route);
        return;
      }
    }
    toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    showActionValueResult(action, result);
    await reload();
    emit('refresh');
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      notifyQueued();
      return;
    }
    // A structured refusal renders at the launch surface — the screen's
    // dialog or toast owns it.
    if (refusalFailuresOf(error)) throw error;
    notifyFailure(error, action.label || action.id);
  }
}

// A derived export action (declaration bindings, SPEC §Exports) runs
// through the process boundary so its command executes with the
// action-scoped grants — same mutation boundary (outbox, idempotency key)
// as process actions.
async function runDerivedCommand(action = {}, instance = null) {
  if (!instance?._id && !instance?.id) return;
  const outbox = useOutboxStore();
  try {
    const result = await outbox.mutate({
      url: '/api/process-definitions/active/exports/run',
      method: 'POST',
      body: {
        typeId: action.typeId,
        kind: action.kind,
        instanceId: String(instance._id || instance.id)
      },
      meta: { kind: 'action', instanceId: String(instance._id || instance.id), change: 'updated', reason: 'derived-export' }
    });
    // The export lands in the files bucket; the viewer shows it.
    const attachment = result?.attachments?.[0] || result?.data || null;
    const peek = attachment?.fileId ? resolveAttachmentPeek(attachment) : null;
    if (peek) exportedFile.value = { ...peek, attachment };
    toast.add({ severity: 'success', summary: action.label || action.commandId, detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await reload();
    emit('refresh');
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      notifyQueued();
      return;
    }
    notifyFailure(error, action.label || action.commandId);
  }
}

// Detail edit patches persist through the generic instance update
// transport; the store emits the shared entity event, so every open
// surface reconciles without a host-owned reload.
async function runGeneratedPatch({ instance, patch } = {}) {
  if (!instance?.type || !instance?.id) return;
  await instances.updateInstance(instance.type, instance.id, patch);
}

// Lazy type loader for the children-type overlay and the relation
// target pool.
async function loadTypeIntoPool(typeId = '') {
  const key = instances.canonicalTypeKey(typeId);
  if (!key) return [];
  await instances.listInstances(key);
  return Object.values(instances.instancePool?.[key] || {});
}

// Collection identity navigation emits the instance to the host
// consumer — the routed page, the workspace pane, or the mobile shell
// decides where it opens.
function openInstance(instance) {
  if (!instance?.type || !instance?.id) return;
  emit('open-instance', { typeId: instance.type, instanceId: String(instance.id) });
}
</script>
