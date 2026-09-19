<template>
  <Timeline :value="instances" class="w-full">
    <template #marker="{ item }">
      <span class="bg-content border-content-border flex h-6 w-6 items-center justify-center rounded-ui border">
        <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted text-supporting" />
      </span>
    </template>
    <template #content="{ item }">
      <div class="flex flex-col gap-1 pb-2">
        <span class="text-supporting text-muted">{{ identityOf(item) }}</span>
        <FieldControl
          v-for="field in scalarFields"
          :key="field.name"
          :model-value="item.fields?.[field.name]"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
    </template>
  </Timeline>
</template>

<script setup>
import { computed } from 'vue';
import Timeline from 'primevue/timeline';
import { fieldLabel, SCALAR_BASES, CARD_FACT_BUDGET, applyBudget, instanceIdentity } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const isLongString = descriptor => descriptor.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= 120);
const identityOf = instance => instanceIdentity(props.type, instance);
const scalarFields = computed(() => applyBudget(
  Object.entries(props.type?.fields || {})
    .filter(([, descriptor]) => SCALAR_BASES.includes(descriptor.base) && !isLongString(descriptor)),
  CARD_FACT_BUDGET
).visible.map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
</script>
