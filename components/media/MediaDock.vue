<template>
    <!-- The now-playing dock (see this directory's README): one persistent
         app-shell host for media and calls that outlive their source
         surface. Mobile integrates it as a full-width strip at the top of
         the screen; desktop floats the media card top-right, draggable,
         with the position persisted per browser. The call entry is
         mobile-only — desktop keeps its own floating call window. -->
    <div
        v-if="media.docked || parkedCallRoom"
        class="fixed inset-x-0 top-0 z-[997] flex flex-col items-stretch gap-px pt-[env(safe-area-inset-top)] md:contents"
        data-testid="media-dock"
    >
        <!-- Parked call strip entry: the room stays connected (audio keeps
             playing through the store's sink); expand reopens the full call
             surface, close leaves the call. -->
        <div
            v-if="parkedCallRoom"
            class="flex w-full items-center gap-2 border-b border-chrome-border bg-content px-3 py-1.5 md:hidden"
            data-testid="media-call-pill"
        >
            <i class="pi pi-phone shrink-0 text-primary" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-label">{{ parkedCallLabel }}</span>
            <Button
                icon="pi pi-window-maximize"
                severity="secondary"
                text
                rounded
                size="small"
                class="shrink-0"
                :aria-label="$t('call.join')"
                @click="openParkedCall"
            />
            <Button
                icon="pi pi-times"
                severity="danger"
                text
                rounded
                size="small"
                class="shrink-0"
                :aria-label="$t('call.leave')"
                @click="leaveParkedCall"
            />
        </div>
        <!-- Docked media: the dock's own element resumes the handed-over
             playback at the handed-over position; native controls stay the
             interface, the chrome adds identity and dismissal. The identity
             row is the desktop drag handle (the call-window drag pattern:
             viewport-clamped left/top, persisted like the call window's
             size). -->
        <div
            v-if="media.docked"
            ref="mediaCard"
            class="flex w-full flex-col gap-1 border-b border-chrome-border bg-content px-3 py-1.5 md:fixed md:right-6 md:top-20 md:z-[997] md:w-80 md:rounded-ui md:border-0 md:px-3 md:py-2 md:shadow-overlay"
            data-testid="media-card"
        >
            <div
                class="flex min-w-0 cursor-grab items-center gap-2 max-md:cursor-default"
                @pointerdown="startDrag"
            >
                <i
                    :class="media.docked.kind === 'video' ? 'pi pi-video' : 'pi pi-volume-up'"
                    class="shrink-0 text-muted"
                    aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate text-label">{{ media.docked.title }}</span>
                <Button
                    icon="pi pi-times"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    class="shrink-0"
                    :aria-label="$t('common.close')"
                    @click="media.dismiss()"
                />
            </div>
            <video
                v-if="media.docked.kind === 'video'"
                :key="media.docked.url"
                ref="dockElement"
                :src="media.docked.url"
                controls
                playsinline
                class="max-h-48 w-full rounded-ui"
                @loadedmetadata="resumeDocked"
                @play="media.claim($event.target)"
                @ended="media.dismiss()"
            />
            <audio
                v-else
                :key="media.docked.url"
                ref="dockElement"
                :src="media.docked.url"
                controls
                class="min-w-0 max-w-full"
                @loadedmetadata="resumeDocked"
                @play="media.claim($event.target)"
                @ended="media.dismiss()"
            />
        </div>
    </div>
    <StandardDialog
        v-model:visible="callDialog"
        size="full"
        fill
        :show-default-footer="false"
    >
        <template #header>
            <span class="min-w-0 truncate text-label">{{ parkedCallLabel }}</span>
        </template>
        <div class="flex min-h-0 flex-1 flex-col">
            <CallPanel
                v-if="callDialog && parkedCallRoom"
                :key="parkedCallRoom"
                :room="parkedCallRoom"
                park-on-unmount
                @closed="callDialog = false"
            />
        </div>
    </StandardDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import CallPanel from '~/components/calls/CallPanel.vue';
import { useMediaStore } from '~/stores/media';
import { useCallsStore } from '~/stores/calls';
import { useAuthStore } from '~/stores/auth';
import { useSupportChatStore } from '~/stores/supportChat';
import { callRoomLabel } from '~/utils/call-rooms.js';

const { t } = useI18n();
const media = useMediaStore();
const callsStore = useCallsStore();
const authStore = useAuthStore();
const supportChatStore = useSupportChatStore();

// A parked room with no adopting surface is the mobile strip call: the
// desktop floating window clears its own room on adoption paths, so this
// stays empty there.
const parkedCallRoom = computed(() => (
    callsStore.parkedRoom && !callsStore.floatingRoom ? callsStore.parkedRoom : ''
));

const parkedCallLabel = computed(() => callRoomLabel(parkedCallRoom.value, supportChatStore.conversations, {
    userId: authStore.userData?.userId,
    orgName: authStore.organizationData?.identity?.name || undefined,
    fallback: t('call.title')
}));

const callDialog = ref(false);

const openParkedCall = () => {
    if (!parkedCallRoom.value) return;
    callDialog.value = true;
};

const leaveParkedCall = () => {
    const room = parkedCallRoom.value;
    if (!room) return;
    callDialog.value = false;
    callsStore.dropLiveRoom(room);
    callsStore.leaveRoom(room);
};

// Desktop drag: the media card follows the pointer, clamped to the
// viewport, and the position persists per browser like the call window's
// size. Mobile keeps the integrated strip — drags never start there.
const mediaCard = ref(null);
const POSITION_KEY = 'perigram:media-dock-position';
const isDesktop = () => typeof window !== 'undefined'
    && window.matchMedia('(min-width: 768px)').matches;

const readPersistedPosition = () => {
    try {
        const raw = JSON.parse(window.localStorage.getItem(POSITION_KEY) || 'null');
        if (!raw || !Number.isFinite(raw.left) || !Number.isFinite(raw.top)) return null;
        return raw;
    } catch {
        return null;
    }
};

const applyPersistedPosition = () => {
    if (!mediaCard.value || !isDesktop()) return;
    const raw = readPersistedPosition();
    if (!raw) return;
    mediaCard.value.style.right = 'auto';
    mediaCard.value.style.left = `${Math.max(0, Math.min(raw.left, window.innerWidth - 80))}px`;
    mediaCard.value.style.top = `${Math.max(0, Math.min(raw.top, window.innerHeight - 48))}px`;
};
watch(mediaCard, applyPersistedPosition);
watch(() => media.docked?.url, () => {
    if (mediaCard.value) {
        mediaCard.value.style.left = '';
        mediaCard.value.style.top = '';
        mediaCard.value.style.right = '';
    }
    applyPersistedPosition();
});

let dragState = null;
const startDrag = (event) => {
    if (!isDesktop()) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (event.target?.closest?.('button, video, audio')) return;
    const target = mediaCard.value;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    dragState = { target, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    target.style.right = 'auto';
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
    if (dragState?.target) {
        try {
            window.localStorage.setItem(POSITION_KEY, JSON.stringify({
                left: parseFloat(dragState.target.style.left),
                top: parseFloat(dragState.target.style.top)
            }));
        } catch {
            // Storage is best-effort; the session keeps its position.
        }
    }
    dragState = null;
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
};
onBeforeUnmount(() => {
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
});

// The dock's element registration follows the rendered kind; the media
// store needs it so dismissal pauses exactly the dock's playback.
const dockElement = ref(null);
watch(dockElement, el => media.setDockElement(el));

// Seek-then-play: the resumed position is applied once metadata loads and
// playback continues from an explicit play() — the originating interaction
// already unlocked sound, so no autoplay attribute races the seek.
const resumeDocked = (event) => {
    const el = event.target;
    const time = Number(media.docked?.time);
    if (Number.isFinite(time) && time > 0) {
        const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration - 0.25 : time;
        el.currentTime = Math.max(0, Math.min(time, duration));
    }
    el.play?.().catch(() => {});
};
</script>
