<template>
  <div class="flex min-w-0 flex-col gap-2">
    <Select
      v-if="options.length"
      :model-value="modelValue"
      :options="options"
      option-label="label"
      option-value="value"
      :type-id="typeId"
      class="w-full"
      @update:model-value="value => emit('update:modelValue', value)"
    />
    <InputText
      v-else
      :model-value="modelValue ?? ''"
      class="w-full text-technical"
      @update:model-value="value => emit('update:modelValue', value)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/InstanceSelect.vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  typeId: { type: String, default: '' },
  context: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:modelValue']);

const options = computed(() => {
  const byType = props.context.entityOptions || props.context.entitiesByType || {};
  return (byType[props.typeId] || []).map(option => ({
    label: option.label || option.entity?.name || option.value,
    value: option.value || option.entity?._id,
    entity: option.entity
  }));
});

</script>
