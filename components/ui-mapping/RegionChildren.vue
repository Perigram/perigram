<template>
  <div v-if="arrangement.mode === 'columns'" class="region-columns-host">
    <div
      class="region-columns grid w-full grid-cols-1 gap-6"
      :data-tracks="regions.length"
      :style="{ '--region-tracks': arrangement.tracks }"
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
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Tag from 'primevue/tag';
import { localizedLabel, typeLabelKey } from '#shared/ui-mapping/index.js';
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
</script>

<style scoped>
/* Container-relative peer columns (the SurfaceHeader pattern). The host
   is the query container; the grid inside responds and stacks inside
   panes, dialogs, and narrow hosts. Engagement is per track count — a
   column earns ~40rem of container width (two tracks engage past 80rem,
   three past 120rem), so a side-by-side collection always fits its
   share. The track list is the weight-derived custom property set by
   the template; its tracks are zero-floored (minmax(0, Nfr)), so wide
   tables scroll inside their column instead of stretching the grid past
   the host. */
.region-columns-host {
  container-type: inline-size;
}

@container (min-width: 80rem) {
  .region-columns[data-tracks='2'] {
    grid-template-columns: var(--region-tracks);
  }
}

@container (min-width: 120rem) {
  .region-columns[data-tracks='3'] {
    grid-template-columns: var(--region-tracks);
  }
}
</style>
