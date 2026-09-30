<template>
  <Listbox
    :model-value="null"
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
    @update:model-value="item => item && emit('pick', item)"
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

// The operation palette for the process designer: one filterable grouped
// list (PrimeVue Listbox owns the filter box, group headers, and option
// rows). Selection is momentary — picking an item emits once and the
// model stays null, so the palette never keeps a highlight. Groups carry
// precomputed localized `label`s (filtering matches them) and per-item
// `description`s for the row tooltip. Used by both the rail palette and
// the canvas context palette.
defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick', 'close']);
</script>
