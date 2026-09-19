<template>
  <div v-if="embedded && node.surfaceKind === 'list'" :class="[LAYOUT.stackTight, 'w-full']">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-label">{{ node.type?.render?.label || node.id }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
      <div v-if="node.actions.length" class="flex flex-wrap items-center gap-2">
        <ActionButton
          v-for="action in node.actions"
          :key="action.id"
          :action="action"
          :render="node.type?.render"
          @run="emitRun"
        />
      </div>
    </div>
    <CollectionTable
      v-if="listLayout === 'table'"
      :instances="node.instances"
      :type="node.type"
      :pool="pool"
      :bundle="bundle"
    />
    <HierarchyTable
      v-else-if="listLayout === 'tree-table'"
      :instances="node.instances"
      :type="node.type"
      :pool="pool"
      :bundle="bundle"
    />
    <CardGrid v-else-if="listLayout === 'card-grid'" :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
    <TimelineCollection v-else-if="listLayout === 'timeline'" :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
  </div>

  <Panel v-else-if="node.surfaceKind === 'list'" class="w-full">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-section-heading">{{ node.type?.render?.label || node.id }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
    </template>
    <template v-if="node.actions.length" #icons>
      <div class="flex flex-wrap items-center gap-2">
        <ActionButton
          v-for="action in node.actions"
          :key="action.id"
          :action="action"
          :render="node.type?.render"
          @run="emitRun"
        />
      </div>
    </template>
    <Message
      v-if="!node.instances.length"
      severity="info"
      :text="$t('uiMapping.emptyRegion')"
    />
    <CollectionTable
      v-else-if="listLayout === 'table'"
      :instances="node.instances"
      :type="node.type"
      :pool="pool"
      :bundle="bundle"
    />
    <HierarchyTable
      v-else-if="listLayout === 'tree-table'"
      :instances="node.instances"
      :type="node.type"
      :pool="pool"
      :bundle="bundle"
    />
    <CardGrid v-else-if="listLayout === 'card-grid'" :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
    <TimelineCollection v-else-if="listLayout === 'timeline'" :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
    <RegionBlock
      v-for="child in node.childRegions"
      :key="child.id"
      :node="child"
      :pool="pool"
      :bundle="bundle"
      :depth="depth + 1"
      @run="emitRun"
    />
  </Panel>

  <div v-else :class="[LAYOUT.stack, 'w-full']">
    <Message
      v-if="!node.instances.length"
      severity="info"
      :text="$t('uiMapping.emptyRegion')"
    />
    <SurfaceBody
      v-else
      :instance="node.instances[0]"
      :type="node.type"
      :variant="node.variant"
      :actions="node.actions"
      :chrome="node.chrome"
      :covered-relations="coveredRelationKeys"
      :pool="pool"
      :bundle="bundle"
      @run="emitRun"
    />
    <Tabs v-if="node.childRegions.length >= CHILDREN_TABS_AT" :value="node.childRegions[0].id" class="w-full">
      <TabList>
        <Tab v-for="child in node.childRegions" :key="child.id" :value="child.id">
          {{ child.type?.render?.label || child.id }}
          <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="child in node.childRegions" :key="child.id" :value="child.id">
          <RegionBlock :node="child" :pool="pool" :bundle="bundle" :depth="depth + 1" embedded @run="emitRun" />
        </TabPanel>
      </TabPanels>
    </Tabs>
    <template v-else>
      <RegionBlock
        v-for="child in node.childRegions"
        :key="child.id"
        :node="child"
        :pool="pool"
        :bundle="bundle"
        :depth="depth + 1"
        @run="emitRun"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { LAYOUT, resolveListLayout, CHILDREN_TABS_AT } from '#shared/ui-mapping/index.js';
import SurfaceBody from './SurfaceBody.vue';
import CollectionTable from './CollectionTable.vue';
import HierarchyTable from './HierarchyTable.vue';
import CardGrid from './CardGrid.vue';
import TimelineCollection from './TimelineCollection.vue';
import ActionButton from './ActionButton.vue';

const props = defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  depth: { type: Number, default: 0 },
  embedded: { type: Boolean, default: false }
});

const emit = defineEmits(['run']);
const emitRun = action => emit('run', action);
const listLayout = computed(() => resolveListLayout(props.node.type, {
  hierarchical: Boolean(Object.keys(props.node.type?.edges?.children || {}).length)
}));
const coveredRelationKeys = computed(() => props.node.childRegions
  .map(child => child.relationKey)
  .filter(Boolean));
</script>
