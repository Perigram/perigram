<template>
  <div
    class="flex h-full min-h-0 w-full flex-col"
    data-designer-palette
    :aria-label="$t('processDesigner.paletteDock')"
  >
    <div class="flex flex-col gap-2 p-2 pb-0">
      <InputText
        v-model="query"
        type="search"
        size="small"
        class="w-full"
        :placeholder="placeholder"
        :aria-label="placeholder"
      />
      <nav class="flex flex-wrap gap-1.5" :aria-label="$t('processDesigner.paletteDock')">
        <div v-for="tier in tiers" :key="tier.id" class="flex max-w-full flex-wrap items-center gap-1.5">
          <span class="px-1 text-supporting text-muted">{{ tier.label }}</span>
          <Button
            v-for="group in tier.groups"
            :key="group.id"
            size="small"
            text
            severity="secondary"
            class="bg-subtle"
            :outlined="activeGroupId === group.id"
            :aria-pressed="activeGroupId === group.id"
            :aria-label="group.label"
            @click="selectGroup(group)"
          >
            <span
              class="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              :class="signalBgClass(group.signal)"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate">{{ group.label }}</span>
          </Button>
        </div>
      </nav>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
      <template v-for="section in sections" :key="section.id">
        <template v-for="(part, partIndex) in section.parts" :key="`${section.id}-${part.label || partIndex}`">
          <span class="px-1 text-supporting text-muted">{{ part.label || section.label }}</span>
          <Button
            v-for="item in part.items"
            :key="item.id"
            size="small"
            text
            severity="secondary"
            class="justify-start bg-subtle"
            :aria-label="item.label"
            v-tooltip.right="item.description"
            @click="pick(item)"
          >
            <i v-if="item.glyph" :class="processNodeGlyphClass(item.glyph)" class="mr-1.5 shrink-0 text-muted" aria-hidden="true" />
            <span
              class="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              :class="signalBgClass(item.signal)"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate">{{ item.label }}</span>
          </Button>
        </template>
      </template>
      <span v-if="!sections.length" class="px-1 text-supporting text-muted">
        {{ $t('processDesigner.paletteNoMatches') }}
      </span>
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { signalBgClass } from '~/utils/processDesignerSignals.js';
import { processNodeGlyphClass } from '~/utils/processDesignerGlyphs.js';
import { matchesPaletteSearch } from '~/utils/processDesignerPaletteSearch.js';
import { processDesignerPaletteTiers } from '~/utils/processDesignerPaletteTiers.js';
import { filterPaletteSections } from '~/utils/processDesignerPaletteSections.js';

// The palette dock panel (SPEC §28 interaction model): provenance tiers as
// labels, one chip per palette section; the search spans the full catalog,
// an empty query lists the active section alone. Rows carry the section
// signal dot (utils/processDesignerSignals.js) and the description on
// hover; picking emits once.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['pick']);

const { t } = useI18n();
const query = ref('');
const activeGroupId = ref('');

// The panel opens populated: the first palette section is active until
// the author picks another (or searches).
watch(() => props.groups, groups => {
  if (!activeGroupId.value && groups?.length) activeGroupId.value = groups[0].id;
}, { immediate: true });

const tiers = computed(() => processDesignerPaletteTiers(props.groups, {
  graphs: t('processDesigner.paletteGraphSections'),
  plugins: t('processDesigner.palettePluginSections'),
  framework: t('processDesigner.palettePlatformSections')
}));

const sections = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle) {
    return filterPaletteSections(props.groups, (item, group) => matchesPaletteSearch(item, needle, group.id, group.label));
  }
  const active = props.groups.find(group => group.id === activeGroupId.value);
  return active ? filterPaletteSections([active], () => true) : [];
});

function selectGroup(group) {
  activeGroupId.value = activeGroupId.value === group.id ? '' : group.id;
  query.value = '';
}

function pick(item) {
  emit('pick', item);
}
</script>
