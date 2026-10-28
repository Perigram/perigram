<template>
    <!-- Bounded videocall surface — a view over the shared room session
         (stores/calls.js): the video stage owns every pixel, only the grid
         and the film strip scroll inside their own boxes, and the controls
         float as one pill overlay at the bottom. -->
    <div class="call-panel relative h-full min-h-0 overflow-hidden">
        <StateBlock v-if="failed" state="error" :message="failureMessage">
            <template #action>
                <Button :label="$t('call.retry')" severity="secondary" size="small" @click="retry" />
            </template>
        </StateBlock>
        <CallPrejoin
            v-else-if="stage === 'prejoin'"
            @join="join"
        />
        <StateBlock v-else-if="stage === 'connecting'" state="loading" :message="$t('call.connecting')" />

        <template v-else>
            <div class="absolute inset-0 flex min-h-0 min-w-0 flex-col p-3">
                <div v-if="layout === 'speaker'" class="call-stage flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
                    <!-- Official focus semantics: pin > screen share >
                         active speaker > first tile. Screen shares hug their
                         live source proportions; cameras fill the stage. -->
                    <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
                        <CallTile
                            v-if="focusTile"
                            :key="`focus-${focusTile.identity}-${focusTile.source}`"
                            :tile="focusTile"
                            :mirrored="focusTile.isLocal"
                            spotlight
                            @toggle-pin="callsStore.togglePin"
                            @aspect="ratio => patchAspect(focusTile, ratio)"
                        />
                    </div>
                    <div class="call-strip flex shrink-0 gap-3 overflow-x-auto pb-24">
                        <CallTile
                            v-for="tile in stripTiles"
                            :key="`strip-${tile.identity}-${tile.source}`"
                            :tile="tile"
                            :mirrored="tile.isLocal"
                            class="call-strip-tile w-40 shrink-0"
                            @toggle-pin="callsStore.togglePin"
                            @aspect="ratio => patchAspect(tile, ratio)"
                        />
                    </div>
                </div>
                <div v-else class="call-grid grid min-h-0 flex-1 auto-rows-min content-start gap-3 overflow-y-auto pb-24">
                    <CallTile
                        v-for="tile in tiles"
                        :key="`grid-${tile.identity}-${tile.source}`"
                        :tile="tile"
                        :mirrored="tile.isLocal"
                        @toggle-pin="callsStore.togglePin"
                        @aspect="ratio => patchAspect(tile, ratio)"
                    />
                </div>

                <!-- One status pill for transient call state: reconnecting
                     text, or a pulsing red record dot while egress runs. -->
                <div v-if="reconnecting || recording" class="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                    <span class="flex items-center gap-1.5 rounded-ui bg-content px-3 py-1 text-supporting shadow-overlay">
                        <i
                            v-if="recording"
                            class="pi pi-circle-fill animate-pulse text-status-danger"
                            aria-hidden="true"
                        ></i>
                        {{ reconnecting ? $t('call.reconnecting') : $t('call.recording') }}
                    </span>
                </div>

                <div class="pointer-events-none absolute inset-0 overflow-hidden">
                    <span
                        v-for="reaction in reactions"
                        :key="reaction.id"
                        :ref="el => registerReactionEl(reaction.id, el)"
                        class="absolute bottom-28 text-metric"
                        :style="{ left: `${reaction.left}%` }"
                        :aria-label="reaction.emoji"
                    >{{ reaction.emoji }}</span>
                </div>
            </div>

            <!-- Control pill: one floating overlay at the bottom center —
                 a bg-content chip over media with shadow, icon-only
                 buttons, the layout toggle as one icon, settings and
                 reactions as anchored popovers, and leave separated at
                 the right edge. It wraps to a second row on narrow
                 panes; every control stays reachable at any width. -->
            <div class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
                <div class="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-content p-1.5 shadow-overlay">
                    <Button
                        :icon="micEnabled ? 'pi pi-microphone' : 'pi pi-microphone-slash'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="$t('call.toggleMic')"
                        :disabled="!isConnected"
                        @click="toggleMic"
                    />
                    <Button
                        :icon="camEnabled ? 'pi pi-video' : 'pi pi-video-off'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="$t('call.toggleCamera')"
                        :disabled="!isConnected"
                        @click="toggleCamera"
                    />
                    <Button
                        :icon="sharing ? 'pi pi-stop-circle text-status-danger' : 'pi pi-desktop'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="sharing ? $t('call.shareStop') : $t('call.share')"
                        :disabled="!isConnected"
                        @click="callsStore.toggleShare()"
                    />
                    <Button
                        v-if="canRecord"
                        :icon="recording ? 'pi pi-circle-fill text-status-danger' : 'pi pi-circle'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="recording ? $t('call.recordStop') : $t('call.record')"
                        :disabled="!isConnected || recordPending"
                        @click="toggleRecording"
                    />
                    <Button
                        :icon="handRaised ? 'pi pi-thumbs-up-fill text-status-warning' : 'pi pi-thumbs-up'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="$t('call.hand')"
                        :disabled="!isConnected"
                        @click="callsStore.toggleHand()"
                    />
                    <Button
                        icon="pi pi-face-smile"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="$t('call.reactions')"
                        :disabled="!isConnected"
                        @click="event => reactionPicker?.toggle(event)"
                    />
                    <Button
                        :icon="layout === 'speaker' ? 'pi pi-th-large' : 'pi pi-id-card'"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="layout === 'speaker' ? $t('call.layoutGrid') : $t('call.layoutSpeaker')"
                        :disabled="!isConnected"
                        @click="callsStore.setLayout(layout === 'speaker' ? 'grid' : 'speaker')"
                    />
                    <Button
                        icon="pi pi-cog"
                        severity="secondary"
                        text
                        rounded
                        :aria-label="$t('call.settings')"
                        @click="event => settingsPopover?.toggle(event)"
                    />
                    <span class="mx-0.5 h-6 w-px bg-chrome-border" aria-hidden="true"></span>
                    <Button
                        icon="pi pi-phone"
                        severity="danger"
                        rounded
                        :aria-label="$t('call.leave')"
                        :disabled="!isConnected"
                        @click="leave"
                    />
                </div>
            </div>

            <Popover ref="reactionPicker">
                <div class="flex items-center gap-1" @click="reactionPicker?.hide()">
                    <Button
                        v-for="emoji in REACTION_EMOJIS"
                        :key="emoji"
                        :label="emoji"
                        text
                        rounded
                        :aria-label="$t('call.react', { emoji })"
                        @click="callsStore.sendReaction(emoji)"
                    />
                </div>
            </Popover>

            <Popover ref="settingsPopover">
                <div class="flex w-64 flex-col gap-3">
                    <label class="flex flex-col gap-1">
                        <span class="text-muted text-supporting">{{ $t('call.devices.microphone') }}</span>
                        <Select
                            :model-value="devices.audioinput"
                            :options="audioInputs"
                            option-label="label"
                            option-value="deviceId"
                            size="small"
                            class="w-full"
                            @update:model-value="value => callsStore.switchDevice('audioinput', value)"
                        />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-muted text-supporting">{{ $t('call.devices.camera') }}</span>
                        <Select
                            :model-value="devices.videoinput"
                            :options="videoInputs"
                            option-label="label"
                            option-value="deviceId"
                            size="small"
                            class="w-full"
                            @update:model-value="value => callsStore.switchDevice('videoinput', value)"
                        />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-muted text-supporting">{{ $t('call.devices.speaker') }}</span>
                        <Select
                            :model-value="devices.audiooutput"
                            :options="audioOutputs"
                            option-label="label"
                            option-value="deviceId"
                            size="small"
                            class="w-full"
                            @update:model-value="value => callsStore.switchDevice('audiooutput', value)"
                        />
                    </label>
                </div>
            </Popover>
        </template>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import Select from '~/components/shared/InstanceSelect.vue';
