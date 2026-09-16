<template>
    <div class="call-panel relative flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
        <ActionToolbar :subtitle="statusText" :level="2">
            <template #actions>
                <SelectButton
                    :model-value="layout"
                    :options="layoutOptions"
                    option-value="value"
                    option-label="label"
                    size="small"
                    :allow-empty="false"
                    :aria-label="$t('call.layout')"
                    @update:model-value="value => layout = value"
                />
                <Button
                    icon="pi pi-cog"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('call.settings')"
                    @click="settingsVisible = true"
                />
                <Button
                    :icon="handRaised ? 'pi pi-thumbs-up-fill text-status-warning' : 'pi pi-thumbs-up'"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('call.hand')"
                    :disabled="!connected"
                    @click="toggleHand"
                />
                <Button
                    :icon="sharing ? 'pi pi-stop-circle text-status-danger' : 'pi pi-desktop'"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="sharing ? $t('call.shareStop') : $t('call.share')"
                    :disabled="!connected"
                    @click="toggleShare"
                />
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

        <StateBlock v-if="stage === 'failed'" state="error" :message="error">
            <template #action>
                <Button :label="$t('call.retry')" severity="secondary" size="small" @click="stage = 'prejoin'" />
            </template>
        </StateBlock>
        <CallPrejoin
            v-else-if="stage === 'prejoin'"
            :room="room"
            :joining="stage === 'connecting'"
            @join="join"
        />
        <StateBlock v-else-if="stage === 'connecting'" state="loading" :message="$t('call.connecting')" />

        <template v-else>
            <div v-if="reconnecting" class="absolute inset-x-0 top-0 z-10 flex justify-center p-2">
                <span class="rounded-ui bg-content px-3 py-1 text-supporting">{{ $t('call.reconnecting') }}</span>
            </div>

            <div v-if="layout === 'speaker'" class="call-stage flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <!-- Spotlight: screen shares keep their source proportions
                     (CallTile hugs the live video aspect, capped by the stage
                     box); cameras fill the stage. -->
                <div class="flex min-h-0 flex-1 items-center justify-center">
                    <CallTile
                        v-if="spotlightTile"
                        :key="`spotlight-${spotlightTile.identity}-${spotlightTile.isScreen}`"
                        :tile="spotlightTile"
                        spotlight
                        @toggle-pin="togglePin"
                        @video="el => attachTile(spotlightTile, el)"
                        @aspect="ratio => patchTileAspect(spotlightTile, ratio)"
                    />
                </div>
                <div class="call-strip flex shrink-0 gap-3 overflow-x-auto pb-1">
                    <CallTile
                        v-for="tile in stripTiles"
                        :key="`strip-${tile.identity}-${tile.isScreen}`"
                        :tile="tile"
                        class="call-strip-tile w-40 shrink-0"
                        @toggle-pin="togglePin"
                        @video="el => attachTile(tile, el)"
                        @aspect="ratio => patchTileAspect(tile, ratio)"
                    />
                </div>
            </div>
            <div v-else class="call-grid grid min-h-0 flex-1 auto-rows-min content-start gap-3 overflow-y-auto">
                <CallTile
                    v-for="tile in tiles"
                    :key="`grid-${tile.identity}-${tile.isScreen}`"
                    :tile="tile"
                    @toggle-pin="togglePin"
                    @video="el => attachTile(tile, el)"
                    @aspect="ratio => patchTileAspect(tile, ratio)"
                />
            </div>

            <div class="pointer-events-none absolute inset-0 overflow-hidden">
                <span
                    v-for="reaction in reactions"
                    :key="reaction.id"
                    :ref="el => registerReactionEl(reaction.id, el)"
                    class="absolute bottom-6 text-metric"
                    :style="{ left: `${reaction.left}%` }"
                    :aria-label="reaction.emoji"
                >{{ reaction.emoji }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-1">
                <Button
                    v-for="emoji in REACTION_EMOJIS"
                    :key="emoji"
                    :label="emoji"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('call.react', { emoji })"
                    @click="sendReaction(emoji)"
                />
            </div>

            <!-- Remote audio sink: subscribed mic and screen-share audio
                 tracks play through LiveKit-attached elements kept off the
                 visible layout. -->
            <div ref="audioSink" class="hidden"></div>
        </template>

        <StandardDialog
            v-model:visible="settingsVisible"
            :header="$t('call.settings')"
            size="sm"
            :show-default-footer="false"
        >
            <div class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ $t('call.devices.microphone') }}</span>
                    <Select v-model="deviceId.audioinput" :options="audioInputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('audioinput', value)" />
                </label>
                <label class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ $t('call.devices.camera') }}</span>
                    <Select v-model="deviceId.videoinput" :options="videoInputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('videoinput', value)" />
                </label>
                <label class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ $t('call.devices.speaker') }}</span>
                    <Select v-model="deviceId.audiooutput" :options="audioOutputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('audiooutput', value)" />
                </label>
            </div>
        </StandardDialog>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import CallPrejoin from '~/components/calls/CallPrejoin.vue';
