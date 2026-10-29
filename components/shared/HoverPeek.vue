<template>
  <slot :peek-events="triggerEvents" />
  <Popover ref="popover" :pt="PEEK_PT" @show="shown = true" @hide="shown = false">
    <div
      v-if="shown"
      class="flex w-72 max-w-[calc(100vw-2rem)] flex-col"
      @mouseenter="holdPeek"
      @mouseleave="scheduleHide"
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
import { onBeforeUnmount, ref } from 'vue';
import Popover from 'primevue/popover';

const props = defineProps({
  enabled: { type: Boolean, default: true }
});

const SHOW_DELAY_MS = 300;
const HIDE_GRACE_MS = 250;
// The peek content rides the panel flush: preview bands reach the rounded
// edges and the content strips own their padding.
const PEEK_PT = { content: { class: 'p-0' } };

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

onBeforeUnmount(() => {
  clearShow();
  clearHide();
});

const triggerEvents = { mouseenter: scheduleShow, mouseleave: scheduleHide };
</script>
