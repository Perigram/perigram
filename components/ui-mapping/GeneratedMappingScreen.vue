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
          <RegionBlock :node="region" :pool="pool" :bundle="bundle" embedded @run="openAction" />
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
      @run="openAction"
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
      <template v-for="group in dialogGroups" :key="group.id">
        <div v-if="group.label && dialogGroups.length > 1" class="text-label text-muted uppercase">{{ group.label }}</div>
        <div :class="LAYOUT.formGrid">
          <div
            v-for="field in group.fields"
            :key="field.name"
            class="flex min-w-0 flex-col gap-1"
            :class="field.span === 'full' ? 'md:col-span-2' : ''"
          >
            <span class="text-label">{{ field.label }}</span>
            <FieldControl
              v-model="draft[field.name]"
              :descriptor="field.descriptor"
              variant="detail"
              :pool="pool"
              :bundle="bundle"
              :payload="dialogType?.payload"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <Button :label="$t('uiMapping.dialogCancel')" severity="secondary" text :disabled="submitting" @click="dialogVisible = false" />
        <Button :label="$t('uiMapping.dialogSubmit')" :loading="submitting" @click="submitDialog" />
      </template>
    </Dialog>
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
import { LAYOUT, spacingClasses, composeScreen, buildInstancePool, resolveFieldControl, resolveFieldGroups, fieldLabel, typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
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
  // Real dispatch executor: `async (action, draft) => any`. When provided,
  // action runs go through it instead of the showcase toast.
  onRun: { type: Function, default: null },
  spacingScale: { type: Number, default: 1 }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value, {
  sourceStates: props.sourceStates || null
}));
provide('uiMappingSpacing', spacingClasses(props.spacingScale));

const { te, t } = useI18n();
const regionLabelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type?.render?.label || region.label);

const confirm = useConfirm();
const toast = useToast();
const dialogVisible = ref(false);
const dialogAction = ref(null);
const draft = reactive({});
const dialogType = computed(() => (props.bundle.types || []).find(type => type.id === dialogAction.value?.typeId) || null);
// Dialog fields reuse the authored render groups of the type (same
// contract as detail surfaces): construction inputs are ordered and
// sectioned by resolveFieldGroups, the unlisted remainder staying in the
// trailing default group. The draft stays flat and keyed by field name; a
// type without authored groups renders one unlabelled section (no
// headers).
const dialogGroups = computed(() => {
  const inputs = new Set(dialogAction.value?.construction?.inputs || []);
  const fields = dialogType.value?.fields || {};
  return resolveFieldGroups(dialogType.value || {})
    .map(group => ({
      id: group.id,
      label: group.label,
      fields: group.fields
        .filter(field => inputs.has(field.name) && fields[field.name])
        .map(field => ({
          name: field.name,
          descriptor: fields[field.name],
          label: fieldLabel(field.name, field.descriptor),
          span: resolveFieldControl(field.descriptor, { variant: 'detail' }).span
        }))
    }))
    .filter(group => group.fields.length);
});

const submitting = ref(false);
const runAction = async (action, draft = {}) => {
  if (props.onRun) {
    submitting.value = true;
    try {
      await props.onRun(action, draft);
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
  const payload = { ...draft };
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

const openAction = action => {
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
      accept: () => runAction(action)
    });
    return;
  }
  if (action.construction?.inputs?.length) {
    dialogAction.value = action;
    for (const key of Object.keys(draft)) delete draft[key];
    dialogVisible.value = true;
    return;
  }
  runAction(action);
};
</script>
