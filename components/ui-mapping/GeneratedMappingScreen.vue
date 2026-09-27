<template>
  <div :class="LAYOUT.stack">
    <Tabs v-if="composed.regionsMode === 'tabs'" :value="composed.regions[0].id">
      <TabList>
        <Tab v-for="region in composed.regions" :key="region.id" :value="region.id">
          {{ regionLabelFor(region) }}
          <Tag v-if="region.instances.length" :value="String(region.instances.length)" severity="secondary" />
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="region in composed.regions" :key="region.id" :value="region.id">
          <RegionBlock
            :node="region"
            :pool="pool"
            :bundle="bundle"
            :openable="openable"
            :instance-actions="instanceActionsByType"
            :patchable="patchable"
            :resolve-transitions="onFetchTransitions"
            embedded
            @run="openAction"
            @transition="executeTransition"
            @open="openInstance"
            @patch="submitPatch"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
    <RegionBlock
      v-for="region in composed.regions"
      v-else
      :key="region.id"
      :node="region"
      :pool="pool"
      :bundle="bundle"
      :openable="openable"
      :instance-actions="instanceActionsByType"
      :patchable="patchable"
      :resolve-transitions="onFetchTransitions"
      @run="openAction"
      @transition="executeTransition"
      @open="openInstance"
      @patch="submitPatch"
    />

    <!-- The routed detail surface keeps the instance conversation beside the
         composed body: the generator owns plain (non-overload) detail routes —
         org-authored CTS types after the migration — so the rail lives here
         exactly like the legacy renderer's detail column. It starts
         collapsed; the panel owns its own bounded height when expanded. -->
    <InstanceChatPanel
      v-if="detailInstance"
      :type="detailInstance.type || screen?.typeId || ''"
      :id="String(detailInstance._id || detailInstance.id || '')"
      :name="detailInstance.identity?.name || ''"
    />

    <Dialog
      v-model:visible="linkDialogVisible"
      modal
      :header="linkAction?.label || ''"
      :class="LAYOUT.dialog"
    >
      <div class="flex min-w-72 flex-col gap-2">
        <span class="text-label">{{ linkAction?.relation?.key }}</span>
        <InstancePicker
          v-model="linkTargetId"
          :accepts="[linkAction?.relation?.targetType].filter(Boolean)"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
      <template #footer>
        <Button :label="$t('uiMapping.dialogCancel')" severity="secondary" text :disabled="submitting" @click="linkDialogVisible = false" />
        <Button :label="$t('uiMapping.dialogSubmit')" :loading="submitting" :disabled="!linkTargetId" @click="submitLink" />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="dialogAction?.label || ''"
      :class="LAYOUT.dialog"
    >
      <div :class="LAYOUT.formGrid">
        <div
          v-for="row in dialogRows"
          :key="row.id"
          class="flex min-w-0 flex-col gap-1"
          :class="row.span === 'full' ? 'md:col-span-2' : ''"
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
      <template #footer>
        <Button :label="$t('uiMapping.dialogCancel')" severity="secondary" text :disabled="submitting" @click="dialogVisible = false" />
        <Button :label="$t('uiMapping.dialogSubmit')" :loading="submitting" @click="submitDialog" />
      </template>
    </Dialog>
    <!-- The screen hosts its own feedback surfaces: without these elements
         in the tree, useToast and the uiMappingConfirm confirmation group
         fire into nothing. -->
    <Toast />
    <ConfirmDialog group="uiMappingConfirm" />
  </div>
</template>

<script setup>
import { computed, provide, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import InstanceChatPanel from '~/components/shared/InstanceChatPanel.vue';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { LAYOUT, spacingClasses, composeScreen, buildInstancePool, resolveCreateDialogInputs, typeLabelKey, localizedLabel, resolveInstanceActions, planActionLaunch } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
import { useLocalizedTypeLabel } from './type-labels.js';
import InstancePicker from './InstancePicker.vue';
import FieldControl from './FieldControl.vue';

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
  onTransitionApplied: { type: Function, default: null },
  // Runtime state-service transitions by type (the declaration machine):
  // `{ [typeId]: [{ __runtime, state: { to }, intent, region, label }] }`.
  // The app fetches per opened instance and owns dispatch; the generator
  // only renders them as header transition buttons.
  runtimeTransitions: { type: Object, default: null },
  // Machine-authority transition resolver for board drags:
  // `async (instance) => [{ to, intent, region }]` over the host's state
  // service — the same machine the transition buttons dispatch through.
  onFetchTransitions: { type: Function, default: null },
  spacingScale: { type: Number, default: 1 }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value, {
  sourceStates: props.sourceStates || null
}));
provide('uiMappingSpacing', spacingClasses(props.spacingScale));

const { te, t } = useI18n();
const { localizedTypeLabel } = useLocalizedTypeLabel();
const regionLabelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type ? localizedTypeLabel(region.type) : region.label);
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
    ...((props.runtimeTransitions || {})[type.id] || [])
  ]])));
// Runtime state transitions dispatch through the page's executor
// (`onTransition`); without one they are display-only.
async function executeTransition(payload = {}) {
  if (typeof props.onTransition === 'function') {
    await props.onTransition(payload);
    return;
  }
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
const dialogRows = computed(() => resolveCreateDialogInputs(dialogAction.value || {}, dialogType.value, props.bundle));

const submitting = ref(false);
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
  // Lineage pickers model `{ type, id }`; the construction path wants the
  // bare instance id. File references (`{ fileId, ... }`) already are the
  // payload the construct path validates — unwrapping them to `.id`
  // would silently drop the upload.
  const payload = {};
  for (const [key, value] of Object.entries(dialogDraft)) {
    payload[key] = value && typeof value === 'object' && !Array.isArray(value) && !value.fileId ? value.id : value;
  }
  dialogVisible.value = false;
  if (action) runAction(action, payload);
};

const linkDialogVisible = ref(false);
const linkAction = ref(null);
const linkTargetId = ref(null);
const submitLink = () => {
  const action = linkAction.value;
  const targetId = linkTargetId.value;
  linkDialogVisible.value = false;
  if (!action || !targetId) return;
  runAction(action, {
    relations: { [action.relation.key]: { type: action.relation.targetType, id: targetId } }
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
    linkTargetId.value = null;
    linkDialogVisible.value = true;
    return;
  }
  if (launch === 'dialog') {
    dialogAction.value = action;
    for (const key of Object.keys(dialogDraft)) delete dialogDraft[key];
    // Parent-scoped creates: on a detail surface whose scope carries the
    // opened instance, lineage rows accepting that type preselect it, so
    // children created from the parent's region stamp their lineage
    // instead of landing unparented.
    const scopeTypeId = props.screen?.typeId;
    const scopeInstanceId = props.screen?.scope?.instanceId;
    if (scopeTypeId && scopeInstanceId) {
      for (const row of dialogRows.value) {
        if (row.lineage?.accepts?.includes(scopeTypeId)) {
          dialogDraft[row.id] = { type: scopeTypeId, id: String(scopeInstanceId) };
        }
      }
    }
    dialogVisible.value = true;
    return;
  }
  if (launch === 'confirm') {
    const typeLabel = (props.bundle.types || []).find(type => type.id === action.typeId)?.name || null;
    confirm.require({
      group: 'uiMappingConfirm',
      header: action.label,
      message: typeLabel || action.label,
      accept: () => runAction(action, {}, context)
    });
    return;
  }
  runAction(action, {}, context);
};
</script>