import CallTile from '~/components/calls/CallTile.vue';
import { riseAndFade } from '~/composables/useMotion.js';
import { useCallsStore } from '~/stores/calls';

const props = defineProps({
    room: { type: String, required: true }
});
const emit = defineEmits(['closed']);
const { t } = useI18n();
const callsStore = useCallsStore();

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '👏'];
const CALL_DATA_TOPIC = 'call.events';

const stage = ref('prejoin');
const error = ref('');
const reconnecting = ref(false);
const connected = ref(false);
const micEnabled = ref(false);
const cameraEnabled = ref(false);
const sharing = ref(false);
const handRaised = ref(false);
const layout = ref('speaker');
const settingsVisible = ref(false);
const pinnedIdentities = reactive(new Set());
const tiles = reactive([]);
const reactions = reactive([]);
const deviceId = ref({ audioinput: '', videoinput: '', videooutput: '' });
const audioInputs = ref([]);
const videoInputs = ref([]);
const audioOutputs = ref([]);
const audioSink = ref(null);

let livekitRoom = null;
let LiveKit = null;
const tileVideos = new Map();
const attachedAudio = new Map();
const reactionEls = new Map();

const layoutOptions = computed(() => [
    { value: 'speaker', label: t('call.layoutSpeaker') },
    { value: 'grid', label: t('call.layoutGrid') }
]);

const statusText = computed(() => {
    if (stage.value === 'failed') return t('call.failed');
    if (stage.value !== 'connected' && !connected.value) return t('call.connecting');
    return t('call.participants', { count: new Set(tiles.map(tile => tile.identity)).size });
});

const tileKey = (identity, isScreen) => `${identity}:${isScreen ? 'screen' : 'camera'}`;

// Tiles are mutated in place: replacing tile objects on every audio-level
// tick re-rendered every tile and made the video surfaces flicker.
const syncTile = (identity, name = '', patch = {}) => {
    const key = tileKey(identity, patch.isScreen);
    const index = tiles.findIndex(entry => tileKey(entry.identity, entry.isScreen) === key);
    if (index < 0) {
        tiles.push({
            identity,
            name,
            isScreen: false,
            hasVideo: false,
            muted: false,
            speaking: false,
            audioLevel: 0,
            handRaised: false,
            quality: 'unknown',
            pinned: false,
            aspect: 0,
            track: null,
            ...patch
        });
    } else {
        const tile = tiles[index];
        if (name) tile.name = name;
        for (const [field, value] of Object.entries(patch)) {
            if (value !== undefined) tile[field] = value;
        }
    }
    syncPins();
};

const patchTileAspect = (tile, ratio) => {
    if (!tile || !Number.isFinite(ratio) || ratio <= 0) return;
    if (Math.abs((tile.aspect || 0) - ratio) > 0.01) tile.aspect = ratio;
};

const dropTile = (identity, isScreen) => {
    const key = tileKey(identity, isScreen);
    const index = tiles.findIndex(entry => tileKey(entry.identity, entry.isScreen) === key);
    if (index >= 0) tiles.splice(index, 1);
    tileVideos.delete(key);
};

