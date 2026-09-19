<template>
  <div class="flex flex-wrap items-center gap-1">
    <Tag
      v-for="value in stateValues"
      :key="value"
      :value="labelFor(value)"
      :severity="value === currentState ? severityFor(value) : 'secondary'"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { SEVERITY_MAP } from '#shared/ui-mapping/index.js';

const props = defineProps({
  type: { type: Object, required: true },
  instance: { type: Object, required: true }
});

const startCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const stateValues = computed(() => props.type.states?.main?.values || []);
const currentState = computed(() => props.instance.states?.main);
const labelFor = value => props.type.render?.states?.[value]?.label || startCase(value);
const severityFor = value => SEVERITY_MAP[props.type.render?.states?.[value]?.severity] || 'info';
</script>
