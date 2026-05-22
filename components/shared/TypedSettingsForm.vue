<template>
  <div class="flex flex-col gap-3">
    <div v-for="field in fields" :key="field.name" class="flex min-w-0 flex-col gap-1">
      <label class="flex items-center gap-1">
        <span>{{ field.label || field.name }}</span>
        <span v-if="field.required" class="text-muted-color">*</span>
      </label>
      <InputNumber
        v-if="field.type === 'number'"
        :model-value="numberValue(field)"
        :min="field.min"
        :max="field.max"
        :step="field.step || 1"
        class="w-full"
        @update:model-value="value => updateField(field, value)"
      />
      <Checkbox
        v-else-if="field.type === 'boolean'"
        :model-value="Boolean(modelValue?.[field.name])"
        binary
        @update:model-value="value => updateField(field, value)"
      />
      <Select
        v-else-if="field.type === 'enum' || field.type === 'entityType' || field.type === 'workflowState'"
        :model-value="modelValue?.[field.name]"
        :options="optionsFor(field)"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="value => updateField(field, value)"
      />
      <Textarea
        v-else-if="field.type === 'array' || field.type === 'object'"
        :model-value="jsonValue(field)"
        rows="4"
        class="w-full font-mono text-xs"
        @update:model-value="value => updateJsonField(field, value)"
      />
      <EntityRefInput
        v-else-if="field.type === 'entityId'"
        :model-value="modelValue?.[field.name] ?? ''"
        :entity-type="field.entityType"
        :context="context"
        @update:model-value="value => updateField(field, value)"
      />
      <InputText
        v-else
        :model-value="modelValue?.[field.name] ?? ''"
        class="w-full"
        @update:model-value="value => updateField(field, value)"
      />
      <small v-if="field.unit || field.help || field.entityType" class="text-muted-color">
        {{ [field.unit, field.help, field.entityType && `entity:${field.entityType}`].filter(Boolean).join(' · ') }}
      </small>
    </div>
  </div>
</template>

<script setup>
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import EntityRefInput from '~/components/shared/EntityRefInput.vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => [] },
  context: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

function updateField(field, value) {
  const next = { ...(props.modelValue || {}) };
  if (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) delete next[field.name];
  else next[field.name] = value;
  emit('update:modelValue', next);
}

function updateJsonField(field, value) {
  try {
    updateField(field, JSON.parse(value || (field.type === 'array' ? '[]' : '{}')));
  } catch {
    updateField(field, props.modelValue?.[field.name]);
  }
}

function numberValue(field) {
  const value = props.modelValue?.[field.name];
  return typeof value === 'number' ? value : null;
}

function jsonValue(field) {
  const value = props.modelValue?.[field.name];
  const fallback = field.type === 'array' ? [] : {};
  return JSON.stringify(value ?? fallback, null, 2);
}

function optionsFor(field) {
  if (field.type === 'entityType') return (props.context.entityTypes || []).map(value => ({ label: value, value }));
  if (field.type === 'workflowState') {
    const dependency = field.dependsOn ? props.modelValue?.[field.dependsOn] : field.entityType;
    return (props.context.workflowStates?.[dependency] || []).map(value => ({ label: value, value }));
  }
  return (field.options || []).map(option => typeof option === 'object'
    ? { label: option.label || option.value, value: option.value }
    : { label: option, value: option });
}
</script>
