<template>
  <nav
    class="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-start gap-x-4 gap-y-1"
    :class="variant === 'floating' ? 'rounded-ui border border-content-border bg-content/85 p-2 shadow-overlay backdrop-blur-md' : ''"
    data-designer-palette-strip
    :aria-label="$t('processDesigner.paletteDock')"
  >
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
        @click="toggleGroup(group, $event)"
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
  <Popover ref="popover" :aria-label="$t('processDesigner.paletteDock')">
    <div class="flex min-w-72 max-w-72 flex-col gap-2">
      <InputText
        v-model="query"
        type="search"
        size="small"
        class="w-full"
        :placeholder="placeholder"
        :aria-label="placeholder"
      />
      <div class="flex max-h-72 min-h-0 flex-col gap-1.5 overflow-y-auto p-1">
        <template v-for="section in sections" :key="section.id">
          <span class="px-1 text-supporting text-muted">{{ section.label }}</span>
          <Button
            v-for="item in section.items"
            :key="item.id"
            size="small"
            text
            severity="secondary"
            class="justify-start bg-subtle"
            :aria-label="item.label"
            v-tooltip.right="item.description"
            @click="pick(item)"
          >
            <i v-if="item.glyph"  :class="processNodeGlyphClass(item.glyph)" class="mr-1.5 shrink-0 text-muted" aria-hidden="true" />
            <span
              class="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              :class="signalBgClass(item.signal)"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate">{{ item.label }}</span>
          </Button>
        </template>
        <span v-if="!sections.length" class="px-1 text-supporting text-muted">
          {{ $t('processDesigner.paletteNoMatches') }}
        </span>
      </div>
    </div>
  </Popover>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { signalBgClass } from '~/utils/processDesignerSignals.js';
import { processNodeGlyphClass } from '~/utils/processDesignerGlyphs.js';

// The canvas-top palette dock (SPEC §28 interaction model): provenance
// tiers as labels, one chip per palette section; a chip opens the
// popover palette — its search spans the full catalog, an empty query
// lists the active section alone. Rows carry the section signal dot
// (utils/processDesignerSignals.js) and the description on hover;
// picking emits once and closes the popover.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  variant: { type: String, default: 'plane', validator: value => ['plane', 'floating'].includes(value) }
});
const emit = defineEmits(['pick']);

const { t } = useI18n();
const popover = ref(null);
const query = ref('');
const activeGroupId = ref('');

const tiers = computed(() => [
  {
    id: 'pack',
    label: t('processDesigner.palettePluginSections'),
    groups: props.groups.filter(group => group.source === 'plugin')
  },
  {
    id: 'framework',
    label: t('processDesigner.palettePlatformSections'),
    groups: props.groups.filter(group => group.source !== 'plugin')
  }
].filter(tier => tier.groups.length));

const sections = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle) {
    return props.groups
      .map(group => ({
        id: group.id,
        label: group.label,
        items: group.items.filter(item =>
          item.label.toLowerCase().includes(needle)
          || (item.description || '').toLowerCase().includes(needle)
          || (item.id || '').toLowerCase().includes(needle)
          || (item.kind || '').toLowerCase().includes(needle)
          || (item.keywords || []).some(keyword => keyword.toLowerCase().includes(needle))
          || (item.searchTerms || []).some(term => String(term).toLowerCase().includes(needle))
      }))
      .filter(group => group.items.length);
  }
  const active = props.groups.find(group => group.id === activeGroupId.value);
  return active ? [{ id: active.id, label: active.label, items: active.items }] : [];
});

function toggleGroup(group, event) {
  if (activeGroupId.value === group.id && popover.value?.visible) {
    popover.value.hide(event);
    return;
  }
  activeGroupId.value = group.id;
  query.value = '';
  popover.value?.hide(event);
  popover.value?.show(event);
}

function pick(item) {
  popover.value?.hide();
  emit('pick', item);
}
</script>
