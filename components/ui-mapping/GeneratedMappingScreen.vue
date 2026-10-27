<template>
  <div ref="root" :class="spacing ? spacing.screenRoot : LAYOUT.stackSection">
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

    <!-- The routed detail surface keeps the same conversation contract as
         every other instance surface: the record header (SurfaceHeader)
         carries the composed chat entry; there is no embedded comments
         section beside the body. -->

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
        />
      </div>
    </StandardDialog>
    <StandardDialog
      v-model:visible="dialogVisible"
      size="md"
      :header="dialogAction?.label || ''"
      show-default-footer
      :cancel-label="$t('uiMapping.dialogCancel')"
      :save-label="$t('uiMapping.dialogSubmit')"
      :loading="submitting"
      :save-disabled="dialogIncomplete"
      @cancel="closeDialog"
      @save="submitDialog"
    >
      <div :class="LAYOUT.formGrid">
        <div
          v-for="row in visibleDialogRows"
          :key="row.id"
          class="flex min-w-0 flex-col gap-1"
          :class="row.span === 'full' ? 'ck-span-full' : ''"
        >
          <span class="text-label">{{ row.label }}</span>
          <InstancePicker
            v-if="row.lineage"
            v-model="dialogDraft[row.id]"
            :accepts="row.lineage.accepts"
            :pool="pool"
            :bundle="bundle"
          />
          <FieldControl
            v-else
            v-model="dialogDraft[row.id]"
            :descriptor="row.descriptor"
            variant="detail"
            :pool="pool"
            :bundle="bundle"
            :payload="dialogType?.payload"
          />
        </div>
      </div>
    </StandardDialog>
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
import { LAYOUT, spacingClasses, spacingCoefficientFor, screenWeight, composeScreen, buildInstancePool, resolveCreateDialogInputs, resolveRunDialogInputs, resolveInstanceActions, planActionLaunch } from '#shared/ui-mapping/index.js';
import { withinRelationDomain } from '#shared/relation-domain.js';
import { provideDefaultContainerTraits, useHostContainerTraits } from '~/composables/useContainerTraits.js';
import RegionChildren from './RegionChildren.vue';
import InstancePicker from './InstancePicker.vue';
import FieldControl from './FieldControl.vue';
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
  // Editor action components by type (the host resolves the file-surface
  // registry; the engine renders what it is given): `{ [typeId]: Component }`.
  editorActions: { type: Object, default: null },
  // Machine-authority transition resolver for board drags:
  // `async (instance) => [{ to, intent, region }]` over the host's state
  // service — the same machine the transition buttons dispatch through.
  onFetchTransitions: { type: Function, default: null },
  // Lazy type loader for the containment cross-cut (parent-context
  // rows): `async (typeId) => screenInstance[]` over the host's instance
  // store.
  onLoadType: { type: Function, default: null },
  // Host-injected contextual back affordance for the detail record
  // header (`{ icon, label, command }` — SurfaceHeader's navigation
  // channel, threaded through RegionBlock to the depth-0 header).
  navigation: { type: Object, default: null },
  // The host surface names this screen (the pane tab, the routed page's
  // title bar); the list header label stays with the host.
  // Explicit rhythm coefficient (the design-lab slider); null rides the
  // derived system.
  spacingScale: { type: Number, default: null }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value, {
  sourceStates: props.sourceStates || null
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
  openAction(action, context.data || {}, { instance: entity });
});

const { t } = useI18n();
const openable = computed(() => typeof props.onOpen === 'function');
// Per-instance quick actions by type (resolveInstanceActions contract):
// status transitions, deletion, and instance-scoped commands a collection
// surface may run against one loaded instance without a form context —
// merged with the RUNTIME state-service transitions for the opened
// detail instance (the declaration-derived machine serves transitions
// org types author on their declarations and transition nodes; the
// compiled manifest alone only knows graph-authored action records).
const instanceActionsByType = computed(() => Object.fromEntries((props.bundle.types || [])
  .map(type => [type.id, [
    ...resolveInstanceActions(props.contract?.actions || {}, type.id),
    ...((props.runtimeTransitions || {})[type.id] || []),
    ...((props.exportActions || {})[type.id] || [])
  ]])));
