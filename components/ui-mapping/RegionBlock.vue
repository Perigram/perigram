<template>
  <Panel v-if="node.surfaceKind === 'list'" class="w-full">
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
    <CollectionTable
      v-if="!isMediaCollection"
      :instances="node.instances"
      :type="node.type"
      :pool="pool"
      :bundle="bundle"
    />
    <CardGrid v-else :instances="node.instances" :type="node.type" :pool="pool" :bundle="bundle" />
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

  <div v-else class="flex w-full flex-col gap-4">
    <span v-if="!node.instances.length" class="text-supporting text-muted">{{ $t('uiMapping.emptyRegion') }}</span>
    <SurfaceBody
      v-else
      :instance="node.instances[0]"
      :type="node.type"
      :variant="node.variant"
      :actions="node.actions"
      :pool="pool"
      :bundle="bundle"
      @run="emitRun"
    />
    <Tabs v-if="node.childRegions.length >= 2" :value="node.childRegions[0].id" class="w-full">
      <TabList>
        <Tab v-for="child in node.childRegions" :key="child.id" :value="child.id">
          {{ child.type?.render?.label || child.id }}
          <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel v-for="child in node.childRegions" :key="child.id" :value="child.id">
          <RegionBlock :node="child" :pool="pool" :bundle="bundle" :depth="depth + 1" @run="emitRun" />
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
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import SurfaceBody from './SurfaceBody.vue';
import CollectionTable from './CollectionTable.vue';
import CardGrid from './CardGrid.vue';
import ActionButton from './ActionButton.vue';

const props = defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  depth: { type: Number, default: 0 }
});

const emit = defineEmits(['run']);
const emitRun = action => emit('run', action);
const isMediaCollection = computed(() => props.node.type?.class === 'file');
</script>
