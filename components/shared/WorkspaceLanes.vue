<template>
  <div class="grid h-full min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-12">
    <aside
      v-if="$slots.left"
      class="hidden h-full min-h-0 min-w-0 xl:col-span-3 xl:flex xl:flex-col xl:gap-3"
    >
      <slot name="left" />
    </aside>

    <main
      :class="[
        'flex h-full min-h-0 min-w-0 flex-col gap-4 xl:col-span-6',
        centerScroll ? 'overflow-y-auto pr-1' : 'overflow-hidden',
      ]"
    >
      <slot />
    </main>

    <aside
      v-if="$slots.right"
      class="h-full min-h-0 min-w-0 overflow-y-auto pr-1 xl:col-span-3"
    >
      <slot name="right" />
    </aside>
  </div>
</template>

<script setup>
defineProps({
  centerScroll: { type: Boolean, default: true },
});
</script>
