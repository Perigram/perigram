<template>
  <div class="flex flex-col gap-6">
    <RegionBlock
      v-for="region in composed.regions"
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
      class="w-full sm:w-[36rem] max-w-full"
    >
      <div v-if="dialogFields.length" class="grid grid-cols-1 items-start gap-x-4 gap-y-4 md:grid-cols-2">
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
        <Button :label="$t('uiMapping.dialogCancel')" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="$t('uiMapping.dialogSubmit')" @click="dialogVisible = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { composeScreen, buildInstancePool, resolveFieldControl } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  screen: { type: Object, required: true },
  contract: { type: Object, required: true },
  bundle: { type: Object, required: true },
  instances: { type: Object, default: () => ({}) }
});

const pool = computed(() => buildInstancePool(props.instances));
const composed = computed(() => composeScreen(props.screen, props.contract, props.bundle, pool.value));

const dialogVisible = ref(false);
const dialogAction = ref(null);
const draft = reactive({});
const dialogType = computed(() => (props.bundle.types || []).find(type => type.id === dialogAction.value?.entityType) || null);
const dialogFields = computed(() => {
  const inputs = dialogAction.value?.construction?.inputs || [];
  const fields = dialogType.value?.fields || {};
  return inputs
    .map(name => ({ name, descriptor: fields[name] }))
    .filter(field => field.descriptor)
    .map(field => ({ ...field, span: resolveFieldControl(field.descriptor, { variant: 'detail' }).span }));
});

const openAction = action => {
  if (!action.construction?.inputs?.length) return;
  dialogAction.value = action;
  for (const key of Object.keys(draft)) delete draft[key];
  dialogVisible.value = true;
};
</script>