import { useI18n } from 'vue-i18n';
import StateBlock from '~/components/shared/StateBlock.vue';
import CallPrejoin from '~/components/calls/CallPrejoin.vue';
import CallTile from '~/components/calls/CallTile.vue';
import { riseAndFade } from '~/composables/useMotion.js';
import { useCallsStore } from '~/stores/calls';
import { conversationKeyForRoom } from '#shared/call-rooms.js';
import { useToast } from 'primevue/usetoast';

const props = defineProps({
    room: { type: String, required: true }
});
const emit = defineEmits(['closed']);
const { t } = useI18n();
const callsStore = useCallsStore();
const toast = useToast();

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '👏'];

const settingsPopover = ref(null);
const reactionPicker = ref(null);
const recordPending = ref(false);
// Stage before/outside the session: prejoin or connecting. The connected
// and failed stages render from the session itself.
const localStage = ref('prejoin');
const lastReactionEls = new Map();
// Live video aspect per tile key, fed by the tiles' resize events; a
// reactive Map so the tiles computed re-runs when an aspect lands.
const aspectByKey = reactive(new Map());

const sessionState = computed(() => (
    callsStore.session && callsStore.session.state.name === props.room
        ? callsStore.session.state
        : null
));
const stage = computed(() => sessionState.value?.state || localStage.value);
const failed = computed(() => stage.value === 'failed');
const failureMessage = computed(() => {
    if (typeof navigator !== 'undefined' && !navigator.mediaDevices) return t('call.insecureContext');
    return sessionState.value?.error || t('call.failed');
});
const isConnected = computed(() => sessionState.value?.state === 'connected');
const reconnecting = computed(() => Boolean(sessionState.value?.reconnecting));
const micEnabled = computed(() => Boolean(sessionState.value?.micEnabled));
const camEnabled = computed(() => Boolean(sessionState.value?.camEnabled));
const sharing = computed(() => Boolean(sessionState.value?.sharing));
const handRaised = computed(() => Boolean(sessionState.value?.handRaised));
const layout = computed(() => sessionState.value?.layout || 'speaker');
const devices = computed(() => sessionState.value?.devices || {});
const audioInputs = computed(() => sessionState.value?.audioInputs || []);
const videoInputs = computed(() => sessionState.value?.videoInputs || []);
const audioOutputs = computed(() => sessionState.value?.audioOutputs || []);
const reactions = computed(() => sessionState.value?.reactions || []);

