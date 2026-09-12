<template>
  <Panel>
    <div v-if="title || subtitle" class="mb-4 flex flex-col gap-1">
      <h2 v-if="title" class="m-0 text-section-heading">{{ title }}</h2>
      <p v-if="subtitle" class="m-0 text-body text-muted-color">{{ subtitle }}</p>
    </div>

    <div :class="metricGridClass">
      <div
        v-for="metric in metrics"
        :key="metric.key || metric.label"
        class="px-3 py-3"
      >
        <small class="text-label text-muted-color">{{ metric.label }}</small>
        <div class="mt-1 text-metric">{{ metric.value }}</div>
      </div>
    </div>

    <div v-if="$slots.default" class="mt-4 border-t border-content-border pt-4">
      <slot />
    </div>
  </Panel>
</template>

<script setup>
import { computed } from 'vue';
import Panel from 'primevue/panel';

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  metrics: {
    type: Array,
    required: true
  },
  orientation: {
    type: String,
    default: 'horizontal',
    validator: (value) => ['horizontal', 'vertical'].includes(value)
  }
});

const metricGridClass = computed(() => (
  props.orientation === 'vertical'
    ? 'grid grid-cols-2 gap-3 lg:grid-cols-1'
    : 'grid grid-cols-2 gap-3 lg:grid-cols-4'
));
</script>
