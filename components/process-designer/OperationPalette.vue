<template>
  <Listbox
    :model-value="selected"
    :options="groups"
    option-group-label="label"
    option-group-children="items"
    option-label="label"
    data-key="id"
    filter
    :filter-placeholder="placeholder"
    :aria-label="placeholder"
    class="min-h-0 flex-1"
    scroll-height="100%"
    @update:model-value="pick"
    @keydown.esc.stop="emit('close')"
  >
    <template #option="{ option }">
      <span
        class="flex w-full min-w-0 items-center gap-2"
        v-tooltip.right="option.description"
      >
        <i :class="option.icon" aria-hidden="true"></i>
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
      </span>
    </template>
  </Listbox>
</template>

<script setup>
import Listbox from 'primevue/listbox';
import { ref } from 'vue';

// The operation palette for the process designer: one filterable grouped
// list (PrimeVue Listbox owns the filter box, group headers, and option
// rows). Selection is momentary: a pick emits once and the model returns
// to null — the palette keeps no highlight, and a plain click on the same
// operation always re-selects (PrimeVue otherwise swallows clicks on an
// option it already marks selected). Groups carry precomputed localized
// `label`s (the filter matches them) and per-item `description`s for the
// row tooltip. Used by both the rail palette and the canvas context
// palette.
defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick', 'close']);
const selected = ref(null);

function pick(item) {
  if (!item) return;
  emit('pick', item);
  selected.value = null;
}
</script>
