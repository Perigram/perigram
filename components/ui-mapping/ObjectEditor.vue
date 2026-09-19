<template>
  <div :class="[LAYOUT.formGrid, 'rounded-ui bg-subtle p-3']">
    <div
      v-for="[name, sub] in Object.entries(fields)"
      :key="name"
      class="flex min-w-0 flex-col gap-1"
      :class="spanFor(sub)"
    >
      <span class="text-label">{{ name }}</span>
      <FieldControl
        :model-value="model?.[name]"
        :descriptor="sub"
        :variant="variant"
        :pool="pool"
        :bundle="bundle"
        :payload="payload"
        @update:model-value="value => setEntry(name, value)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { LAYOUT, resolveFieldControl } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const fields = computed(() => props.descriptor.fields || {});
const setEntry = (name, value) => {
  model.value = { ...(model.value || {}), [name]: value };
};
const spanFor = sub => (resolveFieldControl(sub, { variant: props.variant }).span === 'full' ? 'md:col-span-2' : '');
</script>
