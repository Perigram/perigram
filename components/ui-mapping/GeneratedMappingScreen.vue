<template>
  <div :class="LAYOUT.stack">
    <Tabs v-if="composed.regionsMode === 'tabs'" :value="composed.regions[0].id">
      <TabList>
        <Tab v-for="region in composed.regions" :key="region.id" :value="region.id">
          {{ region.type?.render?.label || region.label }}
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
      v-model:visible="dialogVisible"
      modal
      :header="dialogAction?.label || ''"
      :class="LAYOUT.dialog"
    >
      <div v-if="dialogFields.length" :class="LAYOUT.formGrid">
        <div
          v-for="field in dialogFields"
          :key="field.name"
          class="flex min-w-0 flex-col gap-1"
          :class="field.span === 'full' ? 'md:col-span-2' : ''"
        >
          <span class="text-label">{{ field.name }}</span>
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
      <template #footer>
        <Button :label="$t('uiMapping.dialogCancel')" severity="secondary" text :disabled="submitting" @click="dialogVisible = false" />
        <Button :label="$t('uiMapping.dialogSubmit')" :loading="submitting" @click="submitDialog" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, provide, reactive, ref } from 'vue';
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
import { LAYOUT, spacingClasses, composeScreen, buildInstancePool, resolveFieldControl } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  screen: { type: Object, required: true },
  contract: { type: Object, required: true },
  bundle: { type: Object, required: true },
  instances: { type: Object, default: () => ({}) },
  // Real dispatch executor: `async (action, draft) => any`. When provided,
  // action runs go through it instead of the showcase toast.
  onRun: { type: Function, default: null },
  spacingScale: { type: Number, default: 1 }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value));
provide('uiMappingSpacing', spacingClasses(props.spacingScale));

const confirm = useConfirm();
const toast = useToast();
const dialogVisible = ref(false);
const dialogAction = ref(null);
const draft = reactive({});
const dialogType = computed(() => (props.bundle.types || []).find(type => type.id === dialogAction.value?.typeId) || null);
const dialogFields = computed(() => {
  const inputs = dialogAction.value?.construction?.inputs || [];
  const fields = dialogType.value?.fields || {};
  return inputs
    .map(name => ({ name, descriptor: fields[name] }))
    .filter(field => field.descriptor)
    .map(field => ({ ...field, span: resolveFieldControl(field.descriptor, { variant: 'detail' }).span }));
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

const openAction = action => {
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
