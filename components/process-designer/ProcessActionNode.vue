<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-emerald-500"></div>
    <div class="nodrag grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-1">
      <span class="text-xs font-semibold uppercase text-emerald-700">{{ actionKindLabel }}</span>
      <Select
        v-if="showEntitySelector"
        :model-value="action.entityType || ''"
        :options="data.entityTypeOptions || []"
        option-label="label"
        option-value="value"
        class="min-w-0"
        size="small"
        @update:model-value="value => updateAndSync({ entityType: value })"
      />
      <Select
        v-if="action.actionKind === 'createEntity'"
        :model-value="action.status?.to || ''"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="min-w-0"
        size="small"
        :placeholder="$t('processDesigner.targetStatus')"
        @update:model-value="value => updateStatus({ to: value })"
      />
      <Select
        v-else-if="action.actionKind === 'runCommand'"
        :model-value="action.commandId || ''"
        :options="data.commandOptions || []"
        option-label="label"
        option-value="value"
        class="min-w-0"
        size="small"
        @update:model-value="value => updateAndSync({ commandId: value })"
      />
      <MultiSelect
        v-else-if="action.actionKind === 'updateEntity'"
        :model-value="action.mutation?.fields || []"
        :options="data.fieldOptions || []"
        option-label="label"
        option-value="value"
        display="chip"
        class="min-w-0"
        size="small"
        @update:model-value="value => updateMutation({ fields: value })"
      />
      <InputText
        v-else
        :model-value="action.label || data.label || data.refId"
        class="min-w-0"
        size="small"
        :aria-label="$t('processDesigner.label')"
        @update:model-value="value => updateAction({ label: value })"
      />
    </div>

    <div class="nodrag mt-2 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-1 rounded-ui border border-content-border p-1">
        <Select
          :model-value="action.access?.level || 'write'"
          :options="data.accessLevelOptions || []"
          option-label="label"
          option-value="value"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateAccess({ level: value })"
        />
        <MultiSelect
          :model-value="action.access?.roleIds || []"
          :options="data.roleOptions || []"
          option-label="label"
          option-value="value"
          display="chip"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateAccess({ roleIds: value })"
        />
        <div v-if="effectiveAccessLabels.length" class="col-span-2 flex min-w-0 flex-wrap gap-1 px-1">
          <span
            v-for="item in effectiveAccessLabels"
            :key="item"
            class="max-w-full truncate rounded-ui border border-content-border px-1.5 py-0.5 text-xs text-muted-color"
          >
            {{ item }}
          </span>
        </div>
        <div v-if="inheritedAccessLabels.length" class="col-span-2 flex min-w-0 items-center gap-1 px-1">
          <span
            v-for="item in inheritedAccessLabels"
            :key="item"
            class="min-w-0 truncate text-xs text-muted-color"
          >
            {{ item }}
          </span>
          <Button
            icon="pi pi-refresh"
            text
            rounded
            size="small"
            class="ml-auto !h-6 !w-6"
            :aria-label="$t('common.reset')"
            @click="resetAccess"
          />
        </div>
    </div>

    <div v-if="hasInlineControls" class="nodrag mt-2 grid grid-cols-2 gap-1">
      <Select
        v-if="action.actionKind === 'changeStatus'"
        :model-value="action.status?.to || ''"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="col-span-2 min-w-0"
        size="small"
        :placeholder="$t('processDesigner.targetStatus')"
        @update:model-value="value => updateStatus({ to: value })"
      />
      <MultiSelect
        v-if="action.actionKind === 'sendToOrganization'"
        :model-value="action.projection?.fields || []"
        :options="data.fieldOptions || []"
        option-label="label"
        option-value="value"
        display="chip"
        class="col-span-2 min-w-0"
        size="small"
        @update:model-value="value => updateProjection({ fields: value })"
      />
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          class="relative min-w-0 rounded-ui border border-content-border px-2 py-0.5 pl-3"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <span class="block truncate text-xs">{{ input.label }}</span>
            <div v-if="input.detail" class="truncate text-xs text-muted-color">{{ input.detail }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          class="relative min-w-0 rounded-ui border border-content-border px-2 py-0.5 pr-3 text-right"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <span class="block truncate text-xs">{{ output.label }}</span>
            <div v-if="output.detail" class="truncate text-xs text-muted-color">{{ output.detail }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="relative mt-2 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-1 rounded-ui border border-content-border p-1">
      <Handle
        v-if="triggerMode === 'event'"
        id="trigger"
        type="target"
        :position="Position.Left"
        class="!left-0 !-translate-x-1/2 !border-sky-500 !bg-sky-500"
      />
      <Select
        :model-value="triggerMode"
        :options="data.triggerModeOptions || []"
        option-label="label"
        option-value="value"
        class="nodrag min-w-0"
        size="small"
        @update:model-value="value => updateTrigger({ mode: value })"
      />
      <div class="relative min-w-0 rounded-ui border border-content-border px-2 py-0.5 pr-3 text-right">
        <Handle id="event" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-sky-500 !bg-sky-500" />
        <span class="block truncate text-xs">{{ eventLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const nodeFrameClass = computed(() => [
  'relative min-w-72 rounded-ui border bg-content px-2 py-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const action = computed(() => props.data.actionRecord || {});
const triggerMode = computed(() => action.value.trigger?.mode || props.data.triggerMode || 'manual');
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const effectiveAccessLabels = computed(() => props.data.effectiveAccessLabels || []);
const inheritedAccessLabels = computed(() => props.data.inheritedAccessLabels || []);
const eventLabel = computed(() => props.data.eventLabel || t('processDesigner.actionCompleted'));
const actionKindLabel = computed(() => props.data.actionKindLabel || props.data.actionKind || t('common.actions.title'));
const statusOptions = computed(() => props.data.statusOptions || []);
const showEntitySelector = computed(() => ['createEntity', 'sendToOrganization'].includes(action.value.actionKind));
const hasInlineControls = computed(() => ['changeStatus', 'sendToOrganization'].includes(action.value.actionKind));
function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, detail: '' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      detail: item.detail || ''
    };
  });
}

function socketHandleId(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function updateAction(updates) {
  props.data.onActionUpdate?.(updates);
}

function updateAndSync(updates) {
  props.data.onActionUpdate?.(updates, { syncIo: true });
}

function updateTrigger(updates) {
  props.data.onActionUpdate?.({
    trigger: {
      ...(action.value.trigger || {}),
      ...updates
    }
  }, { syncIo: true });
}

function updateAccess(updates) {
  props.data.onActionUpdate?.({
    access: {
      ...(action.value.access || {}),
      ...updates
    }
  }, { syncIo: true });
}

function resetAccess() {
  props.data.onActionResetAccess?.();
}

function updateStatus(updates) {
  props.data.onActionUpdate?.({
    status: {
      ...(action.value.status || {}),
      ...updates
    }
  }, { syncIo: true });
}

function updateProjection(updates) {
  props.data.onActionUpdate?.({
    projection: {
      ...(action.value.projection || {}),
      ...updates
    }
  }, { syncIo: true });
}

function updateMutation(updates) {
  props.data.onActionUpdate?.({
    mutation: {
      ...(action.value.mutation || {}),
      ...updates
    }
  }, { syncIo: true });
}
</script>
