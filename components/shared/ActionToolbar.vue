<template>
  <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
      <component :is="headingTag" class="m-0 font-semibold leading-tight" :class="headingClass">
        <slot name="title">{{ title }}</slot>
      </component>
      <p v-if="subtitle || $slots.subtitle" class="m-0 text-ui-body text-muted-color">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  level: { type: Number, default: 2 }
});

const headingTag = computed(() => `h${Math.min(Math.max(props.level, 1), 6)}`);
const headingClass = computed(() => (props.level <= 1 ? 'text-ui-display' : 'text-ui-title'));
</script>
