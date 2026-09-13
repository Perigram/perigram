<template>
    <div class="relative flex h-full min-h-0 flex-col gap-3">
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

            <div v-if="layout === 'speaker'" class="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
                <div class="flex min-h-0 flex-1 items-stretch">
                    <CallTile
                        v-if="spotlightTile"
                        :key="`spotlight-${spotlightTile.identity}-${spotlightTile.isScreen}`"
                        :tile="spotlightTile"
                        spotlight
                        @toggle-pin="togglePin"
                        @video="el => attachTile(spotlightTile, el)"
                    />
                </div>
                <div class="flex shrink-0 gap-3 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:pb-0 md:w-64">
                    <CallTile
                        v-for="tile in stripTiles"
                        :key="`strip-${tile.identity}-${tile.isScreen}`"
                        :tile="tile"
                        class="w-40 shrink-0 md:w-full"
                        @toggle-pin="togglePin"
                        @video="el => attachTile(tile, el)"
                    />
                </div>
            </div>
            <div v-else class="grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto md:grid-cols-2">
                <CallTile
                    v-for="tile in tiles"
                    :key="`grid-${tile.identity}-${tile.isScreen}`"
                    :tile="tile"
                    @toggle-pin="togglePin"
                    @video="el => attachTile(tile, el)"
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
        </template>

        <StandardDialog
            v-model:visible="settingsVisible"
            :header="$t('call.settings')"
            size="sm"
            :show-default-footer="false"
        >
            <div class="flex flex-col gap-3">
                <label class="flex flex-col gap-1">
                    <span class="text-muted-color text-supporting">{{ $t('call.devices.microphone') }}</span>
                    <Select v-model="deviceId.audioinput" :options="audioInputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('audioinput', value)" />
                </label>
                <label class="flex flex-col gap-1">
                    <span class="text-muted-color text-supporting">{{ $t('call.devices.camera') }}</span>
                    <Select v-model="deviceId.videoinput" :options="videoInputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('videoinput', value)" />
                </label>
                <label class="flex flex-col gap-1">
                    <span class="text-muted-color text-supporting">{{ $t('call.devices.speaker') }}</span>
                    <Select v-model="deviceId.audiooutput" :options="audioOutputs" option-label="label" option-value="deviceId" size="small" class="w-full" @update:model-value="value => switchDevice('audiooutput', value)" />
                </label>
            </div>
        </StandardDialog>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import CallPrejoin from '~/components/calls/CallPrejoin.vue';
import CallTile from '~/components/calls/CallTile.vue';
import { riseAndFade } from '~/composables/useMotion.js';

const props = defineProps({
    room: { type: String, required: true }
});
const emit = defineEmits(['closed']);
const { t } = useI18n();

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
const deviceId = ref({ audioinput: '', videoinput: '', audiooutput: '' });
const audioInputs = ref([]);
const videoInputs = ref([]);
const audioOutputs = ref([]);

let livekitRoom = null;
let LiveKit = null;
const tileVideos = new Map();
const tileKeys = new Map();
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

const syncTile = (identity, name = '', patch = {}) => {
    const key = tileKey(identity, patch.isScreen);
    const index = tiles.findIndex(entry => tileKey(entry.identity, entry.isScreen) === key);
    const base = {
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
        track: null,
        ...patch
    };
    if (index < 0) {
        tiles.push(base);
    } else {
        tiles.splice(index, 1, { ...tiles[index], name: name || tiles[index].name, ...patch });
    }
    tileKeys.set(key, true);
    syncPins();
};

const dropTile = (identity, isScreen) => {
    const key = tileKey(identity, isScreen);
    const index = tiles.findIndex(entry => tileKey(entry.identity, entry.isScreen) === key);
    if (index >= 0) tiles.splice(index, 1);
    tileKeys.delete(key);
};

const syncPins = () => {
    for (const tile of tiles) {
        tile.pinned = pinnedIdentities.has(tileKey(tile.identity, tile.isScreen));
    }
};

const attachTile = (tile, el) => {
    const key = tileKey(tile.identity, tile.isScreen);
    if (!el) {
        tileVideos.delete(key);
        return;
    }
    tileVideos.set(key, el);
    if (tile.track) {
        el.srcObject = new MediaStream([tile.track.mediaStreamTrack]);
        el.play().catch(() => {});
    }
};

const playInto = (key) => {
    const el = tileVideos.get(key);
    const tile = tiles.find(entry => tileKey(entry.identity, entry.isScreen) === key);
    if (el && tile?.track) {
        el.srcObject = new MediaStream([tile.track.mediaStreamTrack]);
        el.play().catch(() => {});
    }
};

const screenTile = computed(() => tiles.find(tile => tile.isScreen) || null);
const speakingTile = computed(() => [...tiles]
    .filter(tile => !tile.isScreen)
    .sort((a, b) => (b.audioLevel || 0) - (a.audioLevel || 0))[0] || null);
const pinnedTile = computed(() => [...tiles].filter(tile => tile.pinned).sort((a, b) => Number(b.isScreen) - Number(a.isScreen))[0] || null);
const spotlightTile = computed(() => pinnedTile.value || screenTile.value || speakingTile.value || tiles[0] || null);
const stripTiles = computed(() => tiles.filter(tile => tile !== spotlightTile.value));

const join = async (prejoin = {}) => {
    stage.value = 'connecting';
    error.value = '';
    try {
        if (!LiveKit) LiveKit = await import('livekit-client');
        const grant = await $fetch('/api/livekit/token', { method: 'POST', body: { room: props.room } });
        livekitRoom = new LiveKit.Room({ adaptiveStream: true, dynacast: true });

        livekitRoom
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
                }
            })
            .on(LiveKit.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                if (track.kind === LiveKit.Track.Kind.Video) {
                    const isScreen = track.source === LiveKit.Track.Source.ScreenShare;
                    syncTile(participant.identity, participant.name, { isScreen, hasVideo: false, track: null });
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
                for (const tile of [...tiles]) {
                    syncTile(tile.identity, tile.name, {
                        speaking: levels.has(tile.identity),
                        audioLevel: levels.get(tile.identity) || 0
                    });
                }
            })
            .on(LiveKit.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
                syncTile(participant.identity, participant.name, { quality });
            })
            .on(LiveKit.RoomEvent.Reconnecting, () => { reconnecting.value = true; })
            .on(LiveKit.RoomEvent.Reconnected, () => { reconnecting.value = false; })
            .on(LiveKit.RoomEvent.Disconnected, () => {
                connected.value = false;
                reconnecting.value = false;
                tiles.splice(0, tiles.length);
            })
            .on(LiveKit.RoomEvent.DataReceived, (payload, participant) => {
                receiveCallEvent(participant.identity, participant.name, payload);
            });

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
    } catch (joinError) {
        console.error('Failed to join call:', joinError);
        const insecureContext = typeof navigator !== 'undefined' && !navigator.mediaDevices;
        error.value = insecureContext
            ? t('call.insecureContext')
            : joinError?.data?.message || joinError?.message || t('call.failed');
        stage.value = 'failed';
    }
};

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

const leave = async () => {
    await livekitRoom?.disconnect();
    livekitRoom = null;
    connected.value = false;
    tiles.splice(0, tiles.length);
    emit('closed');
};

onBeforeUnmount(() => {
    livekitRoom?.disconnect().catch(() => {});
    livekitRoom = null;
});
</script>
