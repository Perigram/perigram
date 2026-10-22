<template>
  <div v-if="node.surfaceKind === 'list'" :class="[listStack, listWidth]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <i v-if="node.type" :class="iconFor(node.type)" />
        <span :class="embedded ? 'text-label min-w-0 truncate' : 'text-section-heading'">{{ regionLabel }}</span>
        <Tag :value="String(node.instances.length)" severity="secondary" />
      </div>
      <div v-if="collectionActions.length || searchToggleAvailable || facetsToggleAvailable" class="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <!-- Search expands IN PLACE: the icon button becomes an icon field
             at the same position; the icon or Esc collapses it back (an
             empty blur collapses too). -->
        <IconField v-if="searchOpen">
          <InputIcon class="pi pi-search cursor-pointer" @click="searchOpen = false" />
          <InputText
            v-model="search"
            size="small"
            class="min-w-0 max-w-48 flex-1"
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
        <Button
          v-if="projectionSwitchable"
          :icon="listLayout === 'board' ? 'pi pi-list' : 'pi pi-objects-column'"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="listLayout === 'board' ? $t('uiMapping.projectionTable') : $t('uiMapping.projectionBoard')"
          @click="toggleProjection"
        />
        <SortControl
          v-if="sortToggleAvailable"
          :options="sortOptions"
          :model-value="sortName"
          :order="sortOrder"
          @update:model-value="value => (sortName = value)"
          @update:order="value => (sortOrder = value)"
        />
        <ActionButton
          v-for="action in collectionActions"
          :key="action.id"
          :action="action"
          :state-policy="node.statePolicy"
          :label="headerActionLabel(action)"
          @run="emitRun"
        />
      </div>
    </div>
    <RegionDataState v-if="showState" :node="node" />
    <div v-if="showSurfaces" :class="embeddedStack">
      <RegionCollections
        :node="node"
        :list-layout="listLayout"
        :filtered-instances="filteredInstances"
        :sorted-instances="sortedInstances"
        :effective-pool="effectivePool"
        :bundle="bundle"
        :openable="openable"
        :instance-actions="instanceActionsForType"
        :resolve-transitions="resolveTransitions"
        :is-reloading="isReloading"
        @open="emitOpen"
        @run="emitRun"
        @transition="payload => emit('transition', payload)"
      />
    </div>
    <RegionChildren
      v-if="node.childRegions.length"
      :regions="node.childRegions"
      :arrangement="node.childArrangement"
      :depth="depth"
      :pool="pool"
      :bundle="bundle"
      :openable="openable"
      :instance-actions="instanceActions"
      @run="emitRun"
      @open="emitOpen"
    />
  </div>

  <div v-else :class="[stackFor, 'w-full']">
    <RegionDataState v-if="showState" :node="node" />
    <template v-if="depth === 0 && showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <SurfaceHeader
        :type="node.type"
        :instance="node.instances[0]"
        :actions="headerActions"
        :level="node.level"
        :pool="pool"
        :bundle="bundle"
        :state-policy="node.statePolicy"
        :navigation="depth === 0 ? navigation : null"
        :editor-action="editorActions?.[node.type?.id] || null"
        @run="emitRun"
        @transition="payload => emit('transition', { ...payload, instance: node.instances[0] })"
        @refresh="emit('refresh')"
        @open-instance="emitOpen"
      />
      <div v-if="splitSide" class="region-split-host">
        <div
          class="region-split grid w-full grid-cols-1 gap-6"
          :style="splitTracks"
        >
          <div class="min-w-0 flex flex-col gap-6">
            <SurfaceBody
              v-bind="bodyProps"
              variant="full"
              :editable="patchable"
              v-on="bodyEvents"
            />
          </div>
          <div class="min-w-0 flex flex-col gap-6">
            <RegionChildren
              v-bind="childrenProps"
              v-on="childrenEvents"
              :arrangement="{ mode: 'stack' }"
            />
          </div>
        </div>
      </div>
      <template v-else>
        <SurfaceBody
          v-bind="bodyProps"
          variant="full"
          :editable="patchable"
          v-on="bodyEvents"
        />
        <RegionChildren
          v-if="node.childRegions.length"
          v-bind="childrenProps"
          v-on="childrenEvents"
          :arrangement="node.childArrangement"
        />
      </template>
    </template>
    <template v-else-if="showSurfaces">
      <ProgressBar v-if="isReloading" mode="indeterminate" class="h-1" :aria-label="$t('uiMapping.loadingRegion')" />
      <SurfaceBody
        v-bind="bodyProps"
        :variant="node.variant"
        v-on="bodyEvents"
      />
      <RegionChildren
        v-if="node.childRegions.length"
        v-bind="childrenProps"
        v-on="childrenEvents"
        :arrangement="node.childArrangement"
      />
    </template>
    <RegionChildren
      v-if="showSurfaces && node.stubRegions?.length"
      v-bind="childrenProps"
      v-on="childrenEvents"
      :regions="node.stubRegions"
      :arrangement="{ mode: 'stack' }"
      pack
    />
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import ProgressBar from 'primevue/progressbar';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import {
  LAYOUT, GAP_BY_LEVEL, SMALL_LIST_AT, resolveListLayout, toolbarVisibleFor, sortControlRows,
  hasStateVocabulary, localizedLabel, typeLabelKey, instanceMatchesToolbar, incomingChildrenEdges, iconFor
} from '#shared/ui-mapping/index.js';
import { instanceMatchesFilter } from '#shared/instance-filters/index.js';
import { builderFieldsForType } from '#shared/ui-mapping/index.js';
import { loadSortPreference, storeSortPreference, loadProjectionPreference, storeProjectionPreference, loadFilterViewState, storeFilterViewState } from '~/utils/ui-view-state.js';
import SurfaceBody from './SurfaceBody.vue';
import SortControl from './SortControl.vue';
import ActionButton from './ActionButton.vue';
import SurfaceHeader from './SurfaceHeader.vue';
import FilterBuilder from '../shared/FilterBuilder.vue';
import RegionDataState from './RegionDataState.vue';
import RegionCollections from './RegionCollections.vue';
import RegionChildren from './RegionChildren.vue';
import { useLocalizedTypeLabel } from './type-labels.js';
const props = defineProps({
  node: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // Lazy type loader for the containment cross-cut (the parent-context
  // overlay below): `async (typeId) => screenInstance[]`, owned by the
  // app host that owns the instance store.
  loadType: { type: Function, default: null },
  depth: { type: Number, default: 0 },
  embedded: { type: Boolean, default: false },
  // Collection identities render as links when an instance-open handler
  // exists upstream (GeneratedMappingScreen onOpen).
  openable: { type: Boolean, default: false },
  // Per-instance quick actions by type id (resolveInstanceActions map).
  instanceActions: { type: Object, default: null },
  // Whether the detail affordances may persist edits (the engine binds
  // this to the presence of an onPatch executor).
  patchable: { type: Boolean, default: false },
  // Machine-authority transition resolver for board drags (the host's state
  // service): passed through to the board projection.
  resolveTransitions: { type: Function, default: null },
  // Host-injected contextual back affordance for the record header
  // (`{ icon, label, command }` — SurfaceHeader's navigation channel).
  navigation: { type: Object, default: null },
  // Editor action components by type (the host resolves them over the
  // file-surface registry; the header renders what it is given).
  editorActions: { type: Object, default: null }
});

