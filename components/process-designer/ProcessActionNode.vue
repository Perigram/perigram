<template>
  <div class="relative min-w-80 rounded-ui border border-emerald-300 bg-content px-3 py-3 shadow-card">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <i :class="iconClass" aria-hidden="true"></i>
          <InputText
            :model-value="action.label || data.label || data.actionKind || data.refId"
            class="nodrag w-full"
            size="small"
            :aria-label="$t('processDesigner.label')"
            @update:model-value="value => updateAction({ label: value })"
          />
        </div>
        <div class="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          <Tag :value="actionKindLabel" size="small" severity="success" />
          <small class="truncate text-muted-color">{{ subtitle }}</small>
        </div>
      </div>
    </div>

    <div class="relative mt-3 rounded-ui border border-content-border p-2">
      <Handle id="trigger" type="target" :position="Position.Top" class="!top-0 !-translate-y-1/2 !border-sky-500 !bg-sky-500" />
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2">
        <Select
          :model-value="triggerMode"
          :options="data.triggerModeOptions || []"
          option-label="label"
          option-value="value"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateTrigger({ mode: value })"
        />
        <MultiSelect
          v-if="triggerMode === 'user'"
          :model-value="action.trigger?.roleIds || []"
          :options="data.roleOptions || []"
          option-label="label"
          option-value="value"
          display="chip"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateTrigger({ roleIds: value })"
        />
        <Tag v-else :value="triggerSocketLabel" size="small" severity="info" />
      </div>
    </div>

    <div v-if="hasInlineControls" class="nodrag mt-3 grid grid-cols-2 gap-2">
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
        :model-value="action.parentEntityType || ''"
        :options="data.optionalEntityTypeOptions || []"
        option-label="label"
        option-value="value"
        class="min-w-0"
        size="small"
        @update:model-value="value => updateAndSync({ parentEntityType: value })"
      />
      <Select
        v-if="action.actionKind === 'runCommand'"
        :model-value="action.commandId || ''"
        :options="data.commandOptions || []"
        option-label="label"
        option-value="value"
        class="col-span-2 min-w-0"
        size="small"
        @update:model-value="value => updateAndSync({ commandId: value })"
      />
      <InputText
        v-if="action.actionKind === 'createEntity'"
        :model-value="action.status?.to || ''"
        class="min-w-0"
        size="small"
        :placeholder="$t('processDesigner.targetStatus')"
        @update:model-value="value => updateStatus({ to: value })"
      />
      <InputText
        v-if="action.actionKind === 'changeStatus'"
        :model-value="action.status?.to || ''"
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

    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1">
        <div
          v-for="(input, index) in inputSpecs"
          :key="input.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-3 pr-2"
        >
          <Handle :id="socketHandleId('input', input, index, inputSpecs)" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <Tag :value="input.label" size="small" />
            <div v-if="input.detail" class="truncate text-xs text-muted-color">{{ input.detail }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div
          v-for="(output, index) in outputSpecs"
          :key="output.id"
          class="relative min-w-0 rounded-ui border border-content-border py-1 pl-2 pr-3 text-right"
        >
          <Handle :id="socketHandleId('output', output, index, outputSpecs)" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-emerald-500 !bg-emerald-500" />
          <div class="min-w-0">
            <Tag :value="output.label" size="small" severity="success" />
            <div v-if="output.detail" class="truncate text-xs text-muted-color">{{ output.detail }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="relative mt-3 rounded-ui border border-content-border px-2 py-1 text-center">
      <Handle id="event" type="source" :position="Position.Bottom" class="!bottom-0 !translate-y-1/2 !border-sky-500 !bg-sky-500" />
      <Tag :value="eventLabel" size="small" severity="info" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useI18n } from 'vue-i18n';

const props = defineProps({ data: { type: Object, default: () => ({}) } });
const { t } = useI18n();

const action = computed(() => props.data.actionRecord || {});
const triggerMode = computed(() => action.value.trigger?.mode || props.data.triggerMode || 'user');
const triggerSocketLabel = computed(() => ({
  manual: t('processDesigner.manualTrigger'),
  user: t('processDesigner.userTrigger'),
  system: t('processDesigner.systemTrigger'),
  event: t('processDesigner.eventTrigger')
})[triggerMode.value] || t('processDesigner.trigger'));
const inputSpecs = computed(() => normalizeSpecs(props.data.inputSpecs || props.data.inputLabels || []));
const outputSpecs = computed(() => normalizeSpecs(props.data.outputSpecs || props.data.outputLabels || []));
const eventLabel = computed(() => props.data.eventLabel || t('processDesigner.actionCompleted'));
const actionKindLabel = computed(() => props.data.actionKindLabel || props.data.actionKind || t('common.actions.title'));
const showEntitySelector = computed(() => ['createEntity', 'sendToOrganization'].includes(action.value.actionKind));
const hasInlineControls = computed(() => ['createEntity', 'changeStatus', 'runCommand', 'sendToOrganization'].includes(action.value.actionKind));
const subtitle = computed(() => {
  if (action.value.actionKind === 'runCommand') return props.data.commandId || t('processDesigner.commandId');
  if (action.value.actionKind === 'changeStatus') return `${t('processDesigner.incomingEntity')} -> ${props.data.statusTo || t('processDesigner.targetStatus')}`;
  if (props.data.statusTo) return `${props.data.entityType || t('processDesigner.entityType')} -> ${props.data.statusTo}`;
  return props.data.entityType || t('processDesigner.entityType');
});
const iconClass = computed(() => ({
  createEntity: 'pi pi-plus-circle text-primary',
  changeStatus: 'pi pi-sync text-primary',
  runCommand: 'pi pi-play-circle text-primary',
  sendToOrganization: 'pi pi-send text-primary'
})[props.data.actionKind] || 'pi pi-bolt text-primary');

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
</script>
