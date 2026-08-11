<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-signal-value"></div>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-share-alt text-signal-value" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
    </div>

    <div class="mt-3 rounded-ui border border-content-border bg-content px-2 py-1">
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <Tag :value="accessLabel" size="small" severity="secondary" />
        <Tag
          v-for="role in accessRoleLabels"
          :key="role"
          :value="role"
          size="small"
          severity="secondary"
        />
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <div v-if="isInbound" :class="socketClass('projection', 'left')">
        <span class="block truncate text-xs">{{ accessLabel }}</span>
      </div>
      <div v-if="!isInbound" :class="socketClass('entity', 'left')">
        <Handle id="entity-projection" type="target" :position="Position.Left" :class="handleClass('entity', 'left')" :style="handleStyle('entity')" />
        <Tag :value="inputLabel" size="small" severity="secondary" />
      </div>
      <div v-else :class="socketClass('entity', 'right')">
        <Handle id="output" type="source" :position="Position.Right" :class="handleClass('entity', 'right')" :style="handleStyle('entity')" />
        <Tag :value="receivedLabel" size="small" severity="success" />
      </div>
      <div v-if="!isInbound" :class="socketClass('projection', 'right')">
        <Handle id="output" type="source" :position="Position.Right" :class="handleClass('projection', 'right')" :style="handleStyle('projection')" />
        <div class="flex flex-wrap gap-1">
          <Tag v-for="field in visibleProjectedFields" :key="field" :value="field" size="small" />
          <Tag v-if="hiddenProjectedFieldCount > 0" :value="`+${hiddenProjectedFieldCount}`" size="small" />
          <span v-if="!visibleProjectedFields.length" class="text-xs text-muted-color">{{ $t('common.notAvailable') }}</span>
        </div>
      </div>
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

const nodeFrameClass = computed(() => [
  'relative min-w-72 rounded-ui border bg-content px-3 py-3 pt-4 shadow-card transition-colors',
  props.selected ? 'border-primary' : 'border-content-border'
]);
const isInbound = computed(() => props.data.direction === 'inbound');
const inputLabel = computed(() => props.data.entityType || props.data.refId);
const receivedLabel = computed(() => [props.data.entityType, props.data.outputSpecs?.[0]?.detail].filter(Boolean).join(' · '));
const accessLabel = computed(() => isInbound.value ? t('processDesigner.receive') : t('processDesigner.send'));
const projectedFields = computed(() => props.data.projection?.fields || []);
const visibleProjectedFields = computed(() => projectedFields.value.slice(0, 4));
const hiddenProjectedFieldCount = computed(() => Math.max(projectedFields.value.length - visibleProjectedFields.value.length, 0));
const receiveRoleLabels = computed(() => props.data.receiveRoleLabels || []);
const sendRoleLabels = computed(() => props.data.sendRoleLabels || []);
const accessRoleLabels = computed(() => isInbound.value ? receiveRoleLabels.value : sendRoleLabels.value);

function socketClass(kind, side) {
  return [
    'relative min-w-0 border-b border-content-border py-1',
    side === 'left' ? 'pl-3 pr-2' : 'pl-2 pr-3 text-right',
  ];
}

function handleClass(kind, side) {
  return [
    side === 'left' ? '!left-0 !-translate-x-1/2' : '!right-0 !translate-x-1/2'
  ];
}

function handleStyle(kind) {
  return processSocketHandleStyle({ kind });
}
</script>
