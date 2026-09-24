<template>
  <div v-if="embedded && node.surfaceKind === 'list'" :class="[embeddedStack, 'w-full']">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-label">{{ regionLabel }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
      <div v-if="node.actions.length || searchToggleAvailable || facetsToggleAvailable" class="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <!-- Search expands IN PLACE: the icon button becomes an icon field
             at the same position; the icon or Esc collapses it back (an
             empty blur collapses too). -->
        <IconField v-if="searchOpen">
          <InputIcon class="pi pi-search cursor-pointer" @click="searchOpen = false" />
          <InputText
            v-model="search"
            size="small"
            class="max-w-48"
            :placeholder="$t('uiMapping.searchPlaceholder')"
            :aria-label="$t('uiMapping.searchPlaceholder')"
            @keydown.esc="searchOpen = false"
            @blur="search || (searchOpen = false)"
          />
        </IconField>
        <Button
          v-else-if="searchToggleAvailable"
          icon="pi pi-search"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('uiMapping.searchPlaceholder')"
          @click="searchOpen = true"
        />
        <FilterBuilder
          v-if="facetsToggleAvailable"
          :model-value="builderFilter"
          :fields="builderFields"
          @update:model-value="value => (builderFilter = value)"
        />
        <!-- Sort unfolds AT its button too: the select and order toggle
             render beside it (card-grid projection; tables sort natively
             by column). -->
        <template v-if="sortOpen">
          <InstanceSelect
            v-model="sortName"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            show-clear
            size="small"
            class="max-w-48"
            :aria-label="$t('uiMapping.sortLabel')"
          />
          <Button
            v-if="sortName"
            :icon="sortOrder < 0 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
            text
            rounded
            size="small"
            :aria-label="$t('uiMapping.sortOrderLabel')"
            @click="sortOrder = -sortOrder"
          />
        </template>
        <Button
          v-if="sortToggleAvailable"
          icon="pi-sort"
          text
          rounded
          size="small"
          :severity="sortOpen || sortActive ? undefined : 'secondary'"
          :aria-label="$t('uiMapping.sortLabel')"
          @click="sortOpen = !sortOpen"
        />
        <ActionButton
          v-for="action in node.actions"
          :key="action.id"
          :action="action"
          :render="node.type?.render"
          :label="headerActionLabel(action)"
          @run="emitRun"
        />
      </div>
    </div>
    <RegionDataState v-if="showState" :node="node" />
    <template v-if="showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <CollectionTable
        v-if="listLayout === 'table'"
        :instances="filteredInstances"
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
        :instances="sortedInstances"
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

  <Panel v-else-if="node.surfaceKind === 'list'" class="w-full !border-0" :pt="{ contentWrapper: { class: 'min-w-0' } }">
    <template #header>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <i v-if="node.type?.render?.icon" :class="node.type.render.icon" />
        <span class="text-section-heading">{{ regionLabel }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
    </template>
    <template v-if="node.actions.length || searchToggleAvailable || facetsToggleAvailable" #icons>
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <!-- Search expands IN PLACE: the icon button becomes an icon field
             at the same position; the icon or Esc collapses it back (an
             empty blur collapses too). -->
        <IconField v-if="searchOpen">
          <InputIcon class="pi pi-search cursor-pointer" @click="searchOpen = false" />
          <InputText
            v-model="search"
            size="small"
            class="max-w-48"
            :placeholder="$t('uiMapping.searchPlaceholder')"
            :aria-label="$t('uiMapping.searchPlaceholder')"
            @keydown.esc="searchOpen = false"
            @blur="search || (searchOpen = false)"
          />
        </IconField>
        <Button
          v-else-if="searchToggleAvailable"
          icon="pi pi-search"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="$t('uiMapping.searchPlaceholder')"
          @click="searchOpen = true"
        />
        <FilterBuilder
          v-if="facetsToggleAvailable"
          :model-value="builderFilter"
          :fields="builderFields"
          @update:model-value="value => (builderFilter = value)"
        />
        <!-- Sort unfolds AT its button too: the select and order toggle
             render beside it (card-grid projection; tables sort natively
             by column). -->
        <template v-if="sortOpen">
          <InstanceSelect
            v-model="sortName"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            show-clear
            size="small"
            class="max-w-48"
            :aria-label="$t('uiMapping.sortLabel')"
          />
          <Button
            v-if="sortName"
            :icon="sortOrder < 0 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down'"
            text
            rounded
            size="small"
            :aria-label="$t('uiMapping.sortOrderLabel')"
            @click="sortOrder = -sortOrder"
          />
        </template>
        <Button
          v-if="sortToggleAvailable"
          icon="pi-sort"
          text
          rounded
          size="small"
          :severity="sortOpen || sortActive ? undefined : 'secondary'"
          :aria-label="$t('uiMapping.sortLabel')"
          @click="sortOpen = !sortOpen"
        />
        <ActionButton
          v-for="action in node.actions"
          :key="action.id"
          :action="action"
          :render="node.type?.render"
          :label="headerActionLabel(action)"
          @run="emitRun"
        />
      </div>
    </template>
    <RegionDataState v-if="showState" :node="node" />
    <!-- Panel content has no strip-to-content gap of its own: the progress
         and collection surface stack on the system rhythm. -->
    <div v-if="showSurfaces" :class="embeddedStack">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <CollectionTable
        v-if="listLayout === 'table'"
        :instances="filteredInstances"
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
        :instances="sortedInstances"
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
          :actions="headerActions"
          :level="node.level"
          :editable="patchable"
          :editing="editing"
          :pool="pool"
          :bundle="bundle"
          @run="emitRun"
          @transition="payload => emit('transition', { ...payload, instance: node.instances[0] })"
          @toggle-edit="toggleEditing"
        />
        <SurfaceBody
          :instance="node.instances[0]"
          :type="node.type"
          variant="full"
          :actions="node.actions"
          :chrome="node.chrome"
          :covered-relations="coveredRelationKeys"
          :editable="patchable"
          :editing="editing"
          :draft="draft"
          :pool="pool"
          :bundle="bundle"
          @run="emitRun"
          @inline-change="inlineChange"
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
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import {
  LAYOUT, GAP_BY_LEVEL, SMALL_LIST_AT, resolveListLayout, toolbarVisibleFor, sortControlRows,
  localizedLabel, typeLabelKey, instanceMatchesToolbar
} from '#shared/ui-mapping/index.js';
import { instanceMatchesFilter } from '#shared/instance-filters/index.js';
import { builderFieldsForType } from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference } from '~/utils/ui-sort-preference.js';
import { loadFilterViewState, storeFilterViewState } from '~/utils/filter-view-state.js';
import SurfaceBody from './SurfaceBody.vue';
import CollectionTable from './CollectionTable.vue';
import HierarchyTable from './HierarchyTable.vue';
import CardGrid from './CardGrid.vue';
import CarouselGrid from './CarouselGrid.vue';
import TimelineCollection from './TimelineCollection.vue';
import StatGrid from './StatGrid.vue';
import ActionButton from './ActionButton.vue';
import SurfaceHeader from './SurfaceHeader.vue';
import InstanceMultiSelect from '../shared/InstanceMultiSelect.vue';
import InstanceSelect from '../shared/InstanceSelect.vue';
import FilterBuilder from '../shared/FilterBuilder.vue';
import RegionDataState from './RegionDataState.vue';
import { useLocalizedTypeLabel } from './type-labels.js';

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
  instanceActions: { type: Object, default: null },
  // Whether the detail affordances may persist edits (the engine binds
  // this to the presence of an onPatch executor).
  patchable: { type: Boolean, default: false }
});

