<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-y-0 left-0 w-1 rounded-l-ui bg-signal-data"></div>
    <div class="flex min-w-0 items-center gap-2 pl-1">
      <i :class="actionIcon" class="text-signal-data" aria-hidden="true"></i>
      <div class="min-w-0 flex-1">
        <span class="block truncate text-xs font-semibold text-signal-data">{{ actionKindLabel }}</span>
        <strong class="block truncate text-sm">{{ actionTitleLabel }}</strong>
      </div>
      <Tag v-if="triggerMode === 'event'" :value="$t('processDesigner.eventTrigger')" severity="secondary" size="small" />
    </div>

    <div v-if="accessLabels.length" class="mt-2 flex max-w-72 flex-wrap gap-1 pl-1">
      <Tag v-for="label in accessLabels" :key="label" :value="label" severity="secondary" size="small" />
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2 pl-1">
      <div class="flex flex-col gap-1">
        <div v-for="(input, index) in inputSpecs" :key="input.id" :class="socketClass(input, 'left')">
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" :style="handleStyle(input)" />
          <span class="block truncate text-xs">{{ input.label }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="(output, index) in outputSpecs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" :style="handleStyle(output)" />
          <span class="block truncate text-xs">{{ output.label }}</span>
        </div>
      </div>
    </div>

    <div class="relative mt-2 min-w-0 rounded-ui border border-content-border py-0.5 pl-2 pr-3 text-right">
      <Handle
        v-if="triggerMode === 'event'"
        id="trigger"
        type="target"
        :position="Position.Left"
        class="!left-0 !-translate-x-1/2"
        :style="handleStyle({ kind: 'event' })"
      />
      <Handle id="event" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2" :style="handleStyle({ kind: 'event' })" />
      <span class="block truncate text-xs text-muted-color">{{ eventLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';
import { processSocketHandleStyle } from '~/utils/processDesignerSocketTone.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const action = computed(() => props.data.actionRecord || {});
const triggerMode = computed(() => action.value.trigger?.mode || props.data.triggerMode || 'manual');
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || []));
const eventLabel = computed(() => props.data.eventLabel || t('processDesigner.actionCompleted'));
const actionTitleLabel = computed(() => props.data.actionTitleLabel || props.data.label || props.data.refId || '');
const actionKindLabel = computed(() => props.data.actionKindLabel || props.data.actionKind || '');
const actionIcon = computed(() => ({
  createEntity: 'pi pi-plus',
  updateEntity: 'pi pi-pencil',
  runCommand: 'pi pi-play',
  sendToOrganization: 'pi pi-send'
})[action.value.actionKind] || 'pi pi-bolt');
const accessLabels = computed(() => {
  const explicit = (action.value.access?.grants || []).map(grant => {
    const role = (props.data.roleOptions || []).find(option => option.value === grant.roleId);
    return [role?.label || grant.roleId, grant.level].filter(Boolean).join(' · ');
  });
  return [...new Set([...explicit, ...(props.data.inheritedAccessLabels || []), ...(props.data.effectiveAccessLabels || [])])];
});
const nodeFrameClass = computed(() => [
  'relative min-w-64 rounded-ui border bg-content p-2 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, kind: 'data' };
    return {
      ...item,
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      kind: item.kind || item.type?.base || 'data'
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 border-b border-content-border py-0.5',
    side === 'left' ? 'pl-3' : 'pr-3 text-right',
  ];
}

function handleClass(item, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
}

function handleStyle(item) {
  return processSocketHandleStyle(item);
}
</script>
