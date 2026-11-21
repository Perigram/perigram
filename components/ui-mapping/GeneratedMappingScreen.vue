<template>
  <div ref="root" :class="[spacing ? spacing.screenRoot : LAYOUT.stackSection, 'h-full', 'min-h-0']">
    <RegionChildren
      :regions="composed.regions"
      :arrangement="composed.regionsArrangement"
      :depth="-1"
      :region-props="regionBlockProps"
      :region-events="regionBlockEvents"
    />
    <RegionChildren
      v-if="composed.stubRegions.length"
      :regions="composed.stubRegions"
      :depth="-1"
      pack
      :region-props="regionBlockProps"
      :region-events="regionBlockEvents"
    />

    <!-- The record page's comments live behind the header's entry
         (SPEC §22.17): the page host opens the thread stage as its
         bounded side panel. -->

    <StandardDialog
      v-model:visible="linkDialogVisible"
      size="sm"
      :header="linkAction?.label || ''"
      show-default-footer
      :cancel-label="$t('uiMapping.dialogCancel')"
      :save-label="$t('uiMapping.dialogSubmit')"
      :loading="submitting || linkLoading"
      :save-disabled="!linkTarget"
      @cancel="linkDialogVisible = false"
      @save="submitLink"
    >
      <div class="flex min-w-72 flex-col gap-2">
        <InstancePicker
          v-model="linkTarget"
          :accepts="linkAction?.relation?.targetTypes || []"
          :pool="linkPool"
          :bundle="bundle"
          :create-actions="createActions"
          @construct-create="openLinkNestedCreate"
        />
      </div>
    </StandardDialog>
    <ActionFormDialog
      :action="dialogAction"
      :bundle="bundle"
      :pool="pool"
      :create-actions="createActions"
      :submitting="submitting"
      :failures="dialogFailures"
      :scoped-instance="scopedInstance"
      @run="submitActionDialog"
      @close="closeActionDialog"
    />
    <NestedCreateDialog
      :entry="linkNestedCreate"
      :bundle="bundle"
      :pool="pool"
      :scoped-instance="scopedInstance"
      @applied="applyLinkNestedCreate"
      @close="linkNestedCreate = null"
    />
    <!-- Toast host: the toast service fires into the nearest host in the tree. -->
    <Toast />
  </div>
</template>

