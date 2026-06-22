<template>
  <div class="relative min-w-72 rounded-ui border border-sky-300 bg-content px-3 py-3 shadow-card">
    <Handle id="access" type="target" :position="Position.Left" class="!border-sky-500 !bg-sky-500" />
    <Handle id="service-input" type="source" :position="Position.Right" class="!border-amber-500 !bg-amber-500" />
    <Handle id="socket-source" type="source" :position="Position.Bottom" class="!border-violet-500 !bg-violet-500" />

    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="pi pi-box text-primary" aria-hidden="true"></i>
          <strong class="truncate">{{ data.label || data.entityType || data.refId }}</strong>
        </div>
        <small class="text-muted-color">{{ data.entityType || $t('processDesigner.entityType') }}</small>
      </div>
      <Badge :value="data.fieldCount || 0" severity="info" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <Tag :value="data.lifecycleMode || $t('processDesigner.defaultCreated')" size="small" />
      <Tag :value="$t('processDesigner.fieldsCount', { count: data.fieldCount || 0 })" size="small" severity="info" />
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

const props = defineProps({ data: { type: Object, default: () => ({}) } });

const visibleStates = computed(() => (props.data.stateLabels || []).slice(0, 4));
const hiddenStateCount = computed(() => Math.max((props.data.stateLabels || []).length - visibleStates.value.length, 0));
const visibleReadFields = computed(() => (props.data.fieldPolicy?.read || []).slice(0, 3));
const visibleWriteFields = computed(() => (props.data.fieldPolicy?.write || []).slice(0, 3));
const hiddenReadFieldCount = computed(() => Math.max((props.data.fieldPolicy?.read || []).length - visibleReadFields.value.length, 0));
const hiddenWriteFieldCount = computed(() => Math.max((props.data.fieldPolicy?.write || []).length - visibleWriteFields.value.length, 0));
</script>
