<template>
  <div v-if="engaged.mode === 'columns'" :class="LAYOUT.stackTight" class="w-full">
    <RegionBlock
      v-for="child in fullRowRegions"
      :key="child.id"
      v-bind="baseBlockProps"
      v-on="blockEvents"
      :node="child"
      :depth="childDepth"
    />
    <div ref="columnsHost" class="region-columns-host">
      <div
        class="region-columns grid w-full grid-cols-1 gap-6"
        :style="columnsEngaged ? { gridTemplateColumns: engaged.tracks } : undefined"
      >
        <PlacementBox v-for="child in columnRegions" :key="child.id">
          <RegionBlock
            v-bind="baseBlockProps"
            v-on="blockEvents"
            :node="child"
            :depth="childDepth"
          />
        </PlacementBox>
      </div>
    </div>
  </div>

  <template v-else-if="engaged.mode === 'mixed'">
    <RegionBlock
      :key="regions[primaryIndex].id"
      v-bind="baseBlockProps"
      v-on="blockEvents"
      :node="regions[primaryIndex]"
      :depth="childDepth"
    />
    <RegionChildren
      :regions="restRegions"
      :arrangement="engaged.rest"
      :depth="depth"
      :pool="pool"
      :bundle="bundle"
      :openable="openable"
      :instance-actions="instanceActions"
      :region-props="regionProps"
      :region-events="regionEvents"
      @run="(action, context) => emit('run', action, context)"
      @open="instance => emit('open', instance)"
    />
  </template>

  <Tabs v-else-if="engaged.mode === 'tabs'" :value="engaged.order[0]" class="w-full">
    <TabList>
      <Tab v-for="child in orderedRegions" :key="child.id" :value="child.id">
        {{ labelFor(child) }}
        <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel v-for="child in orderedRegions" :key="child.id" :value="child.id">
        <RegionBlock
          v-bind="baseBlockProps"
          v-on="blockEvents"
          :node="child"
          :depth="childDepth"
          embedded
        />
      </TabPanel>
    </TabPanels>
  </Tabs>

  <div v-if="pack" :class="LAYOUT.packRow">
    <RegionBlock
      v-for="child in regions"
      :key="child.id"
      v-bind="baseBlockProps"
      v-on="blockEvents"
      :node="child"
      :depth="childDepth"
      stub
    />
  </div>

  <RegionBlock
    v-for="child in regions"
    v-else
    :key="child.id"
    v-bind="baseBlockProps"
    v-on="blockEvents"
    :node="child"
    :depth="childDepth"
  />
</template>

<script setup>
// The one materialization of the composed children arrangement
// (`arrangeChildren`) for every nesting host: record pages, nested
// detail bodies, list panels, and screen top-level sections. The
// composed tree carries an outcome per width step; the host record the
// seam resolves picks the engaged one — a host change re-engages without
// recomposition.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { localizedLabel, typeLabelKey, REGION_COLUMN_EARNED_REM, LAYOUT } from '#shared/ui-mapping/index.js';
import { useContainerTraits, useHostContainerTraits } from '~/composables/useContainerTraits.js';
import RegionBlock from './RegionBlock.vue';
import PlacementBox from './PlacementBox.vue';
import { generatedEntityLabel } from '~/utils/generated-labels.js';

const props = defineProps({
  regions: { type: Array, default: () => [] },
  // The composed per-step outcomes (`arrangeChildren`): `{ narrow,
  // medium, wide }`, each a stack/mixed/columns/tabs/side outcome.
  arrangement: { type: Object, default: null },
  // Stack-mode children render at content width side by side (the
  // stub strip under a record body).
  pack: { type: Boolean, default: false },
  // Depth -1 hosts top-level screen sections: their children render at
  // depth 0 like routed regions.
  depth: { type: Number, default: 0 },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  openable: { type: Boolean, default: false },
  instanceActions: { type: Object, default: null },
  // Screen-level passthrough: extra RegionBlock props/events the host
  // surface owns (navigation, editor actions, patch/transition channels).
  regionProps: { type: Object, default: null },
  regionEvents: { type: Object, default: null }
});

const emit = defineEmits(['run', 'open']);
const { te, t } = useI18n();
const labelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type ? generatedEntityLabel(region.type, { t, te }) : region.id);
const childDepth = computed(() => (props.depth < 0 ? 0 : props.depth + 1));
const baseBlockProps = computed(() => ({
  pool: props.pool,
  bundle: props.bundle,
  openable: props.openable,
  instanceActions: props.instanceActions,
  ...(props.regionProps || {})
}));
const blockEvents = computed(() => ({
  run: (action, context) => emit('run', action, context),
  open: instance => emit('open', instance),
  ...(props.regionEvents || {})
}));
// Engagement: the host record's width step selects the carried outcome.
const hostContainer = useHostContainerTraits();
const engaged = computed(() => props.arrangement?.[hostContainer.value.width] || { mode: 'stack' });
const primaryIndex = computed(() => (Number.isInteger(engaged.value.primary)
  ? Math.min(engaged.value.primary, Math.max(props.regions.length - 1, 0))
  : 0));
const restRegions = computed(() => props.regions.filter((_, index) => index !== primaryIndex.value));
const orderedRegions = computed(() => (Array.isArray(engaged.value.order)
  ? engaged.value.order.map(id => props.regions.find(region => region.id === id)).filter(Boolean)
  : props.regions));
// Full-row claim (SPEC → Arrangement decision procedure): breadth-full
// children render whole-row before the columns; the columns carry the
// columnable peers, each track a placement box measuring its own width.
const fullRowIds = computed(() => new Set(engaged.value.fullRow || []));
const fullRowRegions = computed(() => props.regions.filter(region => fullRowIds.value.has(region.id)));
const columnRegions = computed(() => props.regions.filter(region => !fullRowIds.value.has(region.id)));

// The columns outcome engages when the measured box grants every track
// its earned minimum (track count × REGION_COLUMN_EARNED_REM); a host
// that cannot grant it takes the stacked grid.
const columnsHost = ref(null);
const container = useContainerTraits(columnsHost);
const columnsEngaged = computed(() => {
  const tracks = String(engaged.value.tracks || '').trim().split(/\s+/).filter(Boolean).length;
  const widthRem = container.value.widthRem;
  return tracks > 0 && widthRem !== null && widthRem >= tracks * REGION_COLUMN_EARNED_REM;
});
</script>
