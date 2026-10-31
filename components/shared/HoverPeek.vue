<template>
  <slot :peek-events="triggerEvents" />
  <Popover ref="popover" @show="onShow" @hide="shown = false">
    <div
      v-if="shown"
      class="flex max-h-[min(24rem,calc(100dvh-4rem))] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto"
      @mouseenter="holdPeek"
      @mouseleave="scheduleHide"
      @click="onBodyClick"
    >
      <slot name="preview" />
    </div>
  </Popover>
</template>

<script setup>
// The hover peek (SPEC §22.14): a chip's hover preview host. A deliberate
// hover delay raises the popover at the trigger; leaving the trigger or
// the peek dismisses it after a grace period that lets the pointer cross
// into the panel. Clicks keep the trigger's own open behavior — the peek
// is dismissed by the same click through the popover's outside listener.
// The panel rides Aura's own chrome: content sits on the preset's
// popover padding, media bands frame themselves (the framed media
// region), and the body scrolls past its height bound.
import { onBeforeUnmount, ref } from 'vue';
import Popover from 'primevue/popover';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
  enabled: { type: Boolean, default: true }
});
const emit = defineEmits(['show', 'open']);

const SHOW_DELAY_MS = 300;
const HIDE_GRACE_MS = 250;

const popover = ref(null);
const shown = ref(false);
let showTimer = null;
let hideTimer = null;
// Peeks exist where a pointer can hover; touch hosts go straight to the
// click behavior.
const hoverCapable = typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

function clearShow() {
  clearTimeout(showTimer);
  showTimer = null;
}

function clearHide() {
  clearTimeout(hideTimer);
  hideTimer = null;
}

function scheduleShow(event) {
  if (!props.enabled || !hoverCapable) return;
  clearHide();
  if (shown.value) return;
  const target = event.currentTarget;
  clearShow();
  showTimer = setTimeout(() => popover.value?.show({}, target), SHOW_DELAY_MS);
}

function scheduleHide() {
  clearShow();
  clearHide();
  hideTimer = setTimeout(() => popover.value?.hide(), HIDE_GRACE_MS);
}

function holdPeek() {
  clearHide();
}

function onShow() {
  shown.value = true;
  emit('show');
}

// The peek body is one open target: a click on it opens the record
// (nested controls keep their own clicks).
function onBodyClick(event) {
  if (isInteractiveEventTarget(event)) return;
  emit('open', event);
}

onBeforeUnmount(() => {
  clearShow();
  clearHide();
});

const triggerEvents = { mouseenter: scheduleShow, mouseleave: scheduleHide };
</script>
