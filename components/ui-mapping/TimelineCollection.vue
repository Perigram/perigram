<template>
  <Timeline :value="instances" class="w-full">
    <template #marker="{ item }">
      <span class="bg-content border-content-border flex h-7 w-7 items-center justify-center rounded-full border">
        <i :class="type?.render?.icon || 'pi pi-circle'" class="text-muted text-supporting" />
      </span>
    </template>
    <template #content="{ item }">
      <div class="flex flex-col gap-2 pb-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-supporting text-muted">{{ identityOf(item) }}</span>
          <div v-if="scalarFields.length" class="flex flex-wrap items-center gap-3">
            <div v-for="field in scalarFields" :key="field.name" class="flex items-baseline gap-1">
              <span class="text-supporting text-muted">{{ field.label }}</span>
              <FieldControl
                :model-value="item.fields?.[field.name]"
                :descriptor="field.descriptor"
                variant="inline"
                :pool="pool"
                :bundle="bundle"
              />
            </div>
          </div>
        </div>
        <span v-if="bodyValue(item)" class="text-body">{{ bodyValue(item) }}</span>
      </div>
    </template>
  </Timeline>
</template>

<script setup>
import { computed } from 'vue';
import Timeline from 'primevue/timeline';
import { fieldLabel, SCALAR_BASES, instanceIdentity } from '#shared/ui-mapping/index.js';
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
const bodyField = computed(() => {
  const entries = Object.entries(props.type?.fields || {});
  const long = entries.find(([, descriptor]) => isLongString(descriptor));
  if (long) return { name: long[0] };
  const structural = entries.find(([, descriptor]) => !SCALAR_BASES.includes(descriptor.base));
  return structural ? { name: structural[0] } : null;
});
const bodyValue = instance => (bodyField.value ? instance.fields?.[bodyField.value.name] ?? null : null);
const scalarFields = computed(() => Object.entries(props.type?.fields || {})
  .filter(([name, descriptor]) => SCALAR_BASES.includes(descriptor.base)
    && !isLongString(descriptor)
    && name !== bodyField.value?.name)
  .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) })));
</script>
