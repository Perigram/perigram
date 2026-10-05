<template>
    <!-- The now-playing dock (see this directory's README): one persistent
         app-shell host for media and calls that outlive their source
         surface. Mobile pins it as a lane at the top of the screen; desktop
         floats it top-right. The call entry is mobile-only — desktop keeps
         its own floating call window. -->
    <div
        v-if="media.docked || parkedCallRoom"
        class="fixed inset-x-0 top-0 z-[997] flex flex-col items-center gap-2 px-2 pt-[max(0.25rem,env(safe-area-inset-top))] md:inset-x-auto md:right-6 md:top-20 md:items-stretch md:px-0 md:pt-0"
        data-testid="media-dock"
    >
        <!-- Parked call pill: the room stays connected (audio keeps playing
             through the store's sink); expand reopens the full call surface,
             close leaves the call. -->
        <div
            v-if="parkedCallRoom"
            class="flex w-full max-w-md items-center gap-2 rounded-ui bg-content px-3 py-1.5 shadow-overlay md:hidden"
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
             interface, the chrome adds identity and dismissal. -->
        <div
            v-if="media.docked"
            class="flex w-full max-w-md flex-col gap-1 rounded-ui bg-content px-3 py-2 shadow-overlay md:w-80"
            data-testid="media-card"
        >
            <div class="flex min-w-0 items-center gap-2">
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
import { computed, ref, watch } from 'vue';
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

// A parked room with no adopting surface is the mobile top-lane call: the
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
