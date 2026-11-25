<template>
  <div class="flex flex-col gap-2">
    <div v-for="(projection, index) in projections" :key="index" class="flex flex-col gap-2 border-1 border-surface-200 border-round p-2">
      <div class="flex items-center gap-2">
        <InputText
          :model-value="projection.id || ''"
          :placeholder="$t('processDesigner.projectionId')"
          class="w-full"
          @update:model-value="value => write(index, { id: String(value || '') })"
        />
        <Button icon="pi pi-times" :aria-label="$t('common.delete')" size="small" text severity="danger" @click="remove(index)" />
      </div>
      <InputText
        :model-value="projection.label || ''"
        :placeholder="$t('processDesigner.projectionLabel')"
        class="w-full"
        @update:model-value="value => write(index, { label: String(value || '') })"
      />
      <div class="grid grid-cols-2 gap-2">
        <Select
          :model-value="projection.output?.base || 'list'"
          :options="outputOptions"
          option-label="label"
          option-value="value"
          @update:model-value="value => write(index, { output: outputFor(value) })"
        />
        <Select
          :model-value="resolveKind(projection)"
          :options="resolveOptions"
          option-label="label"
          option-value="value"
          @update:model-value="value => writeResolve(index, value)"
        />
      </div>
      <InputText
        :model-value="resolveValue(projection)"
        :placeholder="$t('processDesigner.projectionResolve')"
        class="w-full"
        @update:model-value="value => writeResolve(index, resolveKind(projection), value)"
      />
    </div>
    <Button icon="pi pi-plus" :label="$t('processDesigner.addProjection')" size="small" text @click="add" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';

const modelValue = defineModel({ type: Array, default: () => [] });
const projections = computed(() => (Array.isArray(modelValue.value) ? modelValue.value : []));

const outputOptions = [
  { label: 'rows', value: 'list' },
  { label: 'record', value: 'record' },
  { label: 'text', value: 'string' },
  { label: 'value', value: 'json' }
];
const resolveOptions = [
  { label: 'service', value: 'service' },
  { label: 'field', value: 'field' },
  { label: 'handler', value: 'handler' }
];

function outputFor(base) {
  return base === 'list'
    ? { base: 'list', itemType: { base: 'record' } }
    : { base };
}

function resolveKind(projection = {}) {
  return ['service', 'field', 'handler'].find(kind => projection.resolve?.[kind]) || 'service';
}

function resolveValue(projection = {}) {
  const kind = resolveKind(projection);
  return projection.resolve?.[kind] || '';
}

function write(index, patch) {
  const next = modelValue.value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
  modelValue.value = next;
}

function writeResolve(index, kind, value = '') {
  write(index, { resolve: { [kind]: String(value) } });
}

function add() {
  modelValue.value = [...modelValue.value, {
    id: '',
    label: '',
    output: { base: 'list', itemType: { base: 'record' } },
    resolve: { service: '' }
  }];
}

function remove(index) {
  modelValue.value = modelValue.value.filter((entry, entryIndex) => entryIndex !== index);
}
</script>
