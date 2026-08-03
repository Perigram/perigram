<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-signal-entity"></div>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-box text-signal-entity" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
      <Badge :value="data.fieldCount || 0" severity="info" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          :class="socketClass(input, 'left')"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="block truncate text-xs">{{ input.label }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          :class="socketClass(output, 'right')"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="block truncate text-xs">{{ output.label }}</span>
        </div>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap gap-1">
      <Tag
        v-for="state in visibleStates"
        :key="state"
        :value="state"
        size="small"
        severity="secondary"
      />
      <Tag
        v-if="hiddenStateCount > 0"
        :value="`+${hiddenStateCount}`"
        size="small"
        severity="secondary"
      />
      <Tag
        :value="$t('processDesigner.transitionsCount', { count: data.transitionCount || 0 })"
        size="small"
        severity="success"
      />
    </div>

    <div class="mt-2 flex flex-wrap gap-1">
      <Tag :value="$t('processDesigner.publicFieldsCount', { count: readFieldCount })" size="small" severity="secondary" />
      <Tag :value="$t('processDesigner.writeFieldsCount', { count: writeFieldCount })" size="small" severity="secondary" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const nodeFrameClass = computed(() => [
  'relative min-w-64 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
const visibleStates = computed(() => (props.data.stateLabels || []).slice(0, 4));
const hiddenStateCount = computed(() => Math.max((props.data.stateLabels || []).length - visibleStates.value.length, 0));
const readFieldCount = computed(() => (props.data.fieldPolicy?.read || []).length);
const writeFieldCount = computed(() => (props.data.fieldPolicy?.write || []).length);
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || []));

function normalizeSpecs(items = []) {
  return items.map((item, index) => ({
    id: item.id || item.label || index,
    label: item.label || item.entityType || item.block || item.id,
    kind: item.kind || 'data'
  }));
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 rounded-ui border px-2 py-0.5',
    side === 'left' ? 'pl-3' : 'pr-3 text-right',
    socketTone(item).row
  ];
}

function handleClass(item, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2',
    socketTone(item).handle
  ];
}

function socketTone(item = {}) {
  return ({
    entity: { row: 'border-content-border bg-content', handle: '!border-signal-entity !bg-signal-entity' },
    block: { row: 'border-content-border bg-content', handle: '!border-signal-structure !bg-signal-structure' },
    status: { row: 'border-content-border bg-content', handle: '!border-signal-decision !bg-signal-decision' },
    data: { row: 'border-content-border bg-content', handle: '!border-signal-data !bg-signal-data' }
  })[item.kind] || { row: 'border-content-border', handle: '!border-signal-entity !bg-signal-entity' };
}
</script>
