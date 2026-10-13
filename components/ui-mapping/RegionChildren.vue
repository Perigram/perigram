<template>
  <Tabs v-if="mode === 'tabs'" :value="regions[0].id" class="w-full">
    <TabList>
      <Tab v-for="child in regions" :key="child.id" :value="child.id">
        {{ labelFor(child) }}
        <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel v-for="child in regions" :key="child.id" :value="child.id">
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
// Nested child regions under one parent surface: heavy sibling sets
// arrange into tabs (the composed childrenMode), everything else stacks.
// One materialization for every nesting host — the detail side column,
// nested detail bodies, and list panels.
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

defineProps({
  regions: { type: Array, default: () => [] },
  mode: { type: String, default: 'stack' },
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
</script>
