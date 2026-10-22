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

  <div v-if="pack" :class="LAYOUT.packRow">
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
// The one materialization of the composed children arrangement
// (`arrangeChildren`) for every nesting host: record pages, nested
// detail bodies, list panels.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { localizedLabel, typeLabelKey, REGION_COLUMN_EARNED_REM, LAYOUT } from '#shared/ui-mapping/index.js';
import RegionBlock from './RegionBlock.vue';
import { useLocalizedTypeLabel } from './type-labels.js';

const props = defineProps({
  regions: { type: Array, default: () => [] },
  arrangement: { type: Object, default: () => ({ mode: 'stack' }) },
  // Stack-mode children render at content width side by side (the
  // stub strip under a record body).
  pack: { type: Boolean, default: false },
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

// Column engagement is host-measured per the ui-mapping contract
// (track count × REGION_COLUMN_EARNED_REM).
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