const emit = defineEmits(['run', 'transition', 'open', 'patch']);
const emitOpen = instance => emit('open', instance);
const { te, t } = useI18n();
const spacing = inject('uiMappingSpacing', null);
const stackFor = computed(() => (spacing ? spacing.stack : LAYOUT[GAP_BY_LEVEL[props.node.level] || 'stack']));
const editing = ref(false);
const draft = reactive({});
// Field-name changes map onto the wire patch blocks: `name` writes the
// identity block, every other field lands under `data` — the same
// mapping the instance update transport writes server-side.
const wirePatchFor = changes => {
  const patch = { data: {} };
  for (const [name, value] of Object.entries(changes)) {
    if (name === 'name') patch.identity = { name: value };
    else patch.data[name] = value;
  }
  return Object.keys(patch.data).length || patch.identity ? patch : null;
};
const emitPatch = changes => {
  const instance = props.node.instances[0];
  const patch = wirePatchFor(changes);
  if (instance && patch) emit('patch', { instance, patch });
};
const toggleEditing = () => {
  const instance = props.node.instances[0];
  if (!editing.value) {
    Object.keys(draft).forEach(key => delete draft[key]);
    Object.assign(draft, JSON.parse(JSON.stringify(instance?.fields || {})));
    editing.value = true;
    return;
  }
  editing.value = false;
  if (!instance) return;
  const changes = {};
  for (const [name, value] of Object.entries(draft)) {
    if (JSON.stringify(value ?? null) !== JSON.stringify(instance.fields?.[name] ?? null)) changes[name] = value;
  }
  emitPatch(changes);
};
const inlineChange = ({ name, value } = {}) => emitPatch({ [name]: value });
const emitRun = (action, context) => emit('run', action, context);
// A region header already names its class, so a create action for that same
// type collapses to the bare localized "New" — the caption never repeats the
// header's class name or the initial state. Creates for other types (and
// every other action kind) keep their full resolved label.
const headerActionLabel = action => (
  action.actionKind === 'createInstance' && action.typeId === props.node.typeId
    ? t('uiMapping.new')
    : null
);
const instanceActionsForType = computed(() => props.instanceActions?.[props.node.typeId] || []);
// The detail header's action set: the composed node's manifest actions
// PLUS the per-instance quick actions (runtime state transitions ride
// here) — the strip's steps draw from this combined list.
const headerActions = computed(() => [
  ...(props.node.actions || []),
  ...instanceActionsForType.value.filter(action => action?.__runtime)
]);
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
const { localizedTypeLabel } = useLocalizedTypeLabel();
const regionLabelFor = region => localizedLabel({ te, t }, typeLabelKey(region.typeId), region.type ? localizedTypeLabel(region.type) : region.id);
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
// contract; filters apply client-side over the loaded instances. Facet
// selections are value sets — an empty set is no selection at all. The
// controls stay closed until their header toggle opens them, so the
// header reads as one line (wrapping only when the opened controls or
// the action cluster demand it); selections persist while toggled and
// the filter toggle carries the active-selection count.
const search = ref('');
const searchOpen = ref(false);
const searchToggleAvailable = computed(() => toolbarVisibleFor(props.node));
// Filterable fields: the type's scalar fields plus relation, parent, and
// children traversal axes, with the primary status over the values
// actually present. The name axis always exists, so every list surface
// offers the conditions panel — not only facet-rich ones.
const builderFields = computed(() => [
  {
    name: 'states.main',
    label: t('uiMapping.fieldStatus'),
    kind: 'enum',
    values: [...new Set(props.node.instances.map(instance => instance?.states?.main).filter(Boolean))].sort()
  },
  ...builderFieldsForType(props.node.type, { bundle: props.bundle })
].filter(field => field.kind !== 'enum' || field.values.length));
const facetsToggleAvailable = computed(() => builderFields.value.length > 0);
// The composed tree is persisted view state per type: it survives
// navigation and reloads (presentation data, never a process contract).
const builderScope = computed(() => `collection:${props.node.typeId}`);
const builderFilter = ref(loadFilterViewState(builderScope.value));
watch(builderScope, scope => {
  builderFilter.value = loadFilterViewState(scope);
});
watch(builderFilter, filter => storeFilterViewState(builderScope.value, filter));
// Card ordering: the sort bar moved into the header cluster — the same
// sortKeys contract, shared comparator, and persisted preference (scope
// kept) the DataView header owned. The sort control serves the card-grid
// projection (the table projection sorts natively by column).
const sortScope = computed(() => `card-grid:${props.node.typeId || ''}`);
const preferredSort = loadSortPreference(sortScope.value);
const sortName = ref(preferredSort?.name || props.node.listControls?.defaultSort || null);
const sortOrder = ref(preferredSort?.order || 1);
const sortOpen = ref(false);
const sortOptions = computed(() => (props.node.listControls?.sortKeys || [])
  .map(key => ({ label: key.label, value: key.name })));