const emit = defineEmits(['run', 'transition', 'open', 'patch', 'refresh']);
const emitOpen = instance => emit('open', instance);
// One binding set for the record body and its child regions across the
// split, stack, and nested branches.
const bodyProps = computed(() => ({
  instance: props.node.instances[0],
  type: props.node.type,
  actions: props.node.actions,
  chrome: props.node.chrome,
  coveredRelations: coveredRelationKeys.value,
  pool: props.pool,
  bundle: props.bundle,
  statePolicy: props.node.statePolicy
}));
const childrenProps = computed(() => ({
  regions: props.node.childRegions,
  depth: props.depth,
  pool: props.pool,
  bundle: props.bundle,
  openable: props.openable,
  instanceActions: props.instanceActions
}));
// The record page's weight-proportional split: a light child set (at or
// under SIDE_MAX_WEIGHT rows) rides beside the record body, the side
// column's grid share earned by the children's weight (REGION_SIDE_SPANS
// over the 12-track record grid). Heavier child sets arrange below.
const splitSide = computed(() => props.depth === 0 && Boolean(props.node.besideBody));
const splitTracks = computed(() => ({
  '--main-fr': String(12 - (props.node.sideSpan || 5)),
  '--side-fr': String(props.node.sideSpan || 5)
}));
const { te, t } = useI18n();
const spacing = inject('uiMappingSpacing', null);

