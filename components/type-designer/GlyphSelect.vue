<template>
  <Button
    type="button"
    text
    severity="secondary"
    class="h-9 w-9 shrink-0 p-0"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    aria-haspopup="listbox"
    @click="event => picker?.toggle(event)"
  >
    <i :class="[modelValue || 'pi pi-circle', modelValue ? '' : 'text-muted']" aria-hidden="true" />
  </Button>
  <Popover ref="picker">
    <div class="grid max-h-64 w-64 grid-cols-6 gap-1 overflow-y-auto p-1" role="listbox" :aria-label="ariaLabel">
      <Button
        v-for="option in classGlyphOptions"
        :key="option.value || 'auto'"
        type="button"
        text
        severity="secondary"
        class="h-8 w-8 p-0"
        :class="option.value === (modelValue || '') ? 'bg-subtle' : ''"
        :aria-label="option.label || ariaLabel"
        :aria-selected="option.value === (modelValue || '')"
        role="option"
        @click="select(option.value)"
      >
        <i :class="[option.value || 'pi pi-circle', option.value ? '' : 'text-muted']" aria-hidden="true" />
      </Button>
    </div>
  </Popover>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import { classGlyphOptions } from '~/components/type-designer/class-glyphs.js';

defineProps({
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);
const picker = ref(null);

function select(value) {
  emit('update:modelValue', String(value || ''));
  picker.value?.hide();
}
</script>