const sortKeyResolved = computed(() => (props.node.listControls?.sortKeys || [])
  .find(key => key.name === sortName.value) || null);
const sortToggleAvailable = computed(() => listLayout.value === 'card-grid' && sortOptions.value.length > 0);
const sortActive = computed(() => Boolean(sortName.value)
  && sortName.value !== props.node.listControls?.defaultSort);
watch([sortName, sortOrder], () => {
  if (sortName.value) storeSortPreference(sortScope.value, { name: sortName.value, order: sortOrder.value });
});
watch(sortScope, scope => {
  const restored = loadSortPreference(scope);
  sortName.value = restored?.name || props.node.listControls?.defaultSort || null;
  sortOrder.value = restored?.order || 1;
});
const sortedInstances = computed(() => (sortKeyResolved.value
  ? sortControlRows(filteredInstances.value, sortKeyResolved.value, sortOrder.value)
  : filteredInstances.value));
watch(() => props.node.id, () => {
  search.value = '';
  searchOpen.value = false;
  sortOpen.value = false;
});
const filteredInstances = computed(() => {
  if (props.node.surfaceKind !== 'list') return props.node.instances;
  const controls = props.node.listControls;
  if (!controls) return props.node.instances;
  const query = search.value.trim().toLowerCase();
  if (!query && !builderFilter.value) return props.node.instances;
  return props.node.instances.filter(instance =>
    instanceMatchesToolbar(props.node.type, controls, instance, query, {})
    && instanceMatchesFilter(instance, builderFilter.value, { pool: props.pool }));
});
</script>
