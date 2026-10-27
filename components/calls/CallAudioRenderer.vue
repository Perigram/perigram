<template>
    <!-- App-level remote-audio renderer: every subscribed remote audio
         track of the live session plays through LiveKit-attached elements
         kept off the visible layout. It mounts beside the room session in
         the app shell, so audio survives every surface move (SPEC §11). -->
    <div ref="sink" class="hidden" aria-hidden="true"></div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useCallsStore } from '~/stores/calls';

const callsStore = useCallsStore();
const sink = ref(null);
const attached = new Map();

const attachTrack = (track) => {
    if (!track || attached.has(track)) return;
    let element = null;
    try {
        element = track.attach();
    } catch {
        return;
    }
    attached.set(track, element);
    sink.value?.appendChild(element);
    element.play?.().catch(() => {});
};

const detachTrack = (track) => {
    if (!track || !attached.has(track)) return;
    attached.delete(track);
    try {
        for (const element of track.detach()) element.remove();
    } catch {
        /* the track may already be gone */
    }
};

watch(() => callsStore.session?.state.remoteAudioTracks, tracks => {
    if (!tracks) return;
    const live = new Set(tracks);
    for (const track of [...attached.keys()]) {
        if (!live.has(track)) detachTrack(track);
    }
    for (const track of tracks) attachTrack(track);
}, { deep: true, immediate: true });

onBeforeUnmount(() => {
    for (const track of [...attached.keys()]) detachTrack(track);
});
</script>