const syncPins = () => {
    for (const tile of tiles) {
        tile.pinned = pinnedIdentities.has(tileKey(tile.identity, tile.isScreen));
    }
};

// Attaching is idempotent: resetting srcObject on an element that already
// plays the track restarts the stream and flashes the tile.
const attachTile = (tile, el) => {
    const key = tileKey(tile.identity, tile.isScreen);
    if (!el) {
        tileVideos.delete(key);
        return;
    }
    tileVideos.set(key, el);
    const track = tile.track?.mediaStreamTrack || null;
    if (!track) return;
    if (el.srcObject?.getTracks?.().includes(track)) {
        el.play().catch(() => {});
        return;
    }
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
};

const playInto = (key) => {
    const el = tileVideos.get(key);
    const tile = tiles.find(entry => tileKey(entry.identity, entry.isScreen) === key);
    if (el && tile?.track) {
        const track = tile.track.mediaStreamTrack;
        if (el.srcObject?.getTracks?.().includes(track)) {
            el.play().catch(() => {});
            return;
        }
        el.srcObject = new MediaStream([track]);
        el.play().catch(() => {});
    }
};

// Remote audio: LiveKit attaches the track to its own element, which the
// panel keeps in a hidden sink container. Attached elements register with
// the room, so speaker switching keeps working.
const attachRemoteAudio = (track) => {
    if (!track || attachedAudio.has(track)) return;
    let element = null;
    try {
        element = track.attach();
    } catch {
        return;
    }
    attachedAudio.set(track, element);
    audioSink.value?.appendChild(element);
    element.play?.().catch(() => {});
};

const detachRemoteAudio = (track) => {
    if (!track || !attachedAudio.has(track)) return;
    attachedAudio.delete(track);
    try {
        for (const element of track.detach()) element.remove();
    } catch {
        /* element may already be gone with the track */
    }
};

const screenTile = computed(() => tiles.find(tile => tile.isScreen) || null);
const topSpeakerTile = computed(() => [...tiles]
    .filter(tile => !tile.isScreen)
    .sort((a, b) => (b.audioLevel || 0) - (a.audioLevel || 0))[0] || null);
const pinnedTile = computed(() => [...tiles].filter(tile => tile.pinned).sort((a, b) => Number(b.isScreen) - Number(a.isScreen))[0] || null);

// Speaker spotlight sticks: raw audio-level ticks would bounce the spotlight
// between participants (and remount their video elements) many times per
// sentence. A new top speaker must hold the lead for a moment before the
// spotlight follows.
const sustainedSpeakerKey = ref('');
let speakerCandidateKey = '';
let speakerCandidateSince = 0;
const SPEAKER_HOLD_MS = 1200;

const syncSustainedSpeaker = () => {
    const top = topSpeakerTile.value;
    const topKey = top && !top.isScreen ? tileKey(top.identity, false) : '';
    if (!topKey || (top.audioLevel || 0) <= 0) return;
    if (topKey === sustainedSpeakerKey.value) {
        speakerCandidateKey = '';
        return;
    }
    const now = Date.now();
    if (topKey !== speakerCandidateKey) {
        speakerCandidateKey = topKey;
        speakerCandidateSince = now;
        return;
    }
    if (now - speakerCandidateSince >= SPEAKER_HOLD_MS) {
        sustainedSpeakerKey.value = topKey;
        speakerCandidateKey = '';
    }
};

const sustainedSpeakerTile = computed(() => {
    if (!sustainedSpeakerKey.value) return null;
    const tile = tiles.find(entry => !entry.isScreen && tileKey(entry.identity, false) === sustainedSpeakerKey.value);
    return tile || null;
});

const spotlightTile = computed(() => pinnedTile.value
    || screenTile.value
    || sustainedSpeakerTile.value
    || tiles[0]
    || null);
const stripTiles = computed(() => tiles.filter(tile => tile !== spotlightTile.value));

