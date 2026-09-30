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
      <div v-for="group in filteredGroups" :key="group.id" class="mb-3 flex flex-col gap-1.5 last:mb-0">
        <span class="px-1 text-muted text-supporting">{{ group.label }}</span>
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="item in group.items"
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
              :class="signalBgClass(item.signal)"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate">{{ item.label }}</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { computed, ref } from 'vue';
import { signalBgClass } from '~/utils/processDesignerSignals.js';

// The operation palette for the process designer: searchable groups of
// chips — small PrimeVue Buttons own hover/focus; no icons. Each group
// carries a localized label, and every chip's signal dot uses the same
// token that stripes the canvas node the chip creates
// (utils/processDesignerSignals.js is the one map; literal classes only —
// dynamic strings compile to nothing). Picking emits once; buttons carry
// no selection state, so repeat picks are plain clicks. `groups` carry
// precomputed localized `label`s (the filter matches them) and per-item
// `description`s for the chip tooltip.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick', 'close']);

const query = ref('');
const filteredGroups = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.groups
    .map(group => ({
      ...group,
      items: needle
        ? group.items.filter(item =>
          item.label.toLowerCase().includes(needle)
          || (item.description || '').toLowerCase().includes(needle))
        : group.items
    }))
    .filter(group => group.items.length);
});
</script>
