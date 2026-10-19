<template>
  <div
    v-if="entityMode"
    :class="selectedOptionRefs.length ? 'flex min-w-0 items-start gap-2' : 'grid min-w-0 gap-2'"
  >
    <div v-if="selectedOptionRefs.length" class="grid min-w-0 flex-1 gap-2" data-instance-selection-list>
      <div
        v-for="option in selectedOptionRefs"
        :key="optionKey(option)"
        class="pointer-events-none min-w-0"
      >
        <InstanceInlineRef
          v-if="entityFor(option) && typeFor(option)"
          :type="typeFor(option)"
          :entity="entityFor(option)"
          :fetch="false"
          :interactive="false"
          variant="compact"
        />
        <span v-else>{{ labelFor(option) }}</span>
      </div>
    </div>
    <PrimeMultiSelect
      v-bind="controlAttrs"
      :class="selectedOptionRefs.length ? '!w-10 shrink-0 self-start' : null"
      :model-value="modelValue"
      :options="options"
      :option-label="optionLabel"
      :option-value="optionValue"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #option="{ option }">
        <div v-if="entityFor(option) && typeFor(option)" class="pointer-events-none w-full min-w-0">
          <InstanceInlineRef
            :type="typeFor(option)"
            :entity="entityFor(option)"
            :fetch="false"
            :interactive="false"
            variant="compact"
          />
        </div>
        <span v-else>{{ labelFor(option) }}</span>
      </template>
      <template #value="{ placeholder }">
        <span v-if="selectedOptionRefs.length" class="pi pi-pencil" aria-hidden="true"></span>
        <span v-else>{{ placeholder }}</span>
      </template>
      <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
        <slot :name="slotName" v-bind="slotProps || {}" />
      </template>
    </PrimeMultiSelect>
  </div>
  <PrimeMultiSelect
    v-else
    v-bind="$attrs"
    :model-value="modelValue"
    :options="options"
    :option-label="optionLabel"
    :option-value="optionValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-for="slotName in slotNames" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </PrimeMultiSelect>
</template>

<script setup>
import { computed, useAttrs, useSlots } from 'vue';
import PrimeMultiSelect from 'primevue/multiselect';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import {
  instanceFromSelectOption,
  instanceSelectOptions,
  typeIdFromSelectOption,
  selectOptionForValue,
  selectOptionLabel,
  selectOptionValue
} from '~/utils/instance-select.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: null },
  optionValue: { type: [String, Function], default: null },
  typeId: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const slots = useSlots();
const attrs = useAttrs();
const entityMode = computed(() => instanceSelectOptions(props.options, props.typeId).length > 0);
const slotNames = computed(() => Object.keys(slots));
const forwardedSlotNames = computed(() => slotNames.value.filter(name => !['option', 'value', 'chip'].includes(name)));
const selectedOptionRefs = computed(() => selectedOptions(props.modelValue));
const selectedTriggerLabel = computed(() => selectedOptionRefs.value.map(labelFor).filter(Boolean).join(', '));
const controlAttrs = computed(() => {
  if (!selectedOptionRefs.value.length) return attrs;
  return { ...attrs, 'aria-label': selectedTriggerLabel.value || attrs['aria-label'] };
});

function selectedOptions(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => selectOptionForValue(props.options, value, props.optionValue))
    .filter(Boolean);
}

function entityFor(option) {
  return instanceFromSelectOption(option);
}

function typeFor(option) {
  return typeIdFromSelectOption(option, props.typeId);
}

function optionKey(option) {
  return String(selectOptionValue(option, props.optionValue) ?? entityFor(option)?._id ?? entityFor(option)?._id);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}
</script>
