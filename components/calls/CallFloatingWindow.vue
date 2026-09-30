<template>
    <!-- The absolute floating call window: a popped-out call that stays
         above the app independent of routes and tabs. Dragging rides the
         header; dock returns the call to a home workspace tab. -->
    <div
        v-if="callsStore.floatingRoom"
        class="fixed bottom-6 right-6 z-40 hidden h-136 w-120 max-h-dvh max-w-full flex-col overflow-hidden rounded-ui bg-content shadow-overlay md:flex"
        data-floating-call
    >
        <header
            class="flex h-9 shrink-0 cursor-grab items-center gap-1 px-2 select-none"
            :class="{ 'cursor-grabbing': dragging }"
            @pointerdown="startDrag"
        >
            <i class="pi pi-phone shrink-0 text-primary" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label">{{ $t('call.title') }}</span>
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
                :aria-label="$t('common.close')"
                @click="callsStore.closeFloating()"
            />
        </header>
        <div class="flex min-h-0 flex-1 flex-col p-2">
            <CallPanel :room="callsStore.floatingRoom" @closed="callsStore.closeFloating()" />
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import Button from 'primevue/button';
import CallPanel from '~/components/calls/CallPanel.vue';
import { useCallsStore } from '~/stores/calls';
import { useCallRouting } from '~/composables/useCallRouting.js';

const callsStore = useCallsStore();
const { openCallInWorkspaceTab } = useCallRouting();

const dragging = ref(false);
let dragState = null;

const dock = () => {
    const room = callsStore.floatingRoom;
    if (!room) return;
    // The transfer flag makes the unmounting floating panel park the live
    // connection; openCallInWorkspaceTab then routes to the home tab whose
    // panel adopts it (or back to floating when no workspace exists).
    callsStore.beginTransferToTab(room);
    openCallInWorkspaceTab(room);
};

const startDrag = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const target = event.currentTarget?.closest('[data-floating-call]');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    dragState = {
        target,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
    };
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

onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
});
</script>
