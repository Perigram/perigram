<template>
  <div :class="nodeFrameClass">
    <div class="absolute inset-x-0 top-0 h-1 rounded-t-ui bg-signal-value"></div>
    <div class="flex items-center gap-2">
      <i :class="record.structure === 'list' ? 'pi pi-list' : 'pi pi-circle-fill'" class="text-signal-value"></i>
      <strong class="min-w-0 flex-1 truncate text-sm">{{ record.label || data.refId }}</strong>
      <span class="text-xs text-muted-color">{{ typeLabel }}</span>
    </div>

    <div class="nodrag nowheel mt-2 flex flex-col gap-2" @mousedown.stop @click.stop>
      <Select
        :model-value="record.valueType"
        :options="data.processValueTypeOptions || []"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="changeValueType"
      />

      <template v-if="record.structure === 'list'">
        <div v-for="(item, index) in listValues" :key="index" class="flex items-center gap-1">
          <ToggleSwitch
            v-if="record.valueType === 'boolean'"
            :model-value="Boolean(item)"
            @update:model-value="value => updateListItem(index, value)"
          />
          <InputNumber
            v-else-if="record.valueType === 'number'"
            :model-value="Number(item)"
            size="small"
            class="min-w-0 flex-1"
            @update:model-value="value => updateListItem(index, value)"
          />
          <Textarea
            v-else-if="record.valueType === 'json'"
            :model-value="formatJson(item)"
            rows="2"
            class="min-w-0 flex-1"
            @change="event => updateListJson(index, event.target.value)"
          />
          <InputText
            v-else
            :model-value="String(item ?? '')"
            :type="record.valueType === 'date' ? 'datetime-local' : 'text'"
            size="small"
            class="min-w-0 flex-1"
            @update:model-value="value => updateListItem(index, value)"
          />
          <Button icon="pi pi-times" severity="secondary" text size="small" :aria-label="$t('common.delete')" @click="removeListItem(index)" />
        </div>
        <Button icon="pi pi-plus" severity="secondary" text size="small" :label="$t('common.add')" @click="addListItem" />
      </template>

      <template v-else>
        <ToggleSwitch v-if="record.valueType === 'boolean'" :model-value="booleanValue" @update:model-value="value => update({ value })" />
        <InputNumber v-else-if="record.valueType === 'number'" :model-value="numberValue" size="small" @update:model-value="value => update({ value })" />
        <Textarea v-else-if="record.valueType === 'json'" :model-value="jsonValue" rows="3" @change="event => update({ value: event.target.value })" />
        <InputText
          v-else
          :model-value="String(record.value ?? '')"
          :type="record.valueType === 'date' ? 'datetime-local' : 'text'"
          size="small"
          @update:model-value="value => update({ value })"
        />
      </template>
    </div>

    <Handle id="value" type="source" :position="Position.Right" class="!right-0 !translate-x-1/2 !border-signal-value !bg-signal-value" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
});

const record = computed(() => props.data.valueInputRecord || props.data);
const nodeFrameClass = computed(() => [
  'relative min-w-64 rounded-ui border bg-content p-2 pt-3 shadow-card transition-colors',
  props.selected ? 'border-primary ring-2 ring-primary-200' : 'border-content-border'
]);
const typeLabel = computed(() => `${record.value.valueType || 'string'}${record.value.structure === 'list' ? '[]' : ''}`);
const listValues = computed(() => {
  if (Array.isArray(record.value.value)) return record.value.value;
  try {
    const parsed = JSON.parse(String(record.value.value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});
const booleanValue = computed(() => record.value.value === true || record.value.value === 'true');
const numberValue = computed(() => {
  const value = Number(record.value.value);
  return Number.isFinite(value) ? value : null;
});
const jsonValue = computed(() => formatJson(record.value.value));

function update(updates) {
  props.data.onValueInputUpdate?.(updates);
}

function changeValueType(valueType) {
  if (record.value.structure !== 'list') {
    update({ valueType });
    return;
  }
  update({
    valueType,
    value: JSON.stringify(listValues.value.map(item => coerceItem(item, valueType)))
  });
}

function updateListItem(index, value) {
  const next = [...listValues.value];
  next[index] = value;
  update({ value: JSON.stringify(next) });
}

function updateListJson(index, value) {
  try {
    updateListItem(index, JSON.parse(value));
  } catch {
    // Keep the last valid structured value until the JSON entry is valid.
  }
}

function addListItem() {
  update({ value: JSON.stringify([...listValues.value, defaultItemValue(record.value.valueType)]) });
}

function removeListItem(index) {
  update({ value: JSON.stringify(listValues.value.filter((_, itemIndex) => itemIndex !== index)) });
}

function defaultItemValue(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'json') return {};
  return '';
}

function coerceItem(value, type) {
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (type === 'boolean') return value === true || value === 'true' || value === 1;
  if (type === 'json') {
    if (value && typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  }
  return String(value ?? '');
}

function formatJson(value) {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value ?? {}, null, 2);
}
</script>
