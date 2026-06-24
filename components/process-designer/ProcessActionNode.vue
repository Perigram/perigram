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
        v-if="action.actionKind === 'runCommand'"
        :model-value="action.commandId || ''"
        :options="data.commandOptions || []"
        option-label="label"
        option-value="value"
        class="min-w-0"
        size="small"
        @update:model-value="value => updateAndSync({ commandId: value })"
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

    <div class="nodrag mt-2 flex flex-col gap-1 rounded-ui border border-content-border p-1">
      <div
        v-for="(grant, index) in accessGrants"
        :key="`${grant.roleId || 'role'}-${index}`"
        class="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-1"
      >
        <Select
          :model-value="grant.roleId"
          :options="roleOptionsForGrant(grant.roleId)"
          option-label="label"
          option-value="value"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateGrant(index, { roleId: value })"
        />
        <Select
          :model-value="grant.level || 'write'"
          :options="data.accessLevelOptions || []"
          option-label="label"
          option-value="value"
          class="nodrag min-w-0"
          size="small"
          @update:model-value="value => updateGrant(index, { level: value })"
        />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          class="!h-8 !w-8"
          :aria-label="$t('common.delete')"
          @click="removeGrant(index)"
        />
      </div>
      <Button
        v-if="availableRoleOptions.length"
        icon="pi pi-plus"
        :label="$t('processDesigner.addRole')"
        text
        size="small"
        class="self-start"
        @click="addGrant"
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
      <MultiSelect
        v-if="action.actionKind === 'updateEntity'"
        :model-value="action.mutation?.fields || []"
        :options="data.fieldOptions || []"
        option-label="label"
        option-value="value"
        display="chip"
        class="col-span-2 min-w-0"
        size="small"
        @update:model-value="value => updateMutation({ fields: value })"
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
const accessGrants = computed(() => {
  const access = action.value.access || {};
  if (Array.isArray(access.grants) && access.grants.length) {
    return access.grants.map(grant => ({ roleId: grant.roleId || '', level: grant.level || access.level || 'write' }));
  }
  return (access.roleIds || []).map(roleId => ({ roleId, level: access.level || 'write' }));
});
const selectedGrantRoleIds = computed(() => new Set(accessGrants.value.map(grant => grant.roleId).filter(Boolean)));
const availableRoleOptions = computed(() => (props.data.roleOptions || []).filter(option => !selectedGrantRoleIds.value.has(option.value)));
const eventLabel = computed(() => props.data.eventLabel || t('processDesigner.actionCompleted'));
const actionKindLabel = computed(() => props.data.actionKindLabel || props.data.actionKind || t('common.actions.title'));
const showEntitySelector = computed(() => ['createEntity', 'sendToOrganization'].includes(action.value.actionKind));
const hasInlineControls = computed(() => ['sendToOrganization', 'updateEntity'].includes(action.value.actionKind));
function normalizeSpecs(items = []) {
  return items.map((item, index) => {
    if (typeof item === 'string') return { id: `${item}-${index}`, label: item, kind: 'data' };
    return {
      id: item.id || item.label || index,
      label: item.label || item.entityType || item.id,
      kind: item.kind || 'data',
      required: Boolean(item.required)
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

function roleOptionsForGrant(currentRoleId) {
  return (props.data.roleOptions || []).filter(option => option.value === currentRoleId || !selectedGrantRoleIds.value.has(option.value));
}

function addGrant() {
  const next = availableRoleOptions.value[0];
  if (!next) return;
  updateAccess({ grants: [...accessGrants.value, { roleId: next.value, level: 'write' }] });
}

function updateGrant(index, updates) {
  const grants = accessGrants.value.map((grant, grantIndex) => (
    grantIndex === index ? { ...grant, ...updates } : grant
  ));
  updateAccess({ grants: normalizeGrants(grants) });
}

function removeGrant(index) {
  updateAccess({ grants: normalizeGrants(accessGrants.value.filter((_, grantIndex) => grantIndex !== index)) });
}

function normalizeGrants(grants = []) {
  const seen = new Set();
  return grants.filter(grant => {
    if (!grant.roleId || seen.has(grant.roleId)) return false;
    seen.add(grant.roleId);
    return true;
  });
}

function resetAccess() {
  props.data.onActionResetAccess?.();
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
    entity: { row: 'border-content-border bg-content', handle: '!border-sky-500 !bg-sky-500' },
    block: { row: 'border-content-border bg-content', handle: '!border-cyan-500 !bg-cyan-500' },
    data: { row: 'border-content-border bg-content', handle: '!border-emerald-500 !bg-emerald-500' },
    status: { row: 'border-content-border bg-content', handle: '!border-amber-500 !bg-amber-500' },
    event: { row: 'border-content-border bg-content', handle: '!border-violet-500 !bg-violet-500' },
    projection: { row: 'border-content-border bg-content', handle: '!border-fuchsia-500 !bg-fuchsia-500' },
    attachment: { row: 'border-content-border bg-content', handle: '!border-orange-500 !bg-orange-500' },
    task: { row: 'border-content-border bg-content', handle: '!border-surface-500 !bg-surface-500' }
  })[item.kind] || { row: 'border-content-border', handle: '!border-emerald-500 !bg-emerald-500' };
}
</script>
