<template>
  <PrimeSelect
    v-if="entityMode"
    v-bind="$attrs"
    class="w-full"
    :model-value="modelValue"
    :options="options"
    :option-label="entityOptionLabel"
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
          variant="option"
          :show-type-label="!typeId"
        />
      </div>
      <span v-else>{{ labelFor(option) }}</span>
    </template>
    <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </PrimeSelect>
  <PrimeSelect
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
  </PrimeSelect>
</template>

<script setup>
import { computed, useSlots } from 'vue';
import PrimeSelect from 'primevue/select';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';
import {
  instanceFromSelectOption,
  instanceSelectOptions,
  typeIdFromSelectOption,
  selectOptionForValue,
  selectOptionLabel
} from '~/utils/instance-select.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { default: null },
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: null },
  optionValue: { type: [String, Function], default: null },
  typeId: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const slots = useSlots();
const { typeById } = useFileTypeView();
const entityMode = computed(() => instanceSelectOptions(props.options, props.typeId).length > 0);
const slotNames = computed(() => Object.keys(slots));
const forwardedSlotNames = computed(() => slotNames.value.filter(name => !['option'].includes(name)));

function selectedOption(value) {
  return selectOptionForValue(props.options, value, props.optionValue);
}

function entityFor(option) {
  return instanceFromSelectOption(option);
}

function typeFor(option) {
  return typeIdFromSelectOption(option, props.typeId);
}

// The §22.13 identifier title also feeds the filter; an unloaded type view falls back to the option's label.
function entityOptionLabel(option) {
  const entity = entityFor(option);
  const typeId = typeFor(option);
  if (entity && typeId) {
    const title = instanceRecordTitle(entity, typeById(typeId));
    if (title) return title;
  }
  return selectOptionLabel(option, props.optionLabel);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}
</script>
