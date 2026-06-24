<template>
  <div :class="rootClass">
    <aside
      v-if="$slots.left"
      :class="leftClass"
    >
      <slot name="left" />
    </aside>

    <main
      :class="mainClass"
    >
      <slot />
    </main>

    <aside
      v-if="$slots.right"
      :class="rightClass"
    >
      <slot name="right" />
    </aside>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  centerScroll: { type: Boolean, default: true },
  layout: {
    type: String,
    default: 'lanes',
    validator: value => ['lanes', 'stack'].includes(value),
  },
});

const isStack = computed(() => props.layout === 'stack');
const rootClass = computed(() => (
  isStack.value
    ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1'
    : 'grid h-full min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-12'
));
const leftClass = computed(() => (
  isStack.value
    ? 'flex min-h-0 min-w-0 flex-col gap-3'
    : 'hidden h-full min-h-0 min-w-0 lg:col-span-3 lg:flex lg:flex-col lg:gap-3'
));
const mainClass = computed(() => [
  isStack.value
    ? 'flex min-h-0 min-w-0 flex-col gap-4'
    : 'flex h-full min-h-0 min-w-0 flex-col gap-4 lg:col-span-6',
  props.centerScroll ? 'overflow-y-auto pr-1' : (isStack.value ? '' : 'overflow-hidden'),
]);
const rightClass = computed(() => (
  isStack.value
    ? 'min-h-0 min-w-0'
    : 'h-full min-h-0 min-w-0 overflow-y-auto pr-1 lg:col-span-3'
));
</script>
