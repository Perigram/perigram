<template>
  <section class="rounded-panel border border-content-border bg-content p-4 shadow-card">
    <div v-if="title || subtitle" class="mb-4 flex flex-col gap-1">
      <h2 v-if="title" class="m-0 text-base font-semibold">{{ title }}</h2>
      <p v-if="subtitle" class="m-0 text-sm text-muted-color">{{ subtitle }}</p>
    </div>

    <div :class="metricGridClass">
      <div
        v-for="metric in metrics"
        :key="metric.key || metric.label"
        class="rounded-ui border border-content-border bg-subtle px-3 py-3"
      >
        <small class="text-muted-color">{{ metric.label }}</small>
        <div class="mt-1 text-2xl font-semibold leading-tight">{{ metric.value }}</div>
      </div>
    </div>

    <div v-if="$slots.default" class="mt-4 border-t border-content-border pt-4">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

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
    ? 'grid grid-cols-2 gap-3 xl:grid-cols-1'
    : 'grid grid-cols-2 gap-3 lg:grid-cols-4'
));
</script>