// Runtime state transitions dispatch through the page's executor
// (`onTransition`); without one they are display-only.
async function executeTransition(payload = {}) {
  if (typeof props.onTransition !== 'function') return;
  await props.onTransition(payload);
}
const emit = defineEmits(['instance-mounted']);
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
  editorActions: props.editorActions
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
const dialogVisible = ref(false);
const dialogAction = ref(null);
const dialogDraft = reactive({});
const dialogType = computed(() => (props.bundle.types || []).find(type => type.id === dialogAction.value?.typeId) || null);
// Dialog rows come from the shared resolver: authored fields (matched by
// bare name or slot-qualified path), the identity name, and lineage parent
// pickers over reverse containment — construction inputs are never dropped
// for a path/name mismatch again. The draft is keyed by the compiled input
// id, so the submitted payload lands exactly on the construction paths.
const dialogRows = computed(() => (
  dialogAction.value?.actionKind === 'runCommand'
    ? resolveRunDialogInputs(dialogAction.value)
    : resolveCreateDialogInputs(dialogAction.value || {}, dialogType.value, props.bundle)
));

// The opened record on a scoped detail surface — the launch context's
// parent binding for creates (SPEC §UI): lineage rows accepting that type
// submit its reference and never render.
const scopedInstance = computed(() => {
  const scopeTypeId = props.screen?.typeId;
  const scopeInstanceId = props.screen?.scope?.instanceId;
  return scopeTypeId && scopeInstanceId ? { type: scopeTypeId, id: String(scopeInstanceId) } : null;
});
const visibleDialogRows = computed(() => {
  const scoped = scopedInstance.value;
  if (!scoped) return dialogRows.value;
  return dialogRows.value.filter(row => !row.lineage?.accepts?.includes(scoped.type));
});

const submitting = ref(false);
// Required rows gate the submit (the create never runs with its record
// unnamed or its required construction inputs empty): a row counts as
// unfilled when its draft value is nullish, an empty string, an empty
// list, or a quantity control whose value was cleared — picker/file
// models are objects and count as filled.
const rowUnfilled = row => {
  if (!row.required) return false;
  const value = dialogDraft[row.id];
  return value == null || value === '' || (Array.isArray(value) && !value.length)
    || (value && typeof value === 'object' && value.unit !== undefined && (value.value == null || value.value === ''));
};
const dialogIncomplete = computed(() => visibleDialogRows.value.some(rowUnfilled));
const runAction = async (action, draft = {}, context = {}) => {
  if (props.onRun) {
    submitting.value = true;
    try {
      await props.onRun(action, draft, context);
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
const submitDialog = () => {
  const action = dialogAction.value;
  const payload = draftPayload();
  closeDialog();
  if (action) runAction(action, payload);
};

// Lineage and entity pickers model `{ type, id }`; the construction path
// wants the bare instance id, and a picker list carries one ref per entry.
// Quantity controls model the SPEC §2 `{ value, unit }`
// shape; the run parameter channel wants the scalar. File references
// (`{ fileId, ... }`) already are the payload the construct path validates.
const scalarDraftValue = value => {
  if (Array.isArray(value)) return value.map(scalarDraftValue);
  if (!value || typeof value !== 'object' || value.fileId) return value;
  if (value.id !== undefined) return value.id;
  if (value.unit !== undefined && value.value !== undefined) return value.value;
  return value;
};

const draftPayload = () => {
  const payload = {};
  for (const [key, value] of Object.entries(dialogDraft)) {
    payload[key] = scalarDraftValue(value);
  }
  return payload;
};

const linkDialogVisible = ref(false);
const linkAction = ref(null);
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
  });
};

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
    linkTarget.value = null;
    linkDialogVisible.value = true;
    loadLinkTargets(action);
    return;
  }
  if (launch === 'dialog') {
    dialogAction.value = action;
    seedDialogDraft();
    if (!visibleDialogRows.value.length) {
      const payload = draftPayload();
      closeDialog();
      runAction(action, payload, context);
      return;
    }
    dialogVisible.value = true;
    return;
  }
  if (launch === 'confirm') {
    const typeLabel = (props.bundle.types || []).find(type => type.id === action.typeId)?.name || null;
    confirm.require({
      header: action.label,
      message: typeLabel || action.label,
      accept: () => runAction(action, {}, context)
    });
    return;
  }
  runAction(action, {}, context);
};

function closeDialog() {
  dialogVisible.value = false;
  dialogAction.value = null;
}

// Prefill the draft: authored defaults, then the scoped detail instance's
// reference on lineage rows accepting its type.
function seedDialogDraft() {
  for (const key of Object.keys(dialogDraft)) delete dialogDraft[key];
  for (const row of dialogRows.value) {
    if (row.default !== undefined && row.default !== null) dialogDraft[row.id] = row.default;
  }
  const scoped = scopedInstance.value;
  if (scoped) {
    for (const row of dialogRows.value) {
      if (row.lineage?.accepts?.includes(scoped.type)) {
        dialogDraft[row.id] = { type: scoped.type, id: scoped.id };
      }
    }
  }
}

const regionBlockEvents = {
  run: openAction,
  transition: executeTransition,
  open: openInstance,
  patch: submitPatch
};
</script>
