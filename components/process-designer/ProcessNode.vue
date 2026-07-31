<template>
  <div :class="nodeFrameClass">
    <div :class="['absolute inset-x-0 top-0 h-0.5 rounded-t-ui', accent.stripe]"></div>
    <div class="flex items-center gap-2">
      <span :class="['flex h-7 w-7 shrink-0 items-center justify-center rounded-ui bg-subtle', accent.icon]">
        <i :class="record.icon || data.icon || 'pi pi-sitemap'"></i>
      </span>
      <div class="min-w-0 flex-1">
        <strong class="block truncate text-sm text-color">{{ data.kindLabel || record.kind }}</strong>
        <span v-if="data.summary" class="block truncate text-xs text-muted-color">{{ data.summary }}</span>
      </div>
    </div>

    <div v-if="hasInlineConfiguration" class="nodrag nowheel mt-2 flex flex-col gap-2" @mousedown.stop @click.stop>
      <Select
        v-if="showEntitySelect"
        :model-value="record.entityType"
        :options="data.processEntityTypeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ entityType: value })"
      />
      <div v-if="showTypeEditor">
        <Select
          :model-value="record.type?.base"
          :options="baseTypeOptions"
          option-label="label"
          option-value="value"
          size="small"
          @update:model-value="updateValueType"
        />
      </div>
      <Select
        v-if="operationOptions.length"
        :model-value="record.operation"
        :options="operationOptions"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ operation: value })"
      />
      <div
        v-if="record.kind?.startsWith('effect.')"
        class="flex flex-col gap-1"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium">{{ $t('processDesigner.roles') }}</span>
          <Button
            icon="pi pi-plus"
            text
            size="small"
            :aria-label="$t('processDesigner.addRole')"
            :disabled="!nextRoleId"
            @click="addEffectGrant"
          />
        </div>
        <div
          v-for="(grant, index) in effectGrants"
          :key="`${grant.roleId}-${index}`"
          class="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-1"
        >
          <Select
            :model-value="grant.roleId"
            :options="roleOptionsForGrant(index)"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="value => updateEffectGrant(index, { roleId: value })"
          />
          <Select
            :model-value="grant.level || 'write'"
            :options="data.processAccessLevelOptions || []"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="value => updateEffectGrant(index, { level: value })"
          />
          <Button
            icon="pi pi-trash"
            text
            severity="danger"
            size="small"
            :aria-label="$t('common.delete')"
            @click="removeEffectGrant(index)"
          />
        </div>
      </div>
      <Select
        v-if="record.kind === 'control.domainEventTrigger'"
        :model-value="record.eventId"
        :options="data.processEventOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ eventId: value })"
      />
      <Select
        v-if="showBlockSelect"
        :model-value="record.block"
        :options="data.processBlockOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ block: value })"
      />
      <Select
        v-if="fieldOptions.length && !showsFieldSet"
        :model-value="record.path"
        :options="fieldOptions"
        option-label="label"
        option-value="value"
        size="small"
        filter
        @update:model-value="value => update({ path: value })"
      />
      <MultiSelect
        v-if="showsFieldSet && fieldOptions.length"
        :model-value="record.fields || []"
        :options="fieldOptions"
        option-label="label"
        option-value="value"
        filter
        size="small"
        :placeholder="$t('processDesigner.fields')"
        @update:model-value="value => update({ fields: value })"
      />
      <InputText
        v-if="record.kind === 'source.literalItem' && !['number', 'integer', 'boolean', 'date', 'dateTime', 'status'].includes(record.type?.base)"
        :model-value="literalDisplay"
        size="small"
        @update:model-value="updateLiteral"
      />
      <InputNumber
        v-if="record.kind === 'source.literalItem' && ['number', 'integer'].includes(record.type?.base)"
        :model-value="Number(record.value) || 0"
        size="small"
        @update:model-value="value => update({ value })"
      />
      <ToggleSwitch
        v-if="record.kind === 'source.literalItem' && record.type?.base === 'boolean'"
        :model-value="Boolean(record.value)"
        @update:model-value="value => update({ value })"
      />
      <DatePicker
        v-if="record.kind === 'source.literalItem' && ['date', 'dateTime'].includes(record.type?.base)"
        :model-value="literalDate"
        :show-time="record.type?.base === 'dateTime'"
        hour-format="24"
        size="small"
        @update:model-value="value => update({ value: serializeLiteralDate(value) })"
      />
      <Select
        v-if="record.kind === 'source.literalItem' && record.type?.base === 'status'"
        :model-value="record.value"
        :options="data.processStatusOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="value => update({ value })"
      />
      <Textarea
        v-if="['source.literalList', 'source.literalTree'].includes(record.kind)"
        :model-value="literalDisplay"
        rows="3"
        auto-resize
        @update:model-value="updateLiteral"
      />
    </div>

    <div v-if="dataInputs.length || dataOutputs.length" class="mt-2 grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1">
        <div v-for="input in dataInputs" :key="input.id" class="flex flex-col gap-1">
          <div :class="socketClass(input, 'left')">
            <Handle :id="socketHandleId(input)" type="target" :position="Position.Left" :class="handleClass(input, 'left')" />
            <span class="flex min-w-0 items-center gap-1 text-xs">
              <span class="truncate">{{ input.label }}</span>
              <span class="shrink-0 text-[10px] text-muted-color">{{ input.typeLabel }}</span>
            </span>
          </div>
          <div v-if="!input.connected && supportsInlineValue(input)" class="nodrag nowheel pl-2" @mousedown.stop @click.stop>
            <ToggleSwitch
              v-if="input.base === 'boolean'"
              :model-value="Boolean(inputDefault(input.id))"
              @update:model-value="value => updateInputDefault(input.id, value)"
            />
            <InputNumber
              v-else-if="['number', 'integer'].includes(input.base)"
              :model-value="numericInputDefault(input.id)"
              size="small"
              :placeholder="$t('processDesigner.inlineValue')"
              @update:model-value="value => updateInputDefault(input.id, value)"
            />
            <Select
              v-else-if="input.base === 'status'"
              :model-value="inputDefault(input.id)"
              :options="data.processStatusOptions || []"
              option-label="label"
              option-value="value"
              size="small"
              @update:model-value="value => updateStatusInputDefault(input.id, value)"
            />
            <DatePicker
              v-else-if="['date', 'dateTime'].includes(input.base)"
              :model-value="dateInputDefault(input.id)"
              :show-time="input.base === 'dateTime'"
              hour-format="24"
              size="small"
              @update:model-value="value => updateInputDefault(input.id, serializeDateInput(input, value))"
            />
            <InputText
              v-else
              :model-value="displayInputDefault(input.id)"
              size="small"
              :placeholder="inputPlaceholder(input)"
              @update:model-value="value => updateInputDefault(input.id, parseInputDefault(input, value))"
            />
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div v-for="output in dataOutputs" :key="output.id" :class="socketClass(output, 'right')">
          <Handle :id="socketHandleId(output)" type="source" :position="Position.Right" :class="handleClass(output, 'right')" />
          <span class="flex min-w-0 items-center justify-end gap-1 text-xs">
            <span class="shrink-0 text-[10px] text-muted-color">{{ output.typeLabel }}</span>
            <span class="truncate">{{ output.label }}</span>
          </span>
        </div>
      </div>
    </div>

    <div v-if="eventInputs.length || eventOutputs.length" class="mt-2 border-t border-content-border pt-2">
      <SelectButton
        v-if="record.kind?.startsWith('effect.')"
        :model-value="record.trigger?.mode === 'event' ? 'event' : 'manual'"
        :options="data.processTriggerModeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        class="nodrag nowheel mb-2"
        @mousedown.stop
        @click.stop
        @update:model-value="updateEffectTriggerMode"
      />
      <div class="flex items-end justify-between gap-4">
        <div class="flex flex-wrap gap-2">
          <div v-for="input in eventInputs" :key="input.id" class="relative rounded-ui bg-subtle px-2 py-1">
            <Handle :id="socketHandleId(input)" type="target" :position="Position.Left" class="!left-0 !-translate-x-1/2 !border-orange-500 !bg-orange-500" />
            <span class="text-xs">{{ input.label }}</span>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <div v-for="output in eventOutputs" :key="output.id" class="relative rounded-ui bg-subtle px-2 py-1 text-right">
            <Handle :id="socketHandleId(output)" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-orange-500 !bg-orange-500" />
            <span class="text-xs">{{ output.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import { useI18n } from 'vue-i18n';
import { formatProcessType } from '~/packages/processes/src/index.js';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});
const { t } = useI18n();

