<template>
  <Select
    :model-value="modelValue || ''"
    :options="classGlyphOptions"
    option-label="label"
    option-value="value"
    size="small"
    class="w-14 shrink-0"
    panel-class="min-w-56"
    :aria-label="ariaLabel"
    @update:model-value="value => emit('update:modelValue', String(value || ''))"
  >
    <template #value="{ value }">
      <i v-if="value" :class="value" aria-hidden="true" />
      <i v-else class="pi pi-circle text-muted" aria-hidden="true" />
    </template>
    <template #option="{ option }">
      <i v-if="option.value" :class="option.value" :title="option.label" aria-hidden="true" />
      <i v-else class="pi pi-circle text-muted" :title="option.label" aria-hidden="true" />
    </template>
  </Select>
</template>

<script setup>
import Select from 'primevue/select';
import { classGlyphOptions } from '~/components/type-designer/class-glyphs.js';

defineProps({
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);
</script>