const recording = computed(() => Boolean(callsStore.roomRecording(props.room)));
const canRecord = computed(() => Boolean(conversationKeyForRoom(props.room)));

// One tile per participant camera plus one per live screen share, the
// demo's participant-tile shape. `source` keys pinning ('camera'/'screen').
const tiles = computed(() => {
    const state = sessionState.value;
    if (!state) return [];
    const list = [];
    for (const participant of state.participants) {
        list.push({
            key: `${participant.identity}:camera`,
            identity: participant.identity,
            name: participant.name,
            isLocal: participant.isLocal,
            source: 'camera',
            isScreen: false,
            hasVideo: Boolean(participant.cameraTrack) && !participant.cameraMuted,
            track: participant.cameraTrack,
            muted: participant.audioMuted,
            speaking: participant.speaking,
            audioLevel: participant.audioLevel,
            handRaised: participant.handRaised,
            quality: participant.quality,
            pinned: state.pinnedKey === `${participant.identity}:camera`,
            aspect: aspectByKey.get(`${participant.identity}:camera`) || 0
        });
        if (participant.screenTrack) {
            list.push({
                key: `${participant.identity}:screen`,
                identity: participant.identity,
                name: participant.name,
                isLocal: participant.isLocal,
                source: 'screen',
                isScreen: true,
                hasVideo: true,
                track: participant.screenTrack,
                muted: participant.audioMuted,
                speaking: false,
                audioLevel: 0,
                handRaised: false,
                quality: participant.quality,
                pinned: state.pinnedKey === `${participant.identity}:screen`,
                aspect: aspectByKey.get(`${participant.identity}:screen`) || 0
            });
        }
    }
    return list;
});

// Official focus resolution: pinned tile, else the first screen share,
// else the active speaker, else the first tile.
const focusTile = computed(() => {
    const list = tiles.value;
    if (!list.length) return null;
    const state = sessionState.value;
    const pinned = list.find(tile => tile.pinned);
    if (pinned) return pinned;
    const screen = list.find(tile => tile.isScreen);
    if (screen) return screen;
    const speaker = state?.activeSpeakerKey
        ? list.find(tile => tile.key === state.activeSpeakerKey)
        : null;
    return speaker || list[0];
});
const stripTiles = computed(() => tiles.value.filter(tile => tile !== focusTile.value));

const patchAspect = (tile, ratio) => {
    if (!tile || !Number.isFinite(ratio) || ratio <= 0) return;
    const previous = aspectByKey.get(tile.key) || 0;
    if (Math.abs(previous - ratio) > 0.01) aspectByKey.set(tile.key, ratio);
};

const deviceErrorToast = (error) => {
    if (!error) return;
    const label = error.device === 'microphone'
        ? t('call.devices.microphone')
        : error.device === 'camera'
            ? t('call.devices.camera')
            : t('call.share');
    toast.add({ severity: 'warn', summary: label, detail: error.message || '', life: 4000 });
};

const join = async (prejoin = {}) => {
    localStage.value = 'connecting';
    const result = await callsStore.openSession(props.room, prejoin);
    // A fatal failure with no session leaves nothing to render the failed
    // stage from; the pre-join screen takes over (connect failures carry
    // their failed session and render it).
    if (result?.fatal && !sessionState.value) localStage.value = 'prejoin';
    for (const deviceError of result?.deviceErrors || []) deviceErrorToast(deviceError);
};

const toggleMic = async () => {
    deviceErrorToast(await callsStore.toggleMic());
};

const toggleCamera = async () => {
    deviceErrorToast(await callsStore.toggleCamera());
};

const toggleRecording = async () => {
    if (recordPending.value || !canRecord.value) return;
    recordPending.value = true;
    try {
        if (recording.value) {
            await $fetch('/api/livekit/recordings/stop', { method: 'POST', body: { room: props.room } });
        } else {
            await $fetch('/api/livekit/recordings', { method: 'POST', body: { room: props.room } });
        }
        await callsStore.refresh();
    } catch (recordError) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: recordError?.data?.message || recordError?.message || '', life: 4000 });
    } finally {
        recordPending.value = false;
    }
};

// Reactions animate once and leave the session list; the ref callback
// fires only for newly mounted spans.
const registerReactionEl = (id, el) => {
    if (el) {
        lastReactionEls.set(id, el);
        runReaction(id);
    }
};

const runReaction = async (id) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const el = lastReactionEls.get(id);
    if (el) await riseAndFade(el);
    lastReactionEls.delete(id);
    callsStore.removeReaction(id);
};

const retry = async () => {
    await callsStore.leaveSession();
    localStage.value = 'prejoin';
};

const leave = async () => {
    await callsStore.leaveSession();
    emit('closed');
};

onMounted(() => {
    callsStore.mountSurface(props.room);
});

onBeforeUnmount(() => {
    callsStore.unmountSurface(props.room);
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
    overflow: hidden auto;
    width: 16rem;
  }

  .call-panel .call-strip-tile {
    width: 100%;
  }
}
</style>
