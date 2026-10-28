<template>
  <PrimeMultiSelect
    v-if="entityMode"
    v-bind="$attrs"
    display="chip"
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
          variant="option"
          :show-type-label="!typeId"
        />
      </div>
      <span v-else>{{ labelFor(option) }}</span>
    </template>
    <template #chip="{ value, removeCallback }">
      <Chip
        v-if="chipEntityFor(value) && chipTypeFor(value)"
        :label="labelFor(chipOptionFor(value))"
        :icon="instances.iconFor(chipTypeFor(value))"
        removable
        :pt="CHIP_LABEL_PT"
        :class="INSTANCE_CHIP_CLASS"
        @remove="event => removeCallback(event)"
      />
      <span v-else>{{ labelFor(chipOptionFor(value)) }}</span>
    </template>
    <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </PrimeMultiSelect>
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
import { computed, useSlots } from 'vue';
import PrimeMultiSelect from 'primevue/multiselect';
import Chip from 'primevue/chip';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { CHIP_LABEL_PT, INSTANCE_CHIP_CLASS } from '~/components/shared/chip-surface.js';
import { useInstancesStore } from '~/stores/instances';
import {
  instanceFromSelectOption,
  instanceSelectOptions,
  typeIdFromSelectOption,
  selectOptionForValue,
  selectOptionLabel
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
const instances = useInstancesStore();
const entityMode = computed(() => instanceSelectOptions(props.options, props.typeId).length > 0);
const slotNames = computed(() => Object.keys(slots));
const forwardedSlotNames = computed(() => slotNames.value.filter(name => !['option', 'chip'].includes(name)));

function entityFor(option) {
  return instanceFromSelectOption(option);
}

function typeFor(option) {
  return typeIdFromSelectOption(option, props.typeId);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}

function chipOptionFor(value) {
  return selectOptionForValue(props.options, value, props.optionValue);
}

function chipEntityFor(value) {
  return entityFor(chipOptionFor(value));
}

function chipTypeFor(value) {
  return typeFor(chipOptionFor(value));
}
</script>
