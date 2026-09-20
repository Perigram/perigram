<template>
  <div v-if="embedded && node.surfaceKind === 'list'" :class="[embeddedStack, 'w-full']">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-label">{{ regionLabel }}</span>
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
    <RegionDataState v-if="showState" :node="node" />
    <template v-if="showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <CollectionToolbar v-if="listLayout !== 'table'" v-model:search="search" v-model:facets="facets" :node="node" />
      <CollectionTable
        v-if="listLayout === 'table'"
        :instances="tableInstances"
        :type="node.type"
        :controls="node.listControls"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <HierarchyTable
        v-else-if="listLayout === 'tree-table'"
        :instances="filteredInstances"
        :type="node.type"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <CardGrid
        v-else-if="listLayout === 'card-grid'"
        :instances="filteredInstances"
        :type="node.type"
        :controls="node.listControls"
        :actions="instanceActionsForType"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
        @run="emitRun"
      />
      <CarouselGrid v-else-if="listLayout === 'carousel'" :instances="filteredInstances" :type="node.type" :pool="pool" :bundle="bundle" />
      <TimelineCollection
        v-else-if="listLayout === 'timeline'"
        :instances="filteredInstances"
        :type="node.type"
        :controls="node.listControls"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <StatGrid v-else-if="listLayout === 'stats'" :instances="filteredInstances" :type="node.type" :pool="pool" :bundle="bundle" />
      <div v-else :class="LAYOUT.stackTight">
        <SurfaceBody
          v-for="instance in filteredInstances"
          :key="instance.id"
          :instance="instance"
          :type="node.type"
          variant="row"
          parent-role="card"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
    </template>
  </div>

  <Panel v-else-if="node.surfaceKind === 'list'" class="w-full" :pt="{ contentWrapper: { class: 'min-w-0' } }">
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-section-heading">{{ regionLabel }}</span>
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
    <RegionDataState v-if="showState" :node="node" />
    <!-- Panel content has no strip-to-content gap of its own: the toolbar,
         progress, and collection surface stack on the system rhythm so the
         search bar never sticks to the content below it. -->
    <div v-if="showSurfaces" :class="embeddedStack">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <CollectionToolbar v-if="listLayout !== 'table'" v-model:search="search" v-model:facets="facets" :node="node" />
      <CollectionTable
        v-if="listLayout === 'table'"
        :instances="tableInstances"
        :type="node.type"
        :controls="node.listControls"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <HierarchyTable
        v-else-if="listLayout === 'tree-table'"
        :instances="filteredInstances"
        :type="node.type"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <CardGrid
        v-else-if="listLayout === 'card-grid'"
        :instances="filteredInstances"
        :type="node.type"
        :controls="node.listControls"
        :actions="instanceActionsForType"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
        @run="emitRun"
      />
      <CarouselGrid v-else-if="listLayout === 'carousel'" :instances="filteredInstances" :type="node.type" :pool="pool" :bundle="bundle" />
      <TimelineCollection
        v-else-if="listLayout === 'timeline'"
        :instances="filteredInstances"
        :type="node.type"
        :controls="node.listControls"
        :openable="openable"
        :pool="pool"
        :bundle="bundle"
        @open="emitOpen"
      />
      <StatGrid v-else-if="listLayout === 'stats'" :instances="filteredInstances" :type="node.type" :pool="pool" :bundle="bundle" />
      <div v-else-if="listLayout === 'list'" :class="LAYOUT.stackTight">
        <SurfaceBody
          v-for="instance in filteredInstances"
          :key="instance.id"
          :instance="instance"
          :type="node.type"
          variant="row"
          parent-role="card"
          :pool="pool"
          :bundle="bundle"
        />
      </div>
    </div>
    <RegionBlock
      v-for="child in node.childRegions"
      :key="child.id"
      :node="child"
      :pool="pool"
      :bundle="bundle"
      :depth="depth + 1"
      :openable="openable"
      :instance-actions="instanceActions"
      @run="emitRun"
      @open="emitOpen"
    />
  </Panel>

  <div v-else :class="[stackFor, 'w-full']">
    <RegionDataState v-if="showState" :node="node" />
    <div v-if="depth === 0 && showSurfaces" :class="LAYOUT.detailSplit">
      <div :class="[LAYOUT.mainCol, 'min-w-0 flex flex-col gap-6']">
        <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
        <SurfaceHeader
          :type="node.type"
          :instance="node.instances[0]"
          :actions="node.actions"
          :level="node.level"
          editable
          :editing="editing"
          :pool="pool"
          :bundle="bundle"
          @run="emitRun"
          @toggle-edit="toggleEditing"
        />
        <SurfaceBody
          :instance="node.instances[0]"
          :type="node.type"
          variant="full"
          :actions="node.actions"
          :chrome="node.chrome"
          :covered-relations="coveredRelationKeys"
          :editing="editing"
          :draft="draft"
          :pool="pool"
          :bundle="bundle"
          @run="emitRun"
        />
      </div>
      <div v-if="node.childRegions.length" :class="[LAYOUT.sideCol, 'min-w-0 flex flex-col gap-4']">
        <Tabs v-if="node.childrenMode === 'tabs'" :value="node.childRegions[0].id" class="w-full">
          <TabList>
            <Tab v-for="child in node.childRegions" :key="child.id" :value="child.id">
              {{ regionLabelFor(child) }}
              <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel v-for="child in node.childRegions" :key="child.id" :value="child.id">
              <RegionBlock :node="child" :pool="pool" :bundle="bundle" :depth="depth + 1" :openable="openable" :instance-actions="instanceActions" embedded @run="emitRun" @open="emitOpen" />
            </TabPanel>
          </TabPanels>
        </Tabs>
        <RegionBlock
          v-for="child in node.childRegions"
          v-else
          :key="child.id"
          :node="child"
          :pool="pool"
          :bundle="bundle"
          :depth="depth + 1"
          :openable="openable"
          :instance-actions="instanceActions"
          @run="emitRun"
          @open="emitOpen"
        />
      </div>
    </div>
    <template v-else-if="showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <SurfaceBody
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
      <Tabs v-if="node.childrenMode === 'tabs'" :value="node.childRegions[0].id" class="w-full">
        <TabList>
          <Tab v-for="child in node.childRegions" :key="child.id" :value="child.id">
            {{ regionLabelFor(child) }}
            <Tag v-if="child.instances.length" :value="String(child.instances.length)" severity="secondary" />
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel v-for="child in node.childRegions" :key="child.id" :value="child.id">
            <RegionBlock :node="child" :pool="pool" :bundle="bundle" :depth="depth + 1" :openable="openable" :instance-actions="instanceActions" embedded @run="emitRun" @open="emitOpen" />
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
    </template>
  </div>
