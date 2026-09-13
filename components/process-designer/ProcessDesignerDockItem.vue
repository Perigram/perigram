<template>
  <button
    ref="buttonRef"
    type="button"
    tabindex="-1"
    data-pc-section="itemlink"
    :class="buttonClass"
    :disabled="item.disabled"
    :aria-label="item.label"
    :aria-pressed="typeof item.pressed === 'boolean' ? item.pressed : undefined"
    :aria-haspopup="item.hasPopup ? 'dialog' : undefined"
    @click="handleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <span class="flex items-center justify-center">
      <i :class="item.icon" aria-hidden="true"></i>
    </span>
    <span v-if="item.attention" class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
    <div
      ref="labelRef"
      role="tooltip"
      class="pointer-events-none absolute bottom-full left-1/2 mb-1 w-fit -translate-x-1/2 whitespace-pre rounded-ui border border-content-border bg-content px-2 py-1 text-supporting opacity-0"
    >{{ item.label }}</div>
  </button>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import { useEnterExit } from '~/composables/useMotion.js';

  const props = defineProps({
    item: { type: Object, required: true }
  });

  const labelRef = ref(null);
  const isHovered = ref(false);
  const labelVisible = computed(() => isHovered.value);
  useEnterExit(labelRef, labelVisible, { y: 6, duration: 0.16 });

  const buttonClass = computed(() => [
    'relative box-border inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-ui border transition-colors',
    props.item.pressed ? 'border-primary bg-subtle' : 'border-transparent',
    props.item.disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-subtle'
  ].filter(Boolean));

  function handleClick(event) {
    if (!props.item.disabled) props.item.onClick?.(event);
  }
</script>
