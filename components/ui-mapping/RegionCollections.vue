<template>
  <ProgressBar v-if="isReloading" mode="indeterminate" :class="LAYOUT.reloadBar" :aria-label="$t('uiMapping.loadingRegion')" />
  <CollectionTable
    v-if="listLayout === 'table'"
    :instances="filteredInstances"
    :type="node.type"
    :controls="node.listControls"
    :openable="openable"
    :parented="parented"
    :pool="effectivePool"
    :bundle="bundle"
    :state-policy="node.statePolicy"
    :actions="instanceActions"
    :relation-unlink="relationUnlink"
    :patchable="patchable"
    @open="instance => emit('open', instance)"
    @run="(action, context) => emit('run', action, context)"
    @inline-change="payload => emit('inline-change', payload)"
  />
  <div v-else-if="listLayout === 'records'" :class="LAYOUT.stackTight">
    <SurfaceBody
      v-for="instance in filteredInstances"
      :key="instance.id"
      :instance="instance"
      :type="node.type"
      :pool="effectivePool"
      :bundle="bundle"
      :state-policy="node.statePolicy"
      :openable="openable"
      variant="detail"
      @open-instance="target => emit('open', target)"
      @run="(action, context) => emit('run', action, context)"
      @inline-change="change => emit('inline-change', { instance, change: { [change.name]: change.value } })"
    />
  </div>
  <CardGrid
    v-else-if="listLayout === 'card-grid'"
    :instances="sortedInstances"
    :type="node.type"
    :controls="node.listControls"
    :actions="instanceActions"
    :relation-unlink="relationUnlink"
    :openable="openable"
    :parented="parented"
    :pool="effectivePool"
    :bundle="bundle"
    :state-policy="node.statePolicy"
    @open="instance => emit('open', instance)"
    @run="(action, context) => emit('run', action, context)"
  />
  <BoardCollection
    v-else-if="listLayout === 'board'"
    :instances="filteredInstances"
    :type="node.type"
    :controls="node.listControls"
    :actions="instanceActions"
    :openable="openable"
    :pool="effectivePool"
    :bundle="bundle"
    :state-policy="node.statePolicy"
    :state-transitions="node.stateTransitions"
    :resolve-transitions="resolveTransitions"
    @open="instance => emit('open', instance)"
    @run="(action, context) => emit('run', action, context)"
    @transition="payload => emit('transition', payload)"
  />
  <TimelineCollection
    v-else-if="listLayout === 'timeline'"
    :instances="filteredInstances"
    :type="node.type"
    :controls="node.listControls"
    :openable="openable"
    :pool="effectivePool"
    :bundle="bundle"
    @open="instance => emit('open', instance)"
  />
  <GanttCollection
    v-else-if="listLayout === 'gantt'"
    :instances="filteredInstances"
    :type="node.type"
    :openable="openable"
    :state-policy="node.statePolicy"
    @open="instance => emit('open', instance)"
  />
  <CalendarCollection
    v-else-if="listLayout === 'calendar'"
    :instances="filteredInstances"
    :type="node.type"
    :openable="openable"
    @open="instance => emit('open', instance)"
  />
  <StatGrid
    v-else-if="listLayout === 'stats'"
    :instances="filteredInstances"
    :type="node.type"
    :openable="openable"
    :pool="effectivePool"
    :bundle="bundle"
    :state-policy="node.statePolicy"
    @open="instance => emit('open', instance)"
  />
</template>

<script setup>
// The collection materialization: the derived (or user-switched) list
// layout picks the one projection this region renders. Extracted from
// RegionBlock so the embedded and standalone list surfaces share the
// exact same switch.
import ProgressBar from 'primevue/progressbar';
import { useI18n } from 'vue-i18n';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import CollectionTable from './CollectionTable.vue';
import SurfaceBody from './SurfaceBody.vue';
import CardGrid from './CardGrid.vue';
import BoardCollection from './BoardCollection.vue';
import GanttCollection from './GanttCollection.vue';
import CalendarCollection from './CalendarCollection.vue';
import TimelineCollection from './TimelineCollection.vue';
import StatGrid from './StatGrid.vue';

defineProps({
  node: { type: Object, required: true },
  listLayout: { type: String, default: 'table' },
  filteredInstances: { type: Array, default: () => [] },
  sortedInstances: { type: Array, default: () => [] },
  effectivePool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  openable: { type: Boolean, default: false },
  // The containment cross-cut composes on this collection (unscoped class
  // list): rows carry their parent context token.
  parented: { type: Boolean, default: false },
  instanceActions: { type: Array, default: () => [] },
  // SPEC §22.12: `{ parent, actions }` — the relation-scoped section's
  // unlink actions with the parent record their rows are linked through.
  relationUnlink: { type: Object, default: null },
  // Cell values edit in place when the host binds a patch executor.
  patchable: { type: Boolean, default: false },
  resolveTransitions: { type: Function, default: null },
  isReloading: { type: Boolean, default: false }
});

const emit = defineEmits(['open', 'run', 'transition', 'inline-change']);
const { t } = useI18n();
</script>
