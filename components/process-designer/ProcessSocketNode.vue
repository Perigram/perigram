<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-violet-500"></div>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-share-alt text-violet-600" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
    </div>

    <div class="relative mt-3 rounded-ui border border-content-border px-2 py-1">
      <Handle id="receive-role" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2 !border-violet-500 !bg-violet-500" />
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <Tag :value="$t('processDesigner.receiveAccess')" size="small" severity="secondary" />
        <Tag
          v-for="role in receiveRoleLabels"
          :key="role"
          :value="role"
          size="small"
          severity="secondary"
        />
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <div class="relative rounded-ui border border-content-border py-1 pl-3 pr-2">
        <Handle id="entity-projection" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-violet-500 !bg-violet-500" />
        <Tag :value="inputLabel" size="small" severity="secondary" />
      </div>
      <div class="relative rounded-ui border border-content-border py-1 pl-2 pr-3 text-right">
        <Handle id="transfer" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-violet-500 !bg-violet-500" />
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

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const nodeFrameClass = computed(() => [
  'relative min-w-72 rounded-ui border bg-content px-3 py-3 pt-4 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const inputLabel = computed(() => [props.data.direction || 'transfer', props.data.entityType].filter(Boolean).join(' · '));
const projectedFields = computed(() => props.data.projection?.fields || []);
const visibleProjectedFields = computed(() => projectedFields.value.slice(0, 4));
const hiddenProjectedFieldCount = computed(() => Math.max(projectedFields.value.length - visibleProjectedFields.value.length, 0));
const receiveRoleLabels = computed(() => props.data.receiveRoleLabels || []);
</script>