// The standalone list region sits on the section rhythm; embedded ones
// (side columns, tabs) stack tight.
// A list with nothing to show renders at content width — a dead
// collection is a compact stub, never a screen-wide banner.
const listWidth = computed(() => (props.node.surfaceKind === 'list'
  && !props.node.instances.length
  && state.value !== 'loading'
  ? 'w-fit max-w-full' : 'w-full'));
const listStack = computed(() => (props.embedded
  ? (spacing ? spacing.stackTight : LAYOUT.stackTight)
  : (spacing ? spacing.stack : LAYOUT[GAP_BY_LEVEL[props.node.level] || 'stack'])));
const stackFor = computed(() => (spacing ? spacing.stack : LAYOUT[GAP_BY_LEVEL[props.node.level] || 'stack']));

// The containment cross-cut's data: a region whose type someone's children
// edge names renders every row WITH its parent — and the parent records
// are not in this surface's pool (it loads the child type). Parent types
// load lazily through the same `loadType` seam the tree projection uses
// and overlay the pool every collection below reads; an unloaded parent
// still names its type (ParentRef degrades), so correctness never depends
// on the load landing.
const parentTypeIds = computed(() => [...new Set(
  incomingChildrenEdges(props.bundle, props.node.typeId).map(edge => edge.parentTypeId)
)]);
const loadedParents = ref({});
const effectivePool = computed(() => {
  if (!Object.keys(loadedParents.value).length) return props.pool;
  const overlay = Object.fromEntries(Object.entries(loadedParents.value)
    .map(([typeId, byId]) => [typeId, { ...(props.pool[typeId] || {}), ...byId }]));
  return { ...props.pool, ...overlay };
});
async function ensureParentTypes() {
  if (!props.loadType) return;
  for (const parentTypeId of parentTypeIds.value) {
    if (props.pool[parentTypeId] && Object.keys(props.pool[parentTypeId]).length) continue;
    if (loadedParents.value[parentTypeId]) continue;
    try {
      const rows = await props.loadType(parentTypeId);
      loadedParents.value = {
        ...loadedParents.value,
        [parentTypeId]: Object.fromEntries((rows || []).filter(Boolean).map(row => [row.id, row]))
      };
    } catch {
      loadedParents.value = { ...loadedParents.value, [parentTypeId]: {} };
    }
  }
}
onMounted(ensureParentTypes);
watch(() => [props.node.typeId, props.loadType], ensureParentTypes);

