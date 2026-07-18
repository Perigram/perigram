<template>
  <div v-if="entityMode" class="grid min-w-0 gap-2">
    <PrimeMultiSelect
      v-bind="$attrs"
      :model-value="modelValue"
      :options="options"
      :option-label="optionLabel"
      :option-value="optionValue"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #option="{ option }">
        <div v-if="entityFor(option) && typeFor(option)" class="pointer-events-none w-full min-w-0">
          <EntityInlineRef
            :type="typeFor(option)"
            :entity="entityFor(option)"
            :fetch="false"
            :allow-detail-route="false"
            :interactive="false"
            variant="compact"
          />
        </div>
        <span v-else>{{ labelFor(option) }}</span>
      </template>
      <template #value="{ placeholder }">
        <span>{{ placeholder }}</span>
      </template>
      <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
        <slot :name="slotName" v-bind="slotProps || {}" />
      </template>
    </PrimeMultiSelect>
    <div v-if="selectedOptions(modelValue).length" class="grid min-w-0 gap-2" data-entity-selection-list>
      <div
        v-for="option in selectedOptions(modelValue)"
        :key="optionKey(option)"
        class="pointer-events-none min-w-0"
      >
        <EntityInlineRef
          v-if="entityFor(option) && typeFor(option)"
          :type="typeFor(option)"
          :entity="entityFor(option)"
          :fetch="false"
          :allow-detail-route="false"
          :interactive="false"
          variant="compact"
        />
        <span v-else>{{ labelFor(option) }}</span>
      </div>
    </div>
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
import { computed, useSlots } from 'vue';
import PrimeMultiSelect from 'primevue/multiselect';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import {
  entityFromSelectOption,
  entitySelectOptions,
  entityTypeFromSelectOption,
  selectOptionForValue,
  selectOptionLabel,
  selectOptionValue
} from '~/utils/entity-select.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: null },
  optionValue: { type: [String, Function], default: null },
  entityType: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const slots = useSlots();
const entityMode = computed(() => entitySelectOptions(props.options, props.entityType).length > 0);
const slotNames = computed(() => Object.keys(slots));
const forwardedSlotNames = computed(() => slotNames.value.filter(name => !['option', 'value', 'chip'].includes(name)));

function selectedOptions(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => selectOptionForValue(props.options, value, props.optionValue))
    .filter(Boolean);
}

function entityFor(option) {
  return entityFromSelectOption(option);
}

function typeFor(option) {
  return entityTypeFromSelectOption(option, props.entityType);
}

function optionKey(option) {
  return String(selectOptionValue(option, props.optionValue) ?? entityFor(option)?._id ?? entityFor(option)?.identity?.uid);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}
</script>
