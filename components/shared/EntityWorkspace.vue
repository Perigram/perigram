<template>
  <div class="grid h-full min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-12">
    <section
      v-if="$slots.lead"
      class="min-h-0 min-w-0 lg:col-span-12"
    >
      <slot name="lead" />
    </section>

    <main :class="mainClass">
      <slot />
    </main>

    <aside
      v-if="$slots.support"
      class="min-h-0 min-w-0 lg:col-span-4"
    >
      <slot name="support" />
    </aside>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  mainSpan: { type: Number, default: 8 },
});

const mainClass = computed(() => [
  'flex min-h-0 min-w-0 flex-col gap-4',
  props.mainSpan === 12 || !props.mainSpan ? 'lg:col-span-12' : 'lg:col-span-8',
]);
</script>