<script setup>
import { computed, provide, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Toast from 'primevue/toast';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { LAYOUT, spacingClasses, spacingCoefficientFor, screenWeight, composeScreen, buildInstancePool, resolveInstanceActions, constructRerunAction, planActionLaunch } from '#shared/ui-mapping/index.js';
import { withinRelationDomain } from '#shared/relation-domain.js';
import { provideDefaultContainerTraits, useHostContainerTraits } from '~/composables/useContainerTraits.js';
import { refusalFailuresOf } from '~/utils/action-failures.js';
import { createActionsByType } from '~/utils/action-visibility.js';
import RegionChildren from './RegionChildren.vue';
import InstancePicker from './InstancePicker.vue';
import ActionFormDialog from './ActionFormDialog.vue';
import NestedCreateDialog from './NestedCreateDialog.vue';
import StandardDialog from '../shared/StandardDialog.vue';

const props = defineProps({
  screen: { type: Object, required: true },
  contract: { type: Object, required: true },
  bundle: { type: Object, required: true },
  instances: { type: Object, default: () => ({}) },
  // Per-source data states from the data layer ('loading' | 'ready' |
  // 'empty' | 'denied' | 'error'); unreported sources derive their state
  // from the pool at compose time.
  sourceStates: { type: Object, default: null },
  // Real dispatch executor: `async (action, draft, context) => any`.
  // When provided, action runs go through it instead of the showcase
  // toast. `context.instance` carries the row/card an instance-scoped
  // quick action was launched from.
  onRun: { type: Function, default: null },
  // Instance navigation: `(instance) => any`. When provided, collection
  // identities (cards, table rows, tree rows, timeline entries) render as links and
  // emit the instance here — routing stays with the app, not the
  // generator.
  onOpen: { type: Function, default: null },
  // Detail patch executor: `async ({ instance, patch }) => any`. When
  // provided, detail-surface edit affordances (the header Edit toggle and
  // the per-field inline pencil) render and submit through it; without it
  // neither renders.
  onPatch: { type: Function, default: null },
  // Runtime state-transition executor: `async (payload) => any` — the
  // page owns dispatch so store refreshes and navigation stay app-side.
  onTransition: { type: Function, default: null },
  // Runtime state-service transitions by type (the declaration machine):
  // `{ [typeId]: [{ __runtime, state: { to }, intent, region, label }] }`.
  // The app fetches per opened instance and owns dispatch; the generator
  // only renders them as header transition buttons.
  runtimeTransitions: { type: Object, default: null },
  // Derived export actions by type (SPEC §Exports are declarations):
  // `{ [typeId]: [{ __command, commandId, kind, actionKind: 'runCommand', ... }] }`
  // — one manual command action per the org's export bindings.
  exportActions: { type: Object, default: null },
  // Machine-authority transition resolver for board drags:
  // `async (instance) => [{ to, intent, region }]` over the host's state
  // service — the same machine the transition buttons dispatch through.
  onFetchTransitions: { type: Function, default: null },
  // Lazy type loader for the children-type overlay and the relation
  // target pool: `async (typeId) => screenInstance[]` over the host's instance
  // store.
  onLoadType: { type: Function, default: null },
  // Host-injected contextual back affordance for the detail record
  // header (`{ icon, label, command }` — SurfaceHeader's navigation
  // channel, threaded through RegionBlock to the depth-0 header).
  navigation: { type: Object, default: null },
  // Host-owned DOM target for the depth-0 record header (the record
  // popup's dialog header).
  headerTarget: { type: Object, default: null },
  // The depth-0 detail treatment: `record` renders the record header's
  // page chrome; `peek` renders its compact identity line over the body.
  presentation: { type: String, default: 'record' },
  // Host-selected step-up affordance on the depth-0 record header.
  expandable: { type: Boolean, default: false },
  // The host surface names this screen (the pane tab, the routed page's
  // title bar); the list header label stays with the host.
  // Explicit rhythm coefficient (the design-lab slider); null rides the
  // derived system.
  spacingScale: { type: Number, default: null },
  // A host whose empty collection is the surface's own content (the class
  // page) keeps the list section in the arrangement with its header and
  // empty state; every other host renders it as a stub.
  keepEmptyLists: { type: Boolean, default: false }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value, {
  sourceStates: props.sourceStates || null,
  presentation: props.presentation,
  keepEmptyLists: props.keepEmptyLists
}));
// Context- and data-aware rhythm (SPEC → Container traits, density): the
// host record's density tier tightened for heavy screens; an explicit
// coefficient overrides the derivation. Consumers read the object's keys,
// so a step change re-rhythms every mounted surface without a remount.
const root = ref(null);
provideDefaultContainerTraits({ hostKind: 'page', elRef: root });
const hostContainer = useHostContainerTraits();
const coefficient = computed(() => (props.spacingScale == null
  ? spacingCoefficientFor(hostContainer.value, screenWeight(composed.value))
  : props.spacingScale));
// The scale tables are frozen; the provided set is a mutable copy so a
// coefficient change can re-rhythm every mounted surface in place.
const spacing = reactive({ ...spacingClasses(coefficient.value) });
watch(coefficient, value => Object.assign(spacing, spacingClasses(value)));
provide('uiMappingSpacing', spacing);
// Inline ref operations (a relation chip's Unlink) execute through the
// same launch pipeline as header actions; the entry carries the relation
// payload the run dispatches with.
provide('generatedExecuteAction', (action, entity, context = {}) => {
  openAction(action, { instance: entity, data: context.data || null });
});

const { t } = useI18n();
const openable = computed(() => typeof props.onOpen === 'function');
// Per-instance quick actions by type (resolveInstanceActions contract):
// status transitions, deletion, and instance-scoped commands a collection
// surface may run against one loaded instance without a form context —
// merged with the RUNTIME state-service transitions for the opened
// detail instance (the declaration-derived machine serves transitions
// org types author on their declarations and transition nodes; the
// compiled manifest alone only knows graph-authored action records) and
// the construct re-run a constructed detail record carries (SPEC §24).
const detailRerunAction = computed(() => constructRerunAction(props.contract?.actions || {}, detailInstance.value));
const instanceActionsByType = computed(() => Object.fromEntries((props.bundle.types || [])
  .map(type => [type.id, [
    ...resolveInstanceActions(props.contract?.actions || {}, type.id),
    ...((props.runtimeTransitions || {})[type.id] || []),
    ...((props.exportActions || {})[type.id] || []),
    ...(detailRerunAction.value && detailRerunAction.value.typeId === type.id ? [detailRerunAction.value] : [])
  ]])));
// Runtime state transitions dispatch through the page's executor
// (`onTransition`); without one they are display-only.
async function executeTransition(payload = {}) {
  if (typeof props.onTransition !== 'function') return;
  await props.onTransition(payload);
}
const emit = defineEmits(['instance-mounted', 'expand']);
// The routed detail instance (org-authored CTS detail routes have no legacy
// overload): the conversation rail and the transition watcher resolve the
// same composed non-list region.
const detailInstance = computed(() => {
  if (props.screen?.template !== 'instanceDetail') return null;
  const detail = (composed.value.regions || []).find(region => region.surfaceKind !== 'list');
  return detail?.instances?.[0] || null;
});
// `immediate`: a routed detail that mounts with the instance already in
// the shared pool (navigated from a workspace that loaded the same
// source) never changes the watched key, so without the immediate pass
// the page would never fetch the declaration machine's transitions.
// The key includes the flat state: a transition mutates the pool record
// in place (same id), and the machine's legal transitions depend on the
// current state — the header buttons must refetch after every hop.
watch(() => {
  const detail = (composed.value.regions || []).find(region => region.surfaceKind !== 'list');
  const instance = detail?.instances?.[0];
  return instance ? `${instance.type || props.screen?.typeId}|${String(instance._id || instance.id)}|${instance.state || ''}` : '';
}, () => {
  const detail = (composed.value.regions || []).find(region => region.surfaceKind !== 'list');
  const instance = detail?.instances?.[0];
  if (instance) emit('instance-mounted', instance);
}, { immediate: true });

const openInstance = instance => {
  if (openable.value) props.onOpen(instance);
};

const patchable = computed(() => typeof props.onPatch === 'function');
// One binding set for every composed region block (tabs and stack).
const regionBlockProps = computed(() => ({
  pool: pool.value,
  bundle: props.bundle,
  openable: openable.value,
  instanceActions: instanceActionsByType.value,
  patchable: patchable.value,
  resolveTransitions: props.onFetchTransitions,
  loadType: props.onLoadType,
  navigation: props.navigation,
  headerTarget: props.headerTarget,
  presentation: props.presentation,
  expandable: props.expandable
}));
const submitPatch = async ({ instance, patch } = {}) => {
  if (!patchable.value || !instance) return;
  submitting.value = true;
  try {
    await props.onPatch({ instance, patch });
    toast.add({ severity: 'success', summary: t('common.save'), life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    submitting.value = false;
  }
};

const confirm = useConfirm();
const toast = useToast();
const dialogAction = ref(null);
const dialogFailures = ref(null);
const dialogContext = ref({});

// The opened record on a scoped detail surface — the launch context's
// parent binding for creates (SPEC §4): lineage rows accepting that type
// submit its reference and never render.
const scopedInstance = computed(() => {
  const scopeTypeId = props.screen?.typeId;
  const scopeInstanceId = props.screen?.scope?.instanceId;
  return scopeTypeId && scopeInstanceId ? { type: scopeTypeId, id: String(scopeInstanceId) } : null;
});

const submitting = ref(false);
const runAction = async (action, draft = {}, context = {}) => {
  if (props.onRun) {
    submitting.value = true;
    try {
      await props.onRun(action, draft, context);
    } catch (error) {
      // A structured refusal renders where the user launched the action:
      // inline in the open dialog, or as the offender list in a toast.
      const failures = refusalFailuresOf(error);
      if (!failures) throw error;
      if (dialogAction.value === action) {
        dialogFailures.value = failures;
      } else {
        toast.add({
          severity: 'error',
          summary: action.label || action.id,
          detail: failures.map(failure => [failure.name, failure.message].filter(Boolean).join(' — ')).join('\n'),
          life: 6000
        });
      }
      return;
    } finally {
      submitting.value = false;
    }
    return;
  }
  toast.add({
    severity: 'info',
    summary: action.label,
    detail: [action.actionKind, action.typeId].filter(Boolean).join(' / '),
    life: 2400
  });
};
const submitActionDialog = async (payload) => {
  const action = dialogAction.value;
  if (!action) return;
  await runAction(action, payload, dialogContext.value);
  if (!dialogFailures.value) closeActionDialog();
};

// Compiled create actions by type feed every picker's create affordance.
const createActions = computed(() => createActionsByType(props.contract?.actions || {}));

const linkDialogVisible = ref(false);
const linkAction = ref(null);
const linkContext = ref({});
// The picker models the instance ref (`{ type, id }`) — the exact shape
// the relation payload carries.
const linkTarget = ref(null);
// Relation targets live outside the opened screen's sources: the host's
// lazy type loader fills the pool when the dialog opens. The declared
// target domain (SPEC §6) filters what the picker offers — the same
// expression the write boundary evaluates.
const linkLoading = ref(false);
const linkPool = computed(() => {
  const relation = linkAction.value?.relation;
  if (!relation?.where) return pool.value;
  const filtered = {};
  for (const typeId of relation.targetTypes || []) {
    filtered[typeId] = Object.fromEntries(Object.entries(pool.value[typeId] || {})
      .filter(([, instance]) => withinRelationDomain(instance, relation.where)));
  }
  return { ...pool.value, ...filtered };
});
async function loadLinkTargets(action) {
  const types = action?.relation?.targetTypes || [];
  if (typeof props.onLoadType !== 'function' || !types.length) return;
  linkLoading.value = true;
  try {
    await Promise.all(types.map(typeId => Promise.resolve(props.onLoadType(typeId)).catch(() => null)));
  } finally {
    linkLoading.value = false;
  }
}
const submitLink = () => {
  const action = linkAction.value;
  const target = linkTarget.value;
  linkDialogVisible.value = false;
  if (!action?.relation?.key || !target?.id) return;
  runAction(action, {
    relations: { [action.relation.key]: { type: target.type, id: target.id } }
  }, linkContext.value);
};

// The link picker's create affordance nests its part-create; the created
// record lands as the link target.
const linkNestedCreate = ref(null);
function openLinkNestedCreate(action) {
  if (!action) return;
  linkNestedCreate.value = { rowId: null, typeId: action.typeId, action, apply: 'link' };
}
function applyLinkNestedCreate({ apply, typeId, id }) {
  if (apply === 'link') linkTarget.value = { type: typeId, id };
}

// `context` carries the instance an instance-scoped quick action was
// launched from (cards, rows); it travels beside the action through
// confirmation and dialogs so the executor receives it either way.
// Launch behavior follows planActionLaunch (the shared launch contract):
// relation link opens its picker, a create with construction inputs opens
// the form — grant level never replaces the form with a bare confirm —
// and confirmation comes from the resolved action button (destructive
// kinds), never from the grant level.
const openAction = (action, context = {}) => {
  const launch = planActionLaunch(action);
  if (launch === 'link') {
    linkAction.value = action;
    linkContext.value = context || {};
    linkTarget.value = null;
    linkDialogVisible.value = true;
    loadLinkTargets(action);
    return;
  }
  if (launch === 'dialog') {
    dialogAction.value = action;
    dialogContext.value = context || {};
    dialogFailures.value = null;
    return;
  }
  if (launch === 'confirm') {
    const typeLabel = (props.bundle.types || []).find(type => type.id === action.typeId)?.name || null;
    confirm.require({
      header: action.label,
      message: typeLabel || action.label,
      accept: () => runAction(action, context.data || {}, context)
    });
    return;
  }
  runAction(action, context.data || {}, context);
};

function closeActionDialog() {
  dialogAction.value = null;
  dialogFailures.value = null;
  dialogContext.value = {};
}

const regionBlockEvents = {
  run: openAction,
  transition: executeTransition,
  open: openInstance,
  patch: submitPatch,
  expand: () => emit('expand')
};
</script>
