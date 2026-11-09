<template>
  <ActionButton
    v-if="!grouped"
    :action="action"
    :state-policy="statePolicy"
    :label="buttonLabel"
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
    <Button
      :icon="resolved.icon || undefined"
      :label="buttonLabel"
      :severity="resolved.severity || undefined"
      size="small"
      @click="run(selectedAction)"
    />
  </InputGroup>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputGroup from 'primevue/inputgroup';
import Select from 'primevue/select';
import { resolveActionButton } from '#shared/ui-mapping/index.js';
import { creationModeLabel } from '~/packages/processes/src/ui-contract-projection.js';
import { generatedCreateLabel } from '~/utils/generated-labels.js';
import ActionButton from './ActionButton.vue';

const props = defineProps({
  // The control's lead action (contract order); a sibling group of
  // same-type creates renders the creation-mode selection beside it.
  action: { type: Object, required: true },
  group: { type: Array, default: null },
  statePolicy: { type: Object, default: null },
  // A host-supplied caption that wins over the type caption (a
  // collection header already naming its class passes the bare "New").
  label: { type: String, default: null }
});

const emit = defineEmits(['run']);

const { te, t } = useI18n();
const grouped = computed(() => (props.group?.length || 0) > 1);
const selectedId = ref(props.action?.id ?? null);
const selectedAction = computed(() => (
  props.group?.find(action => action.id === selectedId.value) || props.action
));
const modeOptions = computed(() => (props.group || []).map(action => ({
  label: creationModeLabel(action.construction?.mode) || action.label || action.id,
  value: action.id
})));
// The caption names the created type through the localized create-label
// chain; the creation mode lives in the select, never in the caption.
const resolved = computed(() => resolveActionButton(selectedAction.value, { statePolicy: props.statePolicy }));
const buttonLabel = computed(() => props.label
  || generatedCreateLabel(selectedAction.value, { t, te, includeMode: false })
  || resolved.value.label
  || selectedAction.value.label);
const run = action => emit('run', action);
</script>
