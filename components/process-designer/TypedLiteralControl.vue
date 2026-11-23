<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <Select
      v-if="base === 'entityRef' && typeOptions.length"
      :model-value="typeId"
      :options="typeOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="min-w-0 flex-1"
      @update:model-value="value => emit('update:typeId', value)"
    />
    <Select
      v-else
      :model-value="base"
      :options="baseOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="w-32 shrink-0"
      @update:model-value="value => emit('update:base', value)"
    />
    <div class="min-w-0 flex-1">
      <TypedValueControl
        :base="base"
        :type-id="typeId"
        :model-value="modelValue"
        :status-options="statusOptions"
        :placeholder="placeholder"
        @update:model-value="value => emit('update:modelValue', value)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Select from '~/components/shared/InstanceSelect.vue';
import TypedValueControl from './TypedValueControl.vue';

const props = defineProps({
  bases: { type: Array, default: () => [] },
  base: { type: String, default: 'json' },
  typeId: { type: String, default: '' },
  modelValue: { type: null, default: null },
  typeOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['update:base', 'update:typeId', 'update:modelValue']);
const { t, te } = useI18n();
const baseOptions = computed(() => props.bases.map(value => {
  const key = `processDesigner.dataTypes.${value}`;
  return { label: te(key) ? t(key) : value, value };
}));
</script>
