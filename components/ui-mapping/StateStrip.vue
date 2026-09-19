<template>
  <Stepper :value="activeValue">
    <StepList>
      <Step v-for="value in stateValues" :key="value" :value="value">
        {{ labelFor(value) }}
      </Step>
    </StepList>
  </Stepper>
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
const activeValue = computed(() => props.instance.states?.main || stateValues.value[0]);
</script>
