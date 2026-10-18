<template>
  <!-- The shared floating-surface shell: a detached tab's window chrome
       (viewport anchoring, drag, resize, persisted size). The host owns
       the header content and the body; a floating surface hosts the same
       content components a pane tab hosts. -->
  <section
    v-if="visible"
    :data-floating-surface="storageKey"
    class="fixed bottom-6 right-6 z-40 hidden w-call-window h-call-window max-h-dvh max-w-full flex-col overflow-hidden rounded-ui bg-content shadow-overlay md:flex"
    :style="windowStyle"
  >
    <header
      class="flex h-9 shrink-0 cursor-grab items-center gap-1 px-2 select-none"
      :class="{ 'cursor-grabbing': dragging }"
      @pointerdown="startDrag"
    >
      <slot name="header" />
    </header>
    <div class="flex min-h-0 flex-1 flex-col p-2">
      <slot />
    </div>
    <!-- Resize grip: the window is bottom-right anchored, so the grip
         grows it up-left. -->
    <span
      class="absolute bottom-0 left-0 h-4 w-4 cursor-nwse-resize"
      aria-hidden="true"
      @pointerdown="startResize"
    ></span>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  // The localStorage key the user-resizable window size persists under.
  storageKey: { type: String, required: true }
});

// Window size: token defaults, user-resizable, persisted per browser.
const clampSize = (value, min, max) => Math.max(min, Math.min(value, max));
const readPersistedSize = () => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(props.storageKey) || 'null');
    if (!raw || !Number.isFinite(raw.width) || !Number.isFinite(raw.height)) return null;
    return raw;
  } catch {
    return null;
  }
};
const windowWidth = ref(null);
const windowHeight = ref(null);
onMounted(() => {
  const persisted = readPersistedSize();
  windowWidth.value = persisted?.width || null;
  windowHeight.value = persisted?.height || null;
});
const windowStyle = computed(() => ({
  ...(windowWidth.value ? { width: `${windowWidth.value}px` } : {}),
  ...(windowHeight.value ? { height: `${windowHeight.value}px` } : {})
}));

const limits = () => ({
  minW: cssPixels('--ck-call-window-min-width', 352),
  minH: cssPixels('--ck-call-window-min-height', 320),
  maxW: window.innerWidth - 24,
  maxH: window.innerHeight - 24
});
const cssPixels = (name, fallback) => {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value * 16 : fallback;
};

const dragging = ref(false);
let dragState = null;
let resizeState = null;

const surfaceEl = event => event.currentTarget?.closest('[data-floating-surface]');

const startDrag = (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  const target = surfaceEl(event);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  dragState = { target, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
  dragging.value = true;
  target.style.right = 'auto';
  target.style.bottom = 'auto';
  target.style.left = `${rect.left}px`;
  target.style.top = `${rect.top}px`;
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  event.preventDefault();
};

const moveDrag = (event) => {
  if (!dragState) return;
  const nextLeft = dragState.left + event.clientX - dragState.startX;
  const nextTop = dragState.top + event.clientY - dragState.startY;
  dragState.target.style.left = `${Math.max(0, Math.min(nextLeft, window.innerWidth - 80))}px`;
  dragState.target.style.top = `${Math.max(0, Math.min(nextTop, window.innerHeight - 48))}px`;
};

const endDrag = () => {
  dragState = null;
  dragging.value = false;
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', endDrag);
};

const startResize = (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  const target = surfaceEl(event);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const { minW, minH, maxW, maxH } = limits();
  resizeState = {
    target,
    startX: event.clientX,
    startY: event.clientY,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    minW, minH, maxW, maxH
  };
  target.style.right = 'auto';
  target.style.bottom = 'auto';
  target.style.left = `${rect.left}px`;
  target.style.top = `${rect.top}px`;
  window.addEventListener('pointermove', moveResize);
  window.addEventListener('pointerup', endResize);
  event.preventDefault();
};

const moveResize = (event) => {
  if (!resizeState) return;
  // Anchor stays the top-right corner: width follows the pointer left,
  // height follows it up.
  const width = clampSize(resizeState.width - (event.clientX - resizeState.startX), resizeState.minW, resizeState.maxW);
  const height = clampSize(resizeState.height - (event.clientY - resizeState.startY), resizeState.minH, resizeState.maxH);
  resizeState.target.style.width = `${width}px`;
  resizeState.target.style.height = `${height}px`;
  resizeState.target.style.left = `${resizeState.right - width}px`;
  resizeState.target.style.top = `${resizeState.bottom - height}px`;
  windowWidth.value = width;
  windowHeight.value = height;
};

const endResize = () => {
  resizeState = null;
  try {
    window.localStorage.setItem(props.storageKey, JSON.stringify({ width: windowWidth.value, height: windowHeight.value }));
  } catch {
    // Storage is best-effort; the session keeps its size regardless.
  }
  window.removeEventListener('pointermove', moveResize);
  window.removeEventListener('pointerup', endResize);
};

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointermove', moveResize);
  window.removeEventListener('pointerup', endResize);
});
</script>
