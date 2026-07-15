<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-emerald-500"></div>

    <div class="flex items-start gap-2">
      <i :class="[actionIcon, 'mt-0.5 text-emerald-600']"></i>
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs font-semibold uppercase text-emerald-700">{{ actionKindLabel }}</div>
        <div class="truncate text-sm font-medium">{{ title }}</div>
        <div v-if="subtitle" class="truncate text-xs text-muted-color">{{ subtitle }}</div>
      </div>
      <Tag :value="triggerMode" severity="secondary" size="small" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <div v-for="(input, index) in inputSpecs" :key="input.id" :class="socketClass(input, 'left')">
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
          <span class="block truncate text-xs">{{ input.label }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="(output, index) in outputSpecs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="block truncate text-xs">{{ output.label }}</span>
        </div>
      </div>
    </div>

    <div class="relative mt-3 flex items-center justify-end rounded-ui border border-content-border px-2 py-1">
      <Handle
        v-if="triggerMode === 'event'"
        id="trigger"
        type="target"
        :position="Position.Left"
        class="!left-0 !-translate-x-1/2 !border-violet-500 !bg-violet-500"
      />
      <Handle id="event" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-violet-500 !bg-violet-500" />
      <span class="truncate text-xs text-muted-color">{{ eventLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const action = computed(() => props.data.actionRecord || {});
const triggerMode = computed(() => action.value.trigger?.mode || props.data.triggerMode || 'manual');
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const eventLabel = computed(() => props.data.eventLabel || t('processDesigner.actionCompleted'));
const actionKindLabel = computed(() => props.data.actionKindLabel || action.value.actionKind || 'action');
const title = computed(() => action.value.label || props.data.actionTitleLabel || props.data.label || props.data.refId || 'Action');
const subtitle = computed(() => action.value.commandId || actionEntityType.value || '');
const actionEntityType = computed(() => action.value.entityType || inputSpecs.value.find(input => input.entityType)?.entityType || '');
const actionIcon = computed(() => ({
  createEntity: 'pi pi-plus-circle',
  mutateEntity: 'pi pi-pencil',
  runCommand: 'pi pi-play-circle',
  sendToOrganization: 'pi pi-send'
})[action.value.actionKind] || 'pi pi-bolt');
const nodeFrameClass = computed(() => [
  'relative min-w-60 max-w-72 rounded-ui border bg-content px-3 py-3 pt-4 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);

function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, kind: 'data' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      kind: item.kind || 'data',
      entityType: item.entityType || '',
      required: Boolean(item.required)
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 rounded-ui border border-content-border px-2 py-0.5',
    side === 'left' ? 'pl-3' : 'pr-3 text-right'
  ];
}

function handleClass(item, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2',
    socketTone(item)
  ];
}

function socketTone(item = {}) {
  return ({
    entity: '!border-sky-500 !bg-sky-500',
    block: '!border-cyan-500 !bg-cyan-500',
    status: '!border-orange-500 !bg-orange-500',
    event: '!border-violet-500 !bg-violet-500'
  })[item.kind] || '!border-emerald-500 !bg-emerald-500';
}
</script>
