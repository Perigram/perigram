<template>
    <!-- The absolute floating call window: the session's desktop parking
         surface (SPEC §11), draggable and resizable above the app.
         Docking returns the call to a home workspace tab; closing leaves
         the call. -->
    <div
        v-if="callsStore.floatingRoom"
        ref="windowEl"
        class="fixed bottom-6 right-6 z-40 hidden w-call-window h-call-window max-h-dvh max-w-full flex-col overflow-hidden rounded-ui bg-content shadow-overlay md:flex"
        :style="windowStyle"
        data-floating-call
    >
        <header
            class="flex h-9 shrink-0 cursor-grab items-center gap-1 px-2 select-none"
            :class="{ 'cursor-grabbing': dragging }"
            @pointerdown="event => startDrag(event, windowEl)"
        >
            <i class="pi pi-phone shrink-0 text-primary" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label">{{ roomLabel }}</span>
            <Button
                icon="pi pi-window-maximize"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('call.dock')"
                @click="dock"
            />
            <Button
                icon="pi pi-times"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('call.leave')"
                @click="leave"
            />
        </header>
        <div class="flex min-h-0 flex-1 flex-col p-2">
            <CallPanel :room="callsStore.floatingRoom" @closed="leave" />
        </div>
        <!-- Resize grip: the window is bottom-right anchored, so the grip
              grows it up-left. Pointer-driven like the drag header. -->
        <span
            class="absolute bottom-0 left-0 h-4 w-4 cursor-nwse-resize"
            aria-hidden="true"
            @pointerdown="startResize"
        ></span>
    </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import Button from 'primevue/button';
// The panel chunk loads only when a floating room actually exists.
const CallPanel = defineAsyncComponent(() => import('~/components/calls/CallPanel.vue'));
import { useI18n } from 'vue-i18n';
import { useCallsStore } from '~/stores/calls';
import { useCallRouting } from '~/composables/useCallRouting.js';
import { useCallRoomLabel } from '~/composables/useCallRoomLabel.js';
import { useFloatingDrag } from '~/composables/useFloatingDrag.js';

const callsStore = useCallsStore();
const { t } = useI18n();
const { openCallInWorkspaceTab } = useCallRouting();

// The header names the call (conversation or caller), not the generic
// word — same resolver the home sidebar rows use.
const callRoomLabel = useCallRoomLabel();
const roomLabel = computed(() => callRoomLabel(callsStore.floatingRoom, t('call.title')));

const leave = () => {
    callsStore.closeFloating();
    callsStore.leaveSession();
};

// Docking seats the session in a home workspace tab: the tab mounts as
// this window closes, so the session never loses its surface.
const dock = () => {
    const room = callsStore.floatingRoom;
    if (!room) return;
    callsStore.closeFloating();
    openCallInWorkspaceTab(room);
};

const windowEl = ref(null);
const { startDrag, applyPersisted, dragging } = useFloatingDrag({ storageKey: 'perigram:call-window-position' });
watch(windowEl, el => applyPersisted(el));

// Window size: token defaults, user-resizable, persisted per browser.
const SIZE_KEY = 'perigram:call-window-size';
const clampSize = (value, min, max) => Math.max(min, Math.min(value, max));
const readPersistedSize = () => {
    try {
        const raw = JSON.parse(window.localStorage.getItem(SIZE_KEY) || 'null');
        if (!raw || !Number.isFinite(raw.width) || !Number.isFinite(raw.height)) return null;
        return raw;
    } catch {
        return null;
    }
};
const persisted = process.client ? readPersistedSize() : null;
const windowWidth = ref(persisted?.width || null);
const windowHeight = ref(persisted?.height || null);
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

let resizeState = null;
const startResize = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const target = windowEl.value;
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
        window.localStorage.setItem(SIZE_KEY, JSON.stringify({ width: windowWidth.value, height: windowHeight.value }));
    } catch {
        // Storage is best-effort; the session keeps its size regardless.
    }
    window.removeEventListener('pointermove', moveResize);
    window.removeEventListener('pointerup', endResize);
};

onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moveResize);
    window.removeEventListener('pointerup', endResize);
});
</script>
