<template>
  <div v-if="arrangement.mode === 'columns'" ref="columnsHost" class="region-columns-host">
    <div
      class="region-columns grid w-full grid-cols-1 gap-6"
      :style="columnsEngaged ? { gridTemplateColumns: arrangement.tracks } : undefined"
    >
      <RegionBlock
        v-for="child in regions"
        :key="child.id"
        :node="child"
        :pool="pool"
        :bundle="bundle"
        :depth="depth + 1"
        :openable="openable"
        :instance-actions="instanceActions"
        @run="(action, context) => emit('run', action, context)"
        @open="instance => emit('open', instance)"
      />
    </div>
  </div>

  <template v-else-if="arrangement.mode === 'mixed'">
    <RegionBlock
      :key="regions[primaryIndex].id"
      :node="regions[primaryIndex]"
      :pool="pool"
      :bundle="bundle"
      :depth="depth + 1"
      :openable="openable"
      :instance-actions="instanceActions"
      @run="(action, context) => emit('run', action, context)"
      @open="instance => emit('open', instance)"
    />
    <RegionChildren
      :regions="restRegions"
      :arrangement="arrangement.rest"
      :depth="depth"
      :pool="pool"
      :bundle="bundle"
      :openable="openable"
      :instance-actions="instanceActions"
      @run="(action, context) => emit('run', action, context)"
      @open="instance => emit('open', instance)"
    />
  </template>

  <Tabs v-else-if="arrangement.mode === 'tabs'" :value="arrangement.order[0]" class="w-full">
    <TabList>
      <Tab v-for="child in orderedRegions" :key="child.id" :value="child.id">
        {{ labelFor(child) }}
        <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel v-for="child in orderedRegions" :key="child.id" :value="child.id">
        <RegionBlock
          :node="child"
          :pool="pool"
          :bundle="bundle"
          :depth="depth + 1"
          :openable="openable"
          :instance-actions="instanceActions"
          embedded
          @run="(action, context) => emit('run', action, context)"
          @open="instance => emit('open', instance)"
        />
      </TabPanel>
    </TabPanels>
  </Tabs>

  <RegionBlock
    v-for="child in regions"
    v-else
    :key="child.id"
    :node="child"
    :pool="pool"
    :bundle="bundle"
    :depth="depth + 1"
    :openable="openable"
    :instance-actions="instanceActions"
    @run="(action, context) => emit('run', action, context)"
    @open="instance => emit('open', instance)"
  />
</template>

<script setup>
// Nested child regions under one parent surface, materializing the
// composed arrangement: light peers share weight-proportional columns
// (track fr from each child's estimated rows, engaging past 60rem of
// container width), a dominant sibling keeps the vertical flow with the
// rest arranged after it, heavy peers tab in descending weight order,
// and everything else stacks. One materialization for every nesting
// host — record pages, nested detail bodies, and list panels.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { localizedLabel, typeLabelKey, REGION_COLUMN_EARNED_REM } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
import { useLocalizedTypeLabel } from './type-labels.js';

const props = defineProps({
  regions: { type: Array, default: () => [] },
  arrangement: { type: Object, default: () => ({ mode: 'stack' }) },
  depth: { type: Number, default: 0 },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  openable: { type: Boolean, default: false },
  instanceActions: { type: Object, default: null }
});

const emit = defineEmits(['run', 'open']);
const { te, t } = useI18n();
const { localizedTypeLabel } = useLocalizedTypeLabel();
const labelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type ? localizedTypeLabel(region.type) : region.id);
const primaryIndex = computed(() => (Number.isInteger(props.arrangement.primary)
  ? Math.min(props.arrangement.primary, Math.max(props.regions.length - 1, 0))
  : 0));
const restRegions = computed(() => props.regions.filter((_, index) => index !== primaryIndex.value));
const orderedRegions = computed(() => (Array.isArray(props.arrangement.order)
  ? props.arrangement.order.map(id => props.regions.find(region => region.id === id)).filter(Boolean)
  : props.regions));

// Peer columns engage when the measured host can grant every track its
// earned minimum (track count × REGION_COLUMN_EARNED_REM) — generative
// for any track count, stacking inside panes, dialogs, and narrow hosts
// with zero viewport assumptions. Tracks are zero-floored (minmax(0,
// Nfr)), so wide tables scroll inside their column instead of
// stretching the grid past the host.
const columnsHost = ref(null);
const columnsEngaged = ref(false);
let columnsObserver = null;
const remPx = () => parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
const measureColumns = () => {
  const tracks = String(props.arrangement.tracks || '').trim().split(/\s+/).filter(Boolean).length;
  const width = columnsHost.value?.clientWidth || 0;
  columnsEngaged.value = tracks > 0 && width >= tracks * REGION_COLUMN_EARNED_REM * remPx();
};
onMounted(() => {
  measureColumns();
  columnsObserver = new ResizeObserver(measureColumns);
  if (columnsHost.value) columnsObserver.observe(columnsHost.value);
});
onBeforeUnmount(() => columnsObserver?.disconnect());
</script>