// A surface transfer (tab → floating window) parks the connected room in
// the calls store; the adopting panel takes the live connection over
// instead of reconnecting. Until adoption completes, the floating panel
// shows the connecting stage. The adoption watcher is registered after
// bindRoomEvents is defined (see below) so the immediate run cannot hit a
// temporal dead zone.
const adoptLiveRoom = () => {
    const entry = callsStore.takeLiveRoom(props.room);
    if (!entry) return false;
    ({ room: livekitRoom, LiveKit } = entry);
    bindRoomEvents(livekitRoom);
    const local = livekitRoom.localParticipant;
    micEnabled.value = local.isMicrophoneEnabled();
    cameraEnabled.value = local.isCameraEnabled();
    sharing.value = local.isScreenShareEnabled();
    syncTile(local.identity, local.name, { muted: !micEnabled.value });
    for (const participant of livekitRoom.remoteParticipants.values()) {
        syncTile(participant.identity, participant.name);
        for (const publication of participant.trackPublications) {
            const track = publication.track;
            if (!track || !publication.isSubscribed) continue;
            if (publication.kind === LiveKit.Track.Kind.Video) {
                const isScreen = publication.source === LiveKit.Track.Source.ScreenShare;
                syncTile(participant.identity, participant.name, { isScreen, hasVideo: true, track });
            } else if (!participant.isLocal) {
                attachRemoteAudio(track);
            }
        }
    }
    connected.value = true;
    stage.value = 'connected';
    callsStore.joinRoom(props.room);
    return true;
};

// Room event wiring is a standalone binder so both the fresh join and the
// parked-room adoption get identical behavior.
const bindRoomEvents = (room) => {
    room
        .on(LiveKit.RoomEvent.ParticipantConnected, participant => {
            syncTile(participant.identity, participant.name);
        })
        .on(LiveKit.RoomEvent.ParticipantDisconnected, participant => {
            dropTile(participant.identity, false);
            dropTile(participant.identity, true);
        })
        .on(LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LiveKit.Track.Kind.Video) {
                const isScreen = track.source === LiveKit.Track.Source.ScreenShare;
                syncTile(participant.identity, participant.name, { isScreen, hasVideo: true, track });
                playInto(tileKey(participant.identity, isScreen));
                return;
            }
            if (track.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                attachRemoteAudio(track);
            }
        })
        .on(LiveKit.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            if (track.kind === LiveKit.Track.Kind.Video) {
                const isScreen = track.source === LiveKit.Track.Source.ScreenShare;
                syncTile(participant.identity, participant.name, { isScreen, hasVideo: false, track: null });
                return;
            }
            if (track.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                detachRemoteAudio(track);
            }
        })
        .on(LiveKit.RoomEvent.LocalTrackPublished, (publication, participant) => {
            if (publication.kind === LiveKit.Track.Kind.Video) {
                const isScreen = publication.source === LiveKit.Track.Source.ScreenShare;
                syncTile(participant.identity, participant.name, { isScreen, hasVideo: true, track: publication.track });
                playInto(tileKey(participant.identity, isScreen));
            }
        })
        .on(LiveKit.RoomEvent.LocalTrackUnpublished, (publication, participant) => {
            if (publication.kind === LiveKit.Track.Kind.Video) {
                const isScreen = publication.source === LiveKit.Track.Source.ScreenShare;
                dropTile(participant.identity, isScreen);
                if (isScreen) sharing.value = false;
            }
        })
        .on(LiveKit.RoomEvent.TrackMuted, (publication, participant) => {
            if (publication.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                syncTile(participant.identity, participant.name, { muted: true });
            }
        })
        .on(LiveKit.RoomEvent.TrackUnmuted, (publication, participant) => {
            if (publication.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                syncTile(participant.identity, participant.name, { muted: false });
            }
        })
        .on(LiveKit.RoomEvent.ActiveSpeakersChanged, speakers => {
            const levels = new Map(speakers.map(speaker => [speaker.identity, speaker.audioLevel || 0.6]));
            for (const tile of tiles) {
                tile.speaking = levels.has(tile.identity);
                tile.audioLevel = levels.get(tile.identity) || 0;
            }
            syncSustainedSpeaker();
        })
        .on(LiveKit.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            syncTile(participant.identity, participant.name, { quality });
        })
        .on(LiveKit.RoomEvent.Reconnecting, () => { reconnecting.value = true; })
        .on(LiveKit.RoomEvent.Reconnected, () => { reconnecting.value = false; })
        .on(LiveKit.RoomEvent.Disconnected, () => {
            connected.value = false;
            reconnecting.value = false;
            teardownMedia();
        })
        .on(LiveKit.RoomEvent.DataReceived, (payload, participant) => {
            receiveCallEvent(participant.identity, participant.name, payload);
        });
};

