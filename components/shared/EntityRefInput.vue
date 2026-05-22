<template>
  <div class="flex min-w-0 flex-col gap-2">
    <Select
      v-if="options.length"
      :model-value="modelValue"
      :options="options"
      option-label="label"
      option-value="value"
      class="w-full"
      @update:model-value="value => emit('update:modelValue', value)"
    >
      <template #option="{ option }">
        <div class="flex min-w-0 flex-col">
          <span class="truncate">{{ option.label }}</span>
          <small class="truncate text-muted-color">{{ option.value }}</small>
        </div>
      </template>
      <template #value="{ value, placeholder }">
        <span v-if="value" class="font-mono text-sm">{{ labelFor(value) }}</span>
        <span v-else>{{ placeholder }}</span>
      </template>
    </Select>
    <InputText
      v-else
      :model-value="modelValue ?? ''"
      class="w-full font-mono"
      @update:model-value="value => emit('update:modelValue', value)"
    />
    <div v-if="selectedEntity" class="flex flex-wrap items-center gap-2">
      <StatusBadge :state="selectedEntity.status?.state" />
      <small class="truncate text-muted-color">{{ selectedEntity.identity?.uid || selectedEntity._id }}</small>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import StatusBadge from '~/components/shared/blocks/StatusBadge.vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  entityType: { type: String, default: '' },
  context: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

const options = computed(() => {
  const byType = props.context.entityOptions || props.context.entitiesByType || {};
  return (byType[props.entityType] || []).map(option => ({
    label: option.label || option.entity?.identity?.name || option.value,
    value: option.value || option.entity?._id,
    entity: option.entity
  }));
});

const selectedEntity = computed(() => options.value.find(option => option.value === props.modelValue)?.entity || null);

function labelFor(value) {
  const selected = options.value.find(option => option.value === value);
  return selected ? selected.label : value;
}
</script>
