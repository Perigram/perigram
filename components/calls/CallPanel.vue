<template>
    <div class="flex h-full min-h-0 flex-col gap-3">
        <ActionToolbar :title="$t('call.title')" :subtitle="statusText" :level="2">
            <template #actions>
                <Button
                    :icon="micEnabled ? 'pi pi-microphone' : 'pi pi-microphone-slash'"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('call.toggleMic')"
                    :disabled="!connected"
                    @click="toggleMic"
                />
                <Button
                    :icon="cameraEnabled ? 'pi pi-video' : 'pi pi-video-off'"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('call.toggleCamera')"
                    :disabled="!connected"
                    @click="toggleCamera"
                />
                <Button
                    icon="pi pi-phone"
                    severity="danger"
                    rounded
                    size="small"
                    :label="$t('call.leave')"
                    :disabled="!connected"
                    @click="leave"
                />
            </template>
        </ActionToolbar>

        <StateBlock v-if="error" state="error" :message="error">
            <template #action>
                <Button :label="$t('call.retry')" severity="secondary" size="small" @click="join" />
            </template>
        </StateBlock>
        <StateBlock v-else-if="!connected" state="loading" :message="$t('call.connecting')" />

        <div v-else class="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-2">
            <div
                v-for="tile in tiles"
                :key="tile.identity"
                class="relative flex min-h-56 items-center justify-center overflow-hidden rounded-ui bg-subtle"
                :data-call-tile="tile.identity"
            >
                <video
                    :ref="el => registerTileVideo(tile.identity, el)"
                    class="h-full w-full object-cover"
                    :class="{ 'opacity-0': !tile.hasVideo }"
                    autoplay
                    playsinline
                    muted
                />
                <div v-if="!tile.hasVideo" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Avatar :label="tile.name?.charAt(0).toUpperCase() || '?'" shape="circle" class="bg-primary text-primary-contrast" />
                    <span class="text-label">{{ tile.name || tile.identity }}</span>
                </div>
                <span class="absolute bottom-2 left-2 flex items-center gap-2 rounded-ui bg-content px-2 py-1">
                    <span class="text-supporting">{{ tile.name || tile.identity }}</span>
                    <i :class="tile.speaking ? 'pi pi-volume-up text-status-success' : 'pi pi-volume-up text-muted-color'" />
                    <i v-if="!tile.muted" class="pi pi-microphone-slash text-muted-color" :aria-label="$t('call.muted')" />
                </span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

const props = defineProps({
    room: { type: String, required: true }
});
const emit = defineEmits(['closed']);
const { t } = useI18n();

const connected = ref(false);
const error = ref('');
const micEnabled = ref(false);
const cameraEnabled = ref(false);
const tiles = reactive([]);
const tileVideos = new Map();
let livekitRoom = null;

const statusText = computed(() => {
    if (error.value) return t('call.failed');
    if (!connected.value) return t('call.connecting');
    return t('call.participants', { count: tiles.length });
});

const registerTileVideo = (identity, el) => {
    if (el) {
        tileVideos.set(identity, el);
        attachPending(identity);
    } else {
        tileVideos.delete(identity);
    }
};

const attachPending = (identity) => {
    const tile = tiles.find(entry => entry.identity === identity);
    const el = tileVideos.get(identity);
    if (!tile?.track || !el) return;
    el.srcObject = new MediaStream([tile.track.mediaStreamTrack]);
    el.play().catch(() => {});
};

const syncTile = (identity, name = '', patch = {}) => {
    const index = tiles.findIndex(entry => entry.identity === identity);
    if (index < 0) {
        tiles.push({ identity, name, hasVideo: false, muted: false, speaking: false, track: null, ...patch });
    } else {
        tiles.splice(index, 1, { ...tiles[index], name: name || tiles[index].name, ...patch });
    }
};

const join = async () => {
    error.value = '';
    connected.value = false;
    try {
        const [{ Room, RoomEvent, Track }, grant] = await Promise.all([
            import('livekit-client'),
            $fetch('/api/livekit/token', { method: 'POST', body: { room: props.room } })
        ]);
        livekitRoom = new Room({ adaptiveStream: true, dynacast: true });

        livekitRoom
            .on(RoomEvent.ParticipantConnected, participant => syncTile(participant.identity, participant.name))
            .on(RoomEvent.ParticipantDisconnected, participant => {
                const index = tiles.findIndex(entry => entry.identity === participant.identity);
                if (index >= 0) tiles.splice(index, 1);
            })
            .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                if (track.kind === Track.Kind.Video) {
                    syncTile(participant.identity, participant.name, { hasVideo: true, track });
                    attachPending(participant.identity);
                }
            })
            .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                if (track.kind === Track.Kind.Video) {
                    syncTile(participant.identity, participant.name, { hasVideo: false, track: null });
                }
            })
            .on(RoomEvent.TrackMuted, (publication, participant) => {
                if (publication.kind === Track.Kind.Audio) syncTile(participant.identity, participant.name, { muted: true });
            })
            .on(RoomEvent.TrackUnmuted, (publication, participant) => {
                if (publication.kind === Track.Kind.Audio) syncTile(participant.identity, participant.name, { muted: false });
            })
            .on(RoomEvent.ActiveSpeakersChanged, speakers => {
                const speaking = new Set(speakers.map(speaker => speaker.identity));
                for (const tile of tiles) {
                    const index = tiles.indexOf(tile);
                    tiles.splice(index, 1, { ...tile, speaking: speaking.has(tile.identity) });
                }
            })
            .on(RoomEvent.Disconnected, () => {
                connected.value = false;
                tiles.splice(0, tiles.length);
            });

        await livekitRoom.connect(grant.url, grant.token);
        syncTile(livekitRoom.localParticipant.identity, livekitRoom.localParticipant.name, { muted: true });
        for (const participant of livekitRoom.remoteParticipants.values()) {
            syncTile(participant.identity, participant.name);
        }

        const mic = await livekitRoom.localParticipant.setMicrophoneEnabled(true);
        micEnabled.value = Boolean(mic);
        cameraEnabled.value = false;
        connected.value = true;
    } catch (joinError) {
        console.error('Failed to join call:', joinError);
        const insecureContext = typeof navigator !== 'undefined' && !navigator.mediaDevices;
        error.value = insecureContext
            ? t('call.insecureContext')
            : joinError?.data?.message || joinError?.message || t('call.failed');
    }
};

const toggleMic = async () => {
    if (!livekitRoom) return;
    micEnabled.value = await livekitRoom.localParticipant.setMicrophoneEnabled(!micEnabled.value);
};

const toggleCamera = async () => {
    if (!livekitRoom) return;
    cameraEnabled.value = await livekitRoom.localParticipant.setCameraEnabled(!cameraEnabled.value);
    const identity = livekitRoom.localParticipant.identity;
    const publication = livekitRoom.localParticipant.getTrackPublication('video');
    const track = publication?.track || null;
    syncTile(identity, livekitRoom.localParticipant.name, { hasVideo: Boolean(track), track });
    attachPending(identity);
};

const leave = async () => {
    await livekitRoom?.disconnect();
    livekitRoom = null;
    connected.value = false;
    tiles.splice(0, tiles.length);
    emit('closed');
};

join();
onBeforeUnmount(() => {
    livekitRoom?.disconnect().catch(() => {});
    livekitRoom = null;
});
</script>
