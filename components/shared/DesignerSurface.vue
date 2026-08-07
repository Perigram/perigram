<template>
  <section
    v-bind="$attrs"
    :class="[
      'designer-surface flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      $attrs.class
    ]"
    data-designer-surface
  >
    <slot />
  </section>
</template>

<script setup>
defineOptions({ inheritAttrs: false });
</script>
