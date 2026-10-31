<template>
  <div v-if="entityMode" :class="wrapperClass" class="flex w-full min-w-0 flex-col gap-2">
    <Button
      v-bind="triggerAttrs"
      class="w-full justify-between"
      :label="triggerLabel"
      icon="pi pi-chevron-down"
      icon-pos="right"
      severity="secondary"
      outlined
      aria-haspopup="dialog"
      @click="toggleOverlay"
    />
    <Popover ref="overlayRef" :append-to="appendTo">
      <Listbox
        :model-value="modelValue"
        :options="options"
        :option-label="entityOptionLabel"
        :option-value="optionValue"
        :filter="filter !== false"
        :filter-placeholder="t('common.search')"
        scroll-height="16rem"
        class="w-72"
        :aria-label="triggerLabel"
        @update:model-value="onPick"
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
      </Listbox>
      <RefRowActions
        v-if="createTypeIds.length"
        class="mt-1"
        :type-ids="createTypeIds"
        :create-actions="createActions"
        @select="onCreateSelect"
        @construct-create="action => emit('construct-create', action)"
      />
    </Popover>
    <InstanceInlineRef
      v-if="hasSelectedEntity"
      variant="tile"
      :type="typeFor(selectedOptionRef)"
      :entity="entityFor(selectedOptionRef)"
      :fetch="false"
    />
  </div>
  <PrimeSelect
    v-else
    v-bind="$attrs"
    class="w-full"
    :model-value="modelValue"
    :options="options"
    :option-label="optionLabel"
    :option-value="optionValue"
    :filter="filter === true"
    :placeholder="placeholder"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-for="slotName in slotNames" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps || {}" />
    </template>
  </PrimeSelect>
</template>

<script setup>
import { computed, ref, useAttrs, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import PrimeSelect from 'primevue/select';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import Listbox from 'primevue/listbox';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import RefRowActions from '~/components/ui-mapping/RefRowActions.vue';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceRecordTitle } from '~/utils/instance-shape.js';
import {
  instanceFromSelectOption,
  instanceSelectOptions,
  typeIdFromSelectOption,
  selectOptionForValue,
  selectOptionLabel
} from '~/utils/instance-select.js';

// The single entity picker (SPEC §22.13): the closed control is a trigger —
// the option list opens in a popover hosting a filtered Listbox of instance
// option rows, and the selected instance renders as the instance tile beside
// the control, never inside it.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { default: null },
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: null },
  optionValue: { type: [String, Function], default: null },
  typeId: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  filter: { type: Boolean, default: null },
  appendTo: { type: String, default: 'body' },
  // Compiled create actions by type id (SPEC §22.13): entries for
  // `typeId` render the popover's create affordance.
  createActions: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'create-select', 'construct-create']);
const slots = useSlots();
const attrs = useAttrs();
const instances = useInstancesStore();
const { t } = useI18n();
const { typeById } = useFileTypeView();
const entityMode = computed(() => instanceSelectOptions(props.options, props.typeId).length > 0);
// The create affordance targets the picked type — the prop, else the
// entity options' own type set.
const createTypeIds = computed(() => {
  if (props.typeId) return [props.typeId];
  return [...new Set(instanceSelectOptions(props.options, props.typeId).map(item => item.typeId))];
});
const slotNames = computed(() => Object.keys(slots));
const overlayRef = ref(null);
const selectedOptionRef = computed(() => selectedOption(props.modelValue));
const hasSelectedEntity = computed(() =>
  Boolean(entityFor(selectedOptionRef.value) && typeFor(selectedOptionRef.value)));
const wrapperClass = computed(() => attrs.class || null);
const triggerAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});
const triggerLabel = computed(() => props.placeholder || t('common.select'));

function selectedOption(value) {
  return selectOptionForValue(props.options, value, props.optionValue);
}

function entityFor(option) {
  return instanceFromSelectOption(option);
}

function typeFor(option) {
  return typeIdFromSelectOption(option, props.typeId);
}

function labelFor(option) {
  return selectOptionLabel(option, props.optionLabel);
}

// The §22.13 identifier title also feeds the filter; the wire name and
// the option's label stand in while the type view loads.
function entityOptionLabel(option) {
  const entity = entityFor(option);
  if (entity) {
    const title = instanceRecordTitle(entity, typeById(typeFor(option)));
    if (title) return title;
    if (entity.name != null && entity.name !== '') return String(entity.name);
  }
  return labelFor(option) || t('common.unnamed');
}

function toggleOverlay(event) {
  overlayRef.value?.toggle(event);
}

function onPick(value) {
  emit('update:modelValue', value);
  overlayRef.value?.hide();
}

// The create affordance hands the created record ref to its host — hosts
// own the model shape — and closes the overlay.
function onCreateSelect(option) {
  emit('create-select', option);
  overlayRef.value?.hide();
}
</script>