// Field-name changes map onto the flat §3 wire patch: the identifier row
// `name` writes the wire name slot, every other field lands under
// `fields.<name>` — the same shape the instance update transport
// (processUpdate) writes server-side.
const wirePatchFor = changes => {
  const patch = {};
  for (const [name, value] of Object.entries(changes)) {
    if (name === 'name') patch.name = value;
    else {
      patch.fields = patch.fields || {};
      patch.fields[name] = value;
    }
  }
  return Object.keys(patch).length ? patch : null;
};
const emitPatch = changes => {
  const instance = props.node.instances[0];
  const patch = wirePatchFor(changes);
  if (instance && patch) emit('patch', { instance, patch });
};
const inlineChange = ({ name, value } = {}) => emitPatch({ [name]: value });
const emitRun = (action, context) => emit('run', action, context);
const bodyEvents = {
  run: emitRun,
  'inline-change': inlineChange,
  'open-instance': emitOpen
};
const childrenEvents = { run: emitRun, open: emitOpen };
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
// The collection toolbar renders type-level actions only: creates. Every
// other action kind addresses a concrete instance (delete, transitions,
// instance-scoped commands) and renders on the instance surfaces — the
// row menus, the detail header, and the machine-served transitions —
// never beside the create button.
const collectionActions = computed(() => (props.node.actions || [])
  .filter(action => action?.actionKind === 'createInstance'));
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
const regionLabel = computed(() => localizedLabel({ te, t }, typeLabelKey(props.node.typeId), props.node.type ? localizedTypeLabel(props.node.type) : props.node.id));
// The derived list layout — the resolver's contract decision over shape,
// class, size, and the served state vocabulary. The projection
// switch below is the user's view-state override inside a bounded pair,
// never a second derivation.
const derivedListLayout = computed(() => resolveListLayout(props.node.type, {
  stateful: hasStateVocabulary(props.node.statePolicy),
  size: props.node.instances.length <= SMALL_LIST_AT
    ? 'small'
    : props.node.instances.length > 12 ? 'large' : null
}));
// The projection switch rides the same persisted-view-state seam as sort
// and filters: a stateful collection (a served vocabulary spanning at
// least BOARD_MIN_COLUMNS values) whose derived layout is a structural
// collection (table) may board, and a derived board may
// table back. Shape-specialized projections (timeline, stats, carousel,
// the handful list) never switch — the board would fight their shape.
// A stored preference for a non-switchable collection is ignored.
const projectionSwitchable = computed(() => hasStateVocabulary(props.node.statePolicy)
  && ['table', 'board'].includes(derivedListLayout.value));
const projectionScope = computed(() => `list-projection:${props.node.typeId || ''}`);
const projectionPreference = ref(loadProjectionPreference(projectionScope.value));
watch(projectionScope, scope => {
  projectionPreference.value = loadProjectionPreference(scope);
});
const toggleProjection = () => {
  const next = listLayout.value === 'board' ? 'table' : 'board';
  projectionPreference.value = next;
  storeProjectionPreference(projectionScope.value, next);
};
const listLayout = computed(() => {
  if (projectionPreference.value === 'board' && projectionSwitchable.value) return 'board';
  if (projectionPreference.value === 'table' && derivedListLayout.value === 'board') return 'table';
  return derivedListLayout.value;
});
// Relation keys covered by child regions — filled and stubs alike: a
// stub still owns its relation's surface (the body renders no duplicate
// empty section for it).
const coveredRelationKeys = computed(() => [...props.node.childRegions, ...(props.node.stubRegions || [])]
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
    name: 'state',
    label: t('uiMapping.fieldStatus'),
    kind: 'enum',
    values: [...new Set(props.node.instances.map(instance => instance?.state).filter(Boolean))].sort()
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
// projection (tables sort natively by column; the board sorts per column
// inside BoardCollection, on its own scoped preference).
const sortScope = computed(() => `card-grid:${props.node.typeId || ''}`);
const preferredSort = loadSortPreference(sortScope.value);
const sortName = ref(preferredSort?.name || props.node.listControls?.defaultSort || null);
const sortOrder = ref(preferredSort?.order || 1);
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


<style scoped>
/* Container-relative record split (the SurfaceHeader pattern — the
   tailwindcss build has no container-queries plugin, so this lives in
   real CSS). The host is the query container; the grid inside responds:
   the split engages past 60rem of container width and stacks inside
   panes, dialogs, and narrow columns. The track shares are weight-derived
   custom properties set by the template. */
.region-split-host {
  container-type: inline-size;
}

@container (min-width: 60rem) {
  .region-split {
    grid-template-columns: minmax(0, calc(var(--main-fr) * 1fr)) minmax(0, calc(var(--side-fr) * 1fr));
  }
}
</style>
