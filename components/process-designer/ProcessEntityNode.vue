<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-sky-500"></div>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-box text-sky-600" aria-hidden="true"></i>
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

    <div class="mt-3 grid grid-cols-2 gap-2">
      <div class="rounded-ui border border-content-border p-2">
        <small class="mb-1 block text-muted-color">{{ $t('processDesigner.publicFields') }}</small>
        <div class="flex flex-wrap gap-1">
          <Tag v-for="field in visibleReadFields" :key="field" :value="field" size="small" />
          <Tag v-if="hiddenReadFieldCount > 0" :value="`+${hiddenReadFieldCount}`" size="small" />
          <span v-if="!visibleReadFields.length" class="text-xs text-muted-color">{{ $t('common.notAvailable') }}</span>
        </div>
      </div>
      <div class="rounded-ui border border-content-border p-2">
        <small class="mb-1 block text-muted-color">{{ $t('processDesigner.writeFields') }}</small>
        <div class="flex flex-wrap gap-1">
          <Tag v-for="field in visibleWriteFields" :key="field" :value="field" size="small" severity="warning" />
          <Tag v-if="hiddenWriteFieldCount > 0" :value="`+${hiddenWriteFieldCount}`" size="small" severity="warning" />
          <span v-if="!visibleWriteFields.length" class="text-xs text-muted-color">{{ $t('common.notAvailable') }}</span>
        </div>
      </div>
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
  'relative min-w-72 rounded-ui border bg-content px-3 py-3 pt-4 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const visibleStates = computed(() => (props.data.stateLabels || []).slice(0, 4));
const hiddenStateCount = computed(() => Math.max((props.data.stateLabels || []).length - visibleStates.value.length, 0));
const visibleReadFields = computed(() => (props.data.fieldPolicy?.read || []).slice(0, 3));
const visibleWriteFields = computed(() => (props.data.fieldPolicy?.write || []).slice(0, 3));
const hiddenReadFieldCount = computed(() => Math.max((props.data.fieldPolicy?.read || []).length - visibleReadFields.value.length, 0));
const hiddenWriteFieldCount = computed(() => Math.max((props.data.fieldPolicy?.write || []).length - visibleWriteFields.value.length, 0));
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
    entity: { row: 'border-sky-300 bg-sky-50/60', handle: '!border-sky-500 !bg-sky-500' },
    block: { row: 'border-cyan-300 bg-cyan-50/60', handle: '!border-cyan-500 !bg-cyan-500' },
    status: { row: 'border-amber-300 bg-amber-50/60', handle: '!border-amber-500 !bg-amber-500' },
    data: { row: 'border-emerald-300 bg-emerald-50/60', handle: '!border-emerald-500 !bg-emerald-500' }
  })[item.kind] || { row: 'border-content-border', handle: '!border-sky-500 !bg-sky-500' };
}
</script>