const join = async (prejoin = {}) => {
    stage.value = 'connecting';
    error.value = '';
    try {
        if (!LiveKit) LiveKit = await import('livekit-client');
        const grant = await $fetch('/api/livekit/token', { method: 'POST', body: { room: props.room } });
        livekitRoom = new LiveKit.Room({ adaptiveStream: true, dynacast: true });
        bindRoomEvents(livekitRoom);

        await livekitRoom.connect(grant.url, grant.token);
        const local = livekitRoom.localParticipant;
        micEnabled.value = await local.setMicrophoneEnabled(prejoin.micEnabled !== false, {
            deviceId: prejoin.deviceId?.audioinput || undefined
        });
        cameraEnabled.value = await local.setCameraEnabled(Boolean(prejoin.cameraEnabled), {
            deviceId: prejoin.deviceId?.videoinput || undefined
        });
        syncTile(local.identity, local.name, { muted: !micEnabled.value });
        for (const participant of livekitRoom.remoteParticipants.values()) {
            syncTile(participant.identity, participant.name);
        }
        connected.value = true;
        stage.value = 'connected';
        // Report the live connection to the call line machine: joining stops
        // every remaining ring for this room in every surface.
        callsStore.joinRoom(props.room);
    } catch (joinError) {
        console.error('Failed to join call:', joinError);
        const insecureContext = typeof navigator !== 'undefined' && !navigator.mediaDevices;
        error.value = insecureContext
            ? t('call.insecureContext')
            : joinError?.data?.message || joinError?.message || t('call.failed');
        stage.value = 'failed';
    }
};

// Registered after bindRoomEvents: the immediate run adopts an
// already-parked room (a pop-out transfer) without hitting setup TDZ.
watch(() => callsStore.parkedRoom, name => {
    if (name === props.room && stage.value !== 'connected') adoptLiveRoom();
}, { immediate: true });

onMounted(() => {
    // Transferred calls wait briefly for the parked room; show the
    // connecting state instead of the pre-join screen while the handoff
    // completes.
    if (callsStore.transferRoom === props.room && !callsStore.parkedRoom) {
        stage.value = 'connecting';
    }
});

const enumerateDevices = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs.value = devices.filter(device => device.kind === 'audioinput');
        videoInputs.value = devices.filter(device => device.kind === 'videoinput');
        audioOutputs.value = devices.filter(device => device.kind === 'audiooutput');
    } catch {
        audioInputs.value = [];
        videoInputs.value = [];
        audioOutputs.value = [];
    }
};

const switchDevice = async (kind, id) => {
    if (!id || !livekitRoom) return;
    try {
        if (kind === 'audiooutput') {
            await livekitRoom.switchActiveDevice('audiooutput', id);
        } else {
            await livekitRoom.localParticipant.switchActiveDevice(kind, id);
        }
    } catch (switchError) {
        console.error(`Failed to switch ${kind}:`, switchError);
    }
};

const toggleMic = async () => {
    if (!livekitRoom) return;
    micEnabled.value = await livekitRoom.localParticipant.setMicrophoneEnabled(!micEnabled.value);
    const local = livekitRoom.localParticipant;
    syncTile(local.identity, local.name, { muted: !micEnabled.value });
};

const toggleCamera = async () => {
    if (!livekitRoom) return;
    cameraEnabled.value = await livekitRoom.localParticipant.setCameraEnabled(!cameraEnabled.value);
    const local = livekitRoom.localParticipant;
    const publication = local.getTrackPublication(LiveKit.Track.Source.Camera);
    syncTile(local.identity, local.name, { hasVideo: Boolean(publication?.track), track: publication?.track || null });
    playInto(tileKey(local.identity, false));
};

