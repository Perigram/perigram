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
      <div v-for="section in sections" :key="section.id" class="mb-3 flex flex-col gap-1.5">
        <span class="px-1 text-muted text-supporting">{{ section.label }}</span>
        <template v-for="(part, partIndex) in section.parts" :key="`${section.id}-${part.label || partIndex}`">
          <span v-if="part.label" class="px-1 text-muted text-supporting">{{ part.label }}</span>
          <div class="flex flex-wrap gap-1.5">
            <Button
              v-for="item in part.items"
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
        </template>
      </div>
      <span v-if="!sections.length" class="px-1 text-supporting text-muted">
        {{ $t('processDesigner.paletteNoMatches') }}
      </span>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { signalBgClass } from '~/utils/processDesignerSignals.js';
import { matchesPaletteSearch } from '~/utils/processDesignerPaletteSearch.js';
import { filterPaletteSections } from '~/utils/processDesignerPaletteSections.js';

// The context palette's list (right-click, wire drop): searchable rows
// over the shared section views — the same `filterPaletteSections`
// projection the palette dock renders. Each chip's dot uses the same
// token that stripes the canvas node the chip creates
// (utils/processDesignerSignals.js is the one map; literal classes only —
// dynamic strings compile to nothing). `groups` carry precomputed
// localized `label`s (the filter matches them) and per-item
// `description`s for the chip tooltip.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});

const emit = defineEmits(['pick', 'close']);

const { t } = useI18n();
const query = ref('');

const sections = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return filterPaletteSections(props.groups, (item, group) => !needle || matchesPaletteSearch(item, needle, group.id, group.label));
});
</script>
