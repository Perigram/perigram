<template>
  <div
    v-if="entityMode"
    :class="hasSelectedEntity
      ? 'flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden'
      : 'grid w-full min-w-0 max-w-full gap-2'"
  >
    <div
      v-if="hasSelectedEntity"
      class="pointer-events-none min-w-0 flex-1 overflow-hidden"
      data-entity-selection
    >
      <EntityInlineRef
        :type="typeFor(selectedOptionRef)"
        :entity="selectedEntityRef"
        :fetch="false"
        :allow-detail-route="false"
        :interactive="false"
        variant="compact"
      />
    </div>
    <PrimeSelect
      v-bind="controlAttrs"
      :class="hasSelectedEntity ? '!w-10 shrink-0 self-start' : null"
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
        <span v-if="hasSelectedEntity" class="pi pi-pencil" aria-hidden="true"></span>
        <span v-else>{{ placeholder }}</span>
      </template>
      <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
        <slot :name="slotName" v-bind="slotProps || {}" />
      </template>
    </PrimeSelect>
  </div>
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
import { computed, useAttrs, useSlots } from 'vue';
import PrimeSelect from 'primevue/select';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import {
  entityFromSelectOption,
  entitySelectOptions,
  entityTypeFromSelectOption,
  selectOptionForValue,
  selectOptionLabel
} from '~/utils/entity-select.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { default: null },
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: null },
  optionValue: { type: [String, Function], default: null },
  entityType: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const slots = useSlots();
const attrs = useAttrs();
const entityMode = computed(() => entitySelectOptions(props.options, props.entityType).length > 0);
const slotNames = computed(() => Object.keys(slots));
const forwardedSlotNames = computed(() => slotNames.value.filter(name => !['option', 'value'].includes(name)));
const selectedOptionRef = computed(() => selectedOption(props.modelValue));
const selectedEntityRef = computed(() => entityFor(selectedOptionRef.value));
const hasSelectedEntity = computed(() => Boolean(selectedEntityRef.value && typeFor(selectedOptionRef.value)));
const selectedTriggerLabel = computed(() => labelFor(selectedOptionRef.value));
const controlAttrs = computed(() => {
  if (!hasSelectedEntity.value) return attrs;
  return { ...attrs, 'aria-label': selectedTriggerLabel.value || attrs['aria-label'] };
});

function selectedOption(value) {
  return selectOptionForValue(props.options, value, props.optionValue);
}

function entityFor(option) {
  return entityFromSelectOption(option);
}

function typeFor(option) {
  return entityTypeFromSelectOption(option, props.entityType);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}
</script>
