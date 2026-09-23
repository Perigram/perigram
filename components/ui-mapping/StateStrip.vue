<template>
  <Stepper :value="displayStep" class="state-strip w-full">
    <StepList>
      <Step
        v-for="(value, index) in stateValues"
        :key="value"
        :value="String(index + 1)"
        :disabled="!stepAction(value)"
        :class="stepAction(value) ? 'cursor-pointer' : ''"
        :title="labelFor(value)"
        :aria-label="stepLabel(value)"
        @click="onStep(value)"
      >
        {{ labelFor(value) }}
      </Step>
    </StepList>
  </Stepper>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Stepper from 'primevue/stepper';
import StepList from 'primevue/steplist';
import Step from 'primevue/step';
import { resolveActionButton } from '#shared/ui-mapping/index.js';

// The lifecycle strip: the declared state axis as a linear PrimeVue
// Stepper. The strip fits its container through the scoped CSS block
// below: PrimeVue sizes steps on their content (flex-basis auto, and the
// last step flex:initial), so long labels overflow — the scoped rules
// take sizing away from content entirely (equal flex-basis-0 shares,
// min-width 0 down the chain) and the built-in title ellipsis crops;
// the native title attribute carries the full name. A state with a
// runnable manual
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

<style scoped>
/* Content-free sizing for the step row (the SurfaceHeader scoped-CSS
   pattern — Tailwind arbitrary-variant classes on the Step proved
   fragile). PrimeVue sizes .p-step on content (flex: 1 1 auto, and
   :last-of-type flex: initial) and gives .p-steplist overflow-x: auto,
   so long labels overflow their container into a scroll. Equal
   flex-basis-0 shares with min-width 0 at every level remove content
   from sizing entirely; the title WRAPS (never cropped, never scrolled
   away) — long state labels grow the row instead of overflowing it. */
.state-strip :deep(.p-steplist) {
  min-width: 0;
}

.state-strip :deep(.p-step) {
  flex: 1 1 0;
  min-width: 0;
}

.state-strip :deep(.p-step:last-of-type) {
  flex: 1 1 0;
}

.state-strip :deep(.p-step-header) {
  width: 100%;
  min-width: 0;
}

.state-strip :deep(.p-step-number) {
  flex: none;
}

.state-strip :deep(.p-step-title) {
  flex: 0 1 auto;
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  overflow-wrap: anywhere;
  min-width: 0;
}
</style>
