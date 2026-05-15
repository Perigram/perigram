<template>
  <div :class="gridClass">
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  variant: { type: String, default: 'cards' }
});

const gridClass = computed(() => {
  if (props.variant === 'dense') {
    return 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
  }
  if (props.variant === 'wide') {
    return 'grid grid-cols-1 gap-[var(--ck-grid-gap)] lg:grid-cols-2';
  }
  return 'grid grid-cols-1 gap-[var(--ck-grid-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6';
});
</script>
