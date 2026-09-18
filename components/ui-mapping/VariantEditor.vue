<template>
  <div class="flex flex-col gap-2">
    <SelectButton
      :model-value="model?.tag || descriptor.tags?.[0]"
      :options="tagOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      @update:model-value="tag => (model = { tag, value: null })"
    />
    <FieldControl
      v-if="payloadDescriptor"
      :model-value="model?.value"
      :descriptor="payloadDescriptor"
      :variant="variant"
      :pool="pool"
      :bundle="bundle"
      :payload="payload"
      @update:model-value="value => (model = { ...(model || {}), value })"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SelectButton from 'primevue/selectbutton';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const tagOptions = computed(() => (props.descriptor.tags || []).map(tag => ({ label: startCase(tag), value: tag })));
const payloadDescriptor = computed(() => props.descriptor.payloads?.[model.value?.tag] || null);
</script>
