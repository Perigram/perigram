<template>
  <div :class="LAYOUT.labeledBlock">
    <Textarea
      :model-value="text"
      rows="5"
      class="w-full"
      :invalid="invalid"
      auto-resize
      @update:model-value="onInput"
    />
    <span v-if="invalid" class="text-supporting text-status-danger">{{ invalidMessage }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Textarea from 'primevue/textarea';
import { LAYOUT } from '#shared/ui-mapping/index.js';

const model = defineModel();

const text = ref(pretty(model.value));
const invalid = ref(false);
const invalidMessage = ref(null);

watch(model, value => {
  if (!invalid.value) text.value = pretty(value);
});

function pretty(value) {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function onInput(next) {
  text.value = next;
  if (!next.trim()) {
    invalid.value = false;
    invalidMessage.value = null;
    model.value = null;
    return;
  }
  try {
    model.value = JSON.parse(next);
    invalid.value = false;
    invalidMessage.value = null;
  } catch (error) {
    invalid.value = true;
    invalidMessage.value = error.message;
  }
}
</script>