const toggleShare = async () => {
    if (!livekitRoom) return;
    try {
        sharing.value = await livekitRoom.localParticipant.setScreenShareEnabled(!sharing.value);
    } catch (shareError) {
        console.error('Failed to toggle screen share:', shareError);
        sharing.value = false;
    }
};

const togglePin = (identity) => {
    const tile = tiles.find(entry => entry.identity === identity && !entry.isScreen);
    if (!tile) return;
    const key = tileKey(tile.identity, false);
    if (pinnedIdentities.has(key)) pinnedIdentities.delete(key);
    else pinnedIdentities.add(key);
    syncPins();
};

const publishCallEvent = (payload) => {
    if (!livekitRoom) return;
    livekitRoom.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(payload)),
        { reliable: true, topic: CALL_DATA_TOPIC }
    ).catch(() => {});
};

const toggleHand = () => {
    handRaised.value = !handRaised.value;
    publishCallEvent({ type: 'hand', raised: handRaised.value });
    const local = livekitRoom?.localParticipant;
    if (local) syncTile(local.identity, local.name, { handRaised: handRaised.value });
};

const receiveCallEvent = (identity, name, payload) => {
    let event;
    try {
        event = JSON.parse(new TextDecoder().decode(payload));
    } catch {
        return;
    }
    if (event?.type === 'hand') {
        syncTile(identity, name, { handRaised: Boolean(event.raised) });
    } else if (event?.type === 'reaction' && event.emoji) {
        showReaction(event.emoji, name || identity);
    }
};

const sendReaction = (emoji) => {
    publishCallEvent({ type: 'reaction', emoji });
    showReaction(emoji, livekitRoom?.localParticipant?.name || '');
};

const showReaction = (emoji, name) => {
    const reaction = {
        id: `reaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        emoji,
        name,
        left: 10 + Math.random() * 75
    };
    reactions.push(reaction);
    setTimeout(async () => {
        const el = reactionEls.get(reaction.id);
        if (el) await riseAndFade(el);
        const index = reactions.indexOf(reaction);
        if (index >= 0) reactions.splice(index, 1);
        reactionEls.delete(reaction.id);
    }, 50);
};

const registerReactionEl = (id, el) => {
    if (el) reactionEls.set(id, el);
};

const teardownMedia = () => {
    for (const track of [...attachedAudio.keys()]) detachRemoteAudio(track);
    attachedAudio.clear();
    tileVideos.clear();
    sustainedSpeakerKey.value = '';
    speakerCandidateKey = '';
    tiles.splice(0, tiles.length);
    callsStore.leaveRoom(props.room);
};

const leave = async () => {
    await livekitRoom?.disconnect();
    livekitRoom = null;
    connected.value = false;
    teardownMedia();
    emit('closed');
};

onBeforeUnmount(() => {
    // Surface transfer (pop-out or dock): another surface is taking this
    // call, so park the live connection instead of dropping it. Every other
    // unmount leaves the call.
    if (connected.value && callsStore.transferRoom === props.room && livekitRoom) {
        try {
            livekitRoom.removeAllListeners();
        } catch {
            /* listener cleanup is best-effort */
        }
        callsStore.parkLiveRoom(props.room, livekitRoom, LiveKit);
        livekitRoom = null;
        teardownMedia();
        return;
    }
    livekitRoom?.disconnect().catch(() => {});
    livekitRoom = null;
    teardownMedia();
});
</script>

<style scoped>
/*
 * Container-driven layout: the speaker/grid stage responds to the panel's
 * own width, not the viewport, so calls lay out correctly inside arbitrary
 * workspace panes — narrow containers stack the strip, wide containers get
 * the side strip. The grid is a self-fitting masonry: tiles never shrink
 * below 14rem and columns fill the available width, so participant count and
 * pane size choose the column count together.
 */
.call-panel {
  container-type: inline-size;
}

.call-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
}

@container (min-width: 40rem) {
  .call-panel .call-stage {
    flex-direction: row;
  }

  .call-panel .call-strip {
    flex-direction: column;
    overflow: visible auto;
    width: 16rem;
  }

  .call-panel .call-strip-tile {
    width: 100%;
  }
}
</style>
