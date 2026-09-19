<template>
  <Stepper :value="activeIndex" linear>
    <StepperPanel v-for="value in stateValues" :key="value" :header="labelFor(value)" />
  </Stepper>
</template>

<script setup>
import { computed } from 'vue';
import Stepper from 'primevue/stepper';
import StepperPanel from 'primevue/stepperpanel';

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true }
});

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const stateValues = computed(() => props.type.states?.main?.values || []);
const labelFor = value => props.type.render?.states?.[value]?.label || startCase(value);
const activeIndex = computed(() => Math.max(0, stateValues.value.indexOf(props.instance.states?.main)));
</script>
