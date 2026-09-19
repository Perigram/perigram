<template>
  <div :class="LAYOUT.scrollX">
    <Stepper :value="displayStep" class="min-w-max">
      <StepList>
        <Step
          v-for="(value, index) in stateValues"
          :key="value"
          :value="String(index + 1)"
          :disabled="!stepAction(value)"
          :class="stepAction(value) ? 'cursor-pointer' : ''"
          :aria-label="stepLabel(value)"
          @click="onStep(value)"
        >
          {{ labelFor(value) }}
        </Step>
      </StepList>
    </Stepper>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Stepper from 'primevue/stepper';
import StepList from 'primevue/steplist';
import Step from 'primevue/step';
import { LAYOUT, resolveActionButton } from '#shared/ui-mapping/index.js';

// The lifecycle strip: the declared state axis as a linear PrimeVue
// Stepper, horizontally scrollable. A state with a runnable manual
// transition action in the region action set is an enabled step —
// clicking it emits the action through the same `run` contract as every
// other action (confirmation and dispatch stay with the screen), so the
// stepper is the status-transition surface, not a second button row.
// Event-triggered or hidden actions and the current state never become
// steps; without actions the strip stays a pure display. The highlight
// is optimistic on click and re-anchors from the instance on reload.
const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true },
  actions: { type: Array, default: () => [] }
});

const emit = defineEmits(['run']);

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const stateValues = computed(() => props.type.states?.main?.values || []);
const labelFor = value => props.type.render?.states?.[value]?.label || startCase(value);
const currentValue = computed(() => props.instance.states?.main);
const activeStep = computed(() => String(Math.max(1, stateValues.value.indexOf(currentValue.value) + 1)));
const displayStep = ref(activeStep.value);
watch([activeStep, () => props.instance], () => { displayStep.value = activeStep.value; });
function stepAction(value) {
  if (!value || value === currentValue.value) return null;
  return props.actions.find(action => action?.status?.to === value
    && action?.trigger?.mode === 'manual'
    && !resolveActionButton(action, { render: props.type?.render }).hidden) || null;
}
const stepLabel = value => (stepAction(value) ? `${labelFor(value)}: ${stepAction(value).label}` : labelFor(value));
function onStep(value) {
  const action = stepAction(value);
  if (action) emit('run', action);
}
</script>
