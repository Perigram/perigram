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
      <template v-for="tier in tiers" :key="tier.id">
        <div v-if="tier.groups.length" class="mb-3 text-supporting text-muted">
          {{ tier.label }}
        </div>
        <div v-for="group in tier.groups" :key="group.id" class="mb-3 flex flex-col gap-1.5">
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
      </template>
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

// The context palette's list (right-click, wire drop): searchable chips
// over two provenance tiers — the platform's built-in categories and
// the plugin sections (palette groups declared `source: 'plugin'` by
// the shared plugin-palette projection). Search spans every
// tier. Each chip's dot uses the same token that stripes the canvas
// node the chip creates (utils/processDesignerSignals.js is the one
// map; literal classes only — dynamic strings compile to nothing).
// `groups` carry precomputed localized `label`s (the filter matches
// them) and per-item `description`s for the chip tooltip.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick', 'close']);

const { t } = useI18n();
const query = ref('');
const filteredGroups = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.groups
    .map(group => ({
      ...group,
      items: needle
        ? group.items.filter(item => matchesPaletteSearch(item, needle, group.id))
        : group.items
    }))
    .filter(group => group.items.length);
});
const tiers = computed(() => [
  {
    id: 'pack',
    label: t('processDesigner.palettePluginSections'),
    groups: filteredGroups.value.filter(group => group.source === 'plugin')
  },
  {
    id: 'framework',
    label: t('processDesigner.palettePlatformSections'),
    groups: filteredGroups.value.filter(group => group.source !== 'plugin')
  }
]);
</script>
