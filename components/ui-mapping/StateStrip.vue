<template>
  <div class="w-full overflow-x-auto">
    <Stepper :value="activeStep" class="min-w-max">
      <StepList>
        <Step v-for="(value, index) in stateValues" :key="value" :value="String(index + 1)">
          {{ labelFor(value) }}
        </Step>
      </StepList>
    </Stepper>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Stepper from 'primevue/stepper';
import StepList from 'primevue/steplist';
import Step from 'primevue/step';

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true }
});

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const stateValues = computed(() => props.type.states?.main?.values || []);
const labelFor = value => props.type.render?.states?.[value]?.label || startCase(value);
const activeStep = computed(() => String(Math.max(1, stateValues.value.indexOf(props.instance.states?.main) + 1)));
</script>