</template>

<script setup>
import { computed, inject, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import {
  LAYOUT, GAP_BY_LEVEL, SMALL_LIST_AT, SEARCH_AT, resolveListLayout,
  localizedLabel, typeLabelKey
} from '#shared/ui-mapping/index.js';
import SurfaceBody from './SurfaceBody.vue';
import CollectionTable from './CollectionTable.vue';
import HierarchyTable from './HierarchyTable.vue';
import CardGrid from './CardGrid.vue';
import CarouselGrid from './CarouselGrid.vue';
import TimelineCollection from './TimelineCollection.vue';
import StatGrid from './StatGrid.vue';
import ActionButton from './ActionButton.vue';
import SurfaceHeader from './SurfaceHeader.vue';
import RegionDataState from './RegionDataState.vue';
import CollectionToolbar from './CollectionToolbar.vue';

const props = defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  depth: { type: Number, default: 0 },
  embedded: { type: Boolean, default: false },
  // Collection identities render as links when an instance-open handler
  // exists upstream (GeneratedMappingScreen onOpen).
  openable: { type: Boolean, default: false },
  // Per-instance quick actions by type id (resolveInstanceActions map).
  instanceActions: { type: Object, default: null }
});

const emit = defineEmits(['run', 'open']);
const emitOpen = instance => emit('open', instance);
const { te, t } = useI18n();
const spacing = inject('uiMappingSpacing', null);
const stackFor = computed(() => (spacing ? spacing.stack : LAYOUT[GAP_BY_LEVEL[props.node.level] || 'stack']));
const editing = ref(false);
const draft = reactive({});
const toggleEditing = () => {
  if (!editing.value) {
    Object.keys(draft).forEach(key => delete draft[key]);
    Object.assign(draft, JSON.parse(JSON.stringify(props.node.instances[0]?.fields || {})));
  }
  editing.value = !editing.value;
};
const emitRun = (action, context) => emit('run', action, context);
const instanceActionsForType = computed(() => props.instanceActions?.[props.node.typeId] || []);
// Surface visibility derives from the composed dataState: ready regions
// render; a loading region with already-loaded instances keeps its stale
// surfaces under an indeterminate progress bar; every other state shows
// the shared RegionDataState (skeletons on first load, messages after).
const state = computed(() => props.node.dataState || 'ready');
const hasInstances = computed(() => props.node.instances.length > 0);
const isReloading = computed(() => state.value === 'loading' && hasInstances.value);
const showSurfaces = computed(() => state.value === 'ready' || isReloading.value);
const showState = computed(() => !showSurfaces.value);
const embeddedStack = computed(() => (spacing ? spacing.stackTight : LAYOUT.stackTight));
// The table layout filters natively through the DataTable (same contract),
// so it consumes the raw instances; every other layout consumes the
// toolbar-filtered rows.
const tableInstances = computed(() => (listLayout.value === 'table' ? props.node.instances : filteredInstances.value));
const regionLabelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type?.render?.label || region.id);
const regionLabel = computed(() => regionLabelFor(props.node));
const listLayout = computed(() => resolveListLayout(props.node.type, {
  hierarchical: Boolean(Object.keys(props.node.type?.edges?.children || {}).length),
  size: props.node.instances.length <= SMALL_LIST_AT
    ? 'small'
    : props.node.instances.length > 12 ? 'large' : null
}));
const coveredRelationKeys = computed(() => props.node.childRegions
  .map(child => child.relationKey)
  .filter(Boolean));

// Region-local search/facet state over the composed list-controls
// contract; filters apply client-side over the loaded instances.
const search = ref('');
const facets = reactive({});
watch(() => props.node.id, () => {
  search.value = '';
  Object.keys(facets).forEach(key => delete facets[key]);
});
const filteredInstances = computed(() => {
  if (props.node.surfaceKind !== 'list') return props.node.instances;
  const controls = props.node.listControls;
  if (!controls) return props.node.instances;
  const query = search.value.trim().toLowerCase();
  const activeFacets = Object.entries(facets).filter(([, value]) => value);
  if (!query && !activeFacets.length) return props.node.instances;
  return props.node.instances.filter(instance => {
    if (query) {
      const haystack = controls.searchKeys
        .map(key => instance.fields?.[key])
        .filter(value => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      if (haystack && !haystack.includes(query)) return false;
    }
    for (const [name, expected] of activeFacets) {
      if (String(instance.fields?.[name] ?? '') !== String(expected)) return false;
    }
    return true;
  });
});
</script>