const record = computed(() => props.data.processNodeRecord || props.data);
const inputSpecs = computed(() => normalizeSpecs(record.value.inputs || props.data.inputSpecs || []));
const outputSpecs = computed(() => normalizeSpecs(record.value.outputs || props.data.outputSpecs || []));
const dataInputs = computed(() => inputSpecs.value.filter(input => input.role === 'data'));
const dataOutputs = computed(() => outputSpecs.value.filter(output => output.role === 'data'));
const eventInputs = computed(() => inputSpecs.value.filter(input => input.role !== 'data'));
const eventOutputs = computed(() => outputSpecs.value.filter(output => output.role !== 'data'));
const connectedInputs = computed(() => new Set(props.data.processConnectedInputIds || []));
const operationOptions = computed(() => props.data.processOperationOptions || []);
const fieldOptions = computed(() => props.data.processFieldOptions || []);
const effectGrants = computed(() => record.value.access?.grants || []);
const nextRoleId = computed(() => {
  const selected = new Set(effectGrants.value.map(grant => grant.roleId));
  return (props.data.processRoleOptions || []).find(option => !selected.has(option.value))?.value || '';
});
const showsFieldSet = computed(() => [
  'record.composeBlock',
  'record.modifyBlock'
].includes(record.value.kind));
const showEntitySelect = computed(() => (
  (['record.', 'predicate.', 'read.', 'effect.'].some(prefix => record.value.kind?.startsWith(prefix))
    && record.value.kind !== 'effect.runProducer')
  || record.value.kind === 'control.entityChangedTrigger'
  || (record.value.kind === 'control.manualTrigger' && record.value.entityType)
  || (record.value.kind === 'source.literalItem' && record.value.type?.base === 'entityRef')
));
const showBlockSelect = computed(() => (
  ['record.getBlock', 'record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(record.value.kind)
  && (props.data.processBlockOptions || []).length
));
const showTypeEditor = computed(() => (
  record.value.kind?.startsWith('source.literal')
  || (record.value.kind === 'value.logic'
    && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull'].includes(record.value.operation))
));
const baseTypeOptions = computed(() => [
  'string',
  'number',
  'integer',
  'boolean',
  'json',
  'date',
  'dateTime',
  'duration',
  'enum',
  'entityRef',
  'status'
].map(value => ({ label: t(`processDesigner.dataTypes.${value}`), value })));
const literalDisplay = computed(() => {
  if (record.value.type?.base === 'entityRef') return record.value.value?.id || '';
  return typeof record.value.value === 'string'
    ? record.value.value
    : JSON.stringify(record.value.value, null, 2);
});
const literalDate = computed(() => {
  if (!record.value.value) return null;
  const value = new Date(record.value.value);
  return Number.isNaN(value.getTime()) ? null : value;
});
const hasInlineConfiguration = computed(() => (
  showEntitySelect.value
  || showTypeEditor.value
  || operationOptions.value.length
  || record.value.kind?.startsWith('effect.')
  || record.value.kind === 'control.domainEventTrigger'
  || showBlockSelect.value
  || fieldOptions.value.length
  || record.value.kind?.startsWith('source.literal')
));
const nodeFrameClass = computed(() => [
  'relative min-w-72 rounded-ui border bg-content p-3 pt-3.5 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const accent = computed(() => {
  if (record.value.kind?.startsWith('read.')) return { stripe: 'bg-cyan-500', icon: 'text-cyan-600' };
  if (record.value.kind?.startsWith('record.')) return { stripe: 'bg-sky-500', icon: 'text-sky-600' };
  if (record.value.kind?.startsWith('predicate.') || record.value.kind?.includes('compare') || record.value.kind?.includes('logic')) {
    return { stripe: 'bg-amber-500', icon: 'text-amber-600' };
  }
  if (record.value.kind?.startsWith('effect.')) return { stripe: 'bg-rose-500', icon: 'text-rose-600' };
  if (record.value.kind?.startsWith('control.')) return { stripe: 'bg-orange-500', icon: 'text-orange-600' };
  return { stripe: 'bg-violet-500', icon: 'text-violet-600' };
});

function update(updates) {
  props.data.onProcessNodeUpdate?.(updates);
}

function updateEffectGrants(grants) {
  update({
    access: {
      ...(record.value.access || {}),
      grants
    }
  });
}

function addEffectGrant() {
  if (!nextRoleId.value) return;
  updateEffectGrants([...effectGrants.value, { roleId: nextRoleId.value, level: 'write' }]);
}

function roleOptionsForGrant(index) {
  const selectedByOthers = new Set(effectGrants.value
    .filter((_, grantIndex) => grantIndex !== index)
    .map(grant => grant.roleId));
  return (props.data.processRoleOptions || []).filter(option => !selectedByOthers.has(option.value));
}

function updateEffectGrant(index, updates) {
  updateEffectGrants(effectGrants.value.map((grant, grantIndex) => (
    grantIndex === index ? { ...grant, ...updates } : grant
  )));
}

function removeEffectGrant(index) {
  updateEffectGrants(effectGrants.value.filter((_, grantIndex) => grantIndex !== index));
}

function updateEffectTriggerMode(mode) {
  if (!mode) return;
  update({ trigger: { mode: mode === 'event' ? 'event' : 'manual' } });
}

function updateValueType(base) {
  const updates = { type: { ...(record.value.type || {}), base } };
  if (record.value.kind?.startsWith('source.literal')) {
    updates.value = base === 'boolean' ? false
      : ['number', 'integer'].includes(base) ? 0
        : base === 'json' ? {}
          : '';
    if (base === 'entityRef') {
      updates.entityType = record.value.entityType || props.data.processEntityTypeOptions?.[0]?.value || '';
      updates.type.entityType = updates.entityType;
    }
  }
  update(updates);
}

function updateLiteral(value) {
  if (record.value.type?.base === 'number') return update({ value: Number(value) });
  if (record.value.type?.base === 'integer') return update({ value: Number.parseInt(value, 10) });
  if (record.value.type?.base === 'boolean') return update({ value: value === true || value === 'true' });
  if (record.value.type?.base === 'entityRef') {
    return update({ value: value ? { type: record.value.entityType, id: value } : null });
  }
  if (record.value.type?.shape !== 'item' || record.value.type?.base === 'json') {
    try {
      update({ value: JSON.parse(value) });
    } catch {
      update({ value });
    }
    return;
  }
  update({ value });
}

function serializeLiteralDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return record.value.type?.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
}

function normalizeSpecs(items) {
  return items.map((item, index) => ({
    id: item.id || item.label || index,
    label: item.label || item.id || String(index),
    base: item.type?.base || 'json',
    type: item.type || {},
    role: item.role || 'data',
    connected: connectedInputs.value.has(item.id),
    typeLabel: formatProcessType(item.type)
  }));
}

function supportsInlineValue(input) {
  return ['string', 'id', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'status', 'entityRef'].includes(input.base)
    && input.type?.shape !== 'list';
}

function inputDefault(id) {
  return record.value.inputDefaults?.[id];
}

function displayInputDefault(id) {
  const value = inputDefault(id);
  if (value == null) return '';
  if (typeof value === 'object' && value.id) return String(value.id);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function numericInputDefault(id) {
  const value = inputDefault(id);
  return value == null || value === '' ? null : Number(value);
}

function dateInputDefault(id) {
  const value = inputDefault(id);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDateInput(input, value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return input.base === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
}

function parseInputDefault(input, value) {
  if (input.base === 'entityRef') {
    return value ? { type: input.type?.entityType || '', id: value } : null;
  }
  if (input.base === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function inputPlaceholder(input) {
  if (input.base === 'entityRef') {
    return t('processDesigner.entityIdFallback', { entity: input.type?.entityType || t('processDesigner.entity') });
  }
  return t('processDesigner.inlineValue');
}

function updateInputDefault(id, value) {
  const inputDefaults = { ...(record.value.inputDefaults || {}) };
  if (value == null || value === '') delete inputDefaults[id];
  else inputDefaults[id] = value;
  update({ inputDefaults });
}

function updateStatusInputDefault(id, value) {
  const option = (props.data.processStatusOptions || []).find(item => item.value === value);
  update({
    inputDefaults: { ...(record.value.inputDefaults || {}), [id]: value },
    statusRef: option?.refId || '',
    status: { ...(record.value.status || {}), to: value }
  });
}

function socketHandleId(item) {
  return `${item.role === 'data' ? 'data' : 'control'}:${item.id}`;
}

function socketClass(item, side) {
  return [
    'relative min-w-0 rounded-ui bg-subtle px-2 py-1',
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
  if (item.role !== 'data') return { row: '', handle: '!border-orange-500 !bg-orange-500' };
  return ({
    entity: { row: '', handle: '!border-sky-500 !bg-sky-500' },
    entityRef: { row: '', handle: '!border-blue-500 !bg-blue-500' },
    block: { row: '', handle: '!border-cyan-500 !bg-cyan-500' },
    predicate: { row: '', handle: '!border-amber-600 !bg-amber-600' },
    patch: { row: '', handle: '!border-fuchsia-500 !bg-fuchsia-500' },
    number: { row: '', handle: '!border-lime-500 !bg-lime-500' },
    integer: { row: '', handle: '!border-lime-600 !bg-lime-600' },
    boolean: { row: '', handle: '!border-amber-500 !bg-amber-500' },
    date: { row: '', handle: '!border-indigo-500 !bg-indigo-500' },
    dateTime: { row: '', handle: '!border-indigo-600 !bg-indigo-600' }
  })[item.base] || { row: '', handle: '!border-emerald-500 !bg-emerald-500' };
}
</script>
