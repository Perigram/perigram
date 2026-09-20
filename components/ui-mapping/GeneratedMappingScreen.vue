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
            embedded
            @run="openAction"
            @open="openInstance"
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
      @run="openAction"
      @open="openInstance"
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
import { computed, provide, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { LAYOUT, spacingClasses, composeScreen, buildInstancePool, resolveCreateDialogInputs, typeLabelKey, localizedLabel, resolveInstanceActions } from '#shared/ui-mapping/index.js';
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
  // identities (cards, table rows, timeline entries) render as links and
  // emit the instance here — routing stays with the app, not the
  // generator.
  onOpen: { type: Function, default: null },
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
// surface may run against one loaded instance without a form context.
const instanceActionsByType = computed(() => Object.fromEntries((props.bundle.types || [])
  .map(type => [type.id, resolveInstanceActions(props.contract?.actions || {}, type.id)])));
const openInstance = instance => {
  if (openable.value) props.onOpen(instance);
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
  // bare instance id.
  const payload = {};
  for (const [key, value] of Object.entries(dialogDraft)) {
    payload[key] = value && typeof value === 'object' && !Array.isArray(value) ? value.id : value;
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
const openAction = (action, context = {}) => {
  if (action.actionKind === 'link') {
    linkAction.value = action;
    linkTargetId.value = null;
    linkDialogVisible.value = true;
    return;
  }
  if (action.access?.level === 'admin' || action.actionKind === 'deleteInstance') {
    confirm.require({
      group: 'uiMappingConfirm',
      header: action.label,
      message: [action.actionKind, action.typeId].filter(Boolean).join(' '),
      accept: () => runAction(action, {}, context)
    });
    return;
  }
  if (action.construction?.inputs?.length) {
    dialogAction.value = action;
    for (const key of Object.keys(dialogDraft)) delete dialogDraft[key];
    dialogVisible.value = true;
    return;
  }
  runAction(action, {}, context);
};
</script>
