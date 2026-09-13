<template>
  <button
    ref="buttonRef"
    type="button"
    tabindex="-1"
    data-pc-section="itemlink"
    :class="buttonClass"
    :style="buttonStyle"
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
  import { computed, ref, watch } from 'vue';
  import { useEnterExit, useFollowValue } from '~/composables/useMotion.js';
  import { useReducedMotion } from '~/composables/useReducedMotion.js';

  const props = defineProps({
    item: { type: Object, required: true },
    mouseX: { type: Number, default: Infinity },
    distance: { type: Number, required: true },
    baseItemSize: { type: Number, required: true },
    magnification: { type: Number, required: true }
  });

  const buttonRef = ref(null);
  const labelRef = ref(null);
  const isHovered = ref(false);
  const isFocused = ref(false);
  const reducedMotion = useReducedMotion();

  const size = useFollowValue(props.baseItemSize, { duration: 0.3, ease: 'power3.out' });
  const labelVisible = computed(() => isHovered.value || isFocused.value);
  useEnterExit(labelRef, labelVisible, { y: 6, duration: 0.16 });

  watch(() => props.mouseX, mouseX => {
    if (reducedMotion.value || !Number.isFinite(mouseX)) return;
    const rect = buttonRef.value?.getBoundingClientRect();
    if (!rect) return;
    const distanceFromPointer = mouseX - rect.x - props.baseItemSize / 2;
    const clamped = Math.max(-props.distance, Math.min(props.distance, distanceFromPointer));
    const proximity = 1 - Math.abs(clamped) / props.distance;
    size.set(props.baseItemSize + (props.magnification - props.baseItemSize) * proximity);
  });

  watch(
    () => ({ baseItemSize: props.baseItemSize, reducedMotion: reducedMotion.value }),
    ({ baseItemSize, reducedMotion: reduce }) => {
      if (reduce) size.jump(baseItemSize);
      else size.set(baseItemSize);
    }
  );

  const buttonClass = computed(() => [
    'relative box-border inline-flex flex-none cursor-pointer items-center justify-center rounded-ui border transition-colors',
    isFocused.value || props.item.pressed ? 'border-primary bg-subtle' : 'border-transparent',
    props.item.disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-subtle'
  ].filter(Boolean));
  const buttonStyle = computed(() => ({
    width: `${Math.round(size.current.value)}px`,
    height: `${Math.round(size.current.value)}px`
  }));

  function handleClick(event) {
    if (!props.item.disabled) props.item.onClick?.(event);
  }
</script>
