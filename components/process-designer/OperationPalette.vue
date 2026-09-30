<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="shrink-0 px-2 pt-2">
      <InputText
        v-model="query"
        type="search"
        size="small"
        class="w-full"
        :placeholder="placeholder"
        :aria-label="placeholder"
        @keydown.esc.stop="emit('close')"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <div class="flex flex-wrap gap-1.5">
        <Button
          v-for="item in filteredItems"
          :key="item.id"
          size="small"
          text
          class="justify-start bg-subtle"
          :aria-label="item.label"
          v-tooltip.right="item.description"
          @click="emit('pick', item)"
        >
          <span
            class="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
            :class="`bg-signal-${item.signal}`"
            aria-hidden="true"
          ></span>
          <span class="min-w-0 truncate">{{ item.label }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { computed, ref } from 'vue';

// The operation palette for the process designer: a searchable wrap of
// chips (small PrimeVue Buttons own hover/focus; no icons, no group
// headers). Categories read through the shared signal dot — the same
// signal tokens stripe the canvas node the chip creates
// (utils/processDesignerSignals.js is the one map). Picking emits once;
// buttons carry no selection state, so repeat picks are plain clicks.
// `items` carry precomputed localized `label`s (the filter matches them),
// `description`s for the chip tooltip, and `signal` names.
const props = defineProps({
  items: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick', 'close']);

const query = ref('');
const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return props.items;
  return props.items.filter(item =>
    item.label.toLowerCase().includes(needle)
    || (item.description || '').toLowerCase().includes(needle));
});
</script>
