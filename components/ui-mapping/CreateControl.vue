<template>
  <ActionButton
    v-if="!grouped"
    :action="action"
    :state-policy="statePolicy"
    :label="label"
    @run="run"
  />
  <InputGroup v-else>
    <Select
      v-model="selectedId"
      :options="modeOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="w-36 max-w-full"
      :aria-label="t('uiMapping.creationMode')"
    />
    <ActionButton
      :action="selectedAction"
      :state-policy="statePolicy"
      :label="label"
      @run="run"
    />
  </InputGroup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import InputGroup from 'primevue/inputgroup';
import Select from 'primevue/select';
import { creationModeLabel } from '~/packages/processes/src/ui-contract-projection.js';
import ActionButton from './ActionButton.vue';

const props = defineProps({
  // The control's lead action (contract order); a sibling group of
  // same-type creates renders the creation-mode selection beside it.
  action: { type: Object, required: true },
  group: { type: Array, default: null },
  // Context-supplied caption (ActionButton's label channel).
  label: { type: String, default: null },
  statePolicy: { type: Object, default: null }
});

const emit = defineEmits(['run']);

const { t } = useI18n();
const grouped = computed(() => (props.group?.length || 0) > 1);
const selectedId = ref(props.action?.id ?? null);
const selectedAction = computed(() => (
  props.group?.find(action => action.id === selectedId.value) || props.action
));
const modeOptions = computed(() => (props.group || []).map(action => ({
  label: creationModeLabel(action.construction?.mode) || action.label || action.id,
  value: action.id
})));
const run = action => emit('run', action);
</script>
