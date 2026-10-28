<template>
    <div
        class="group relative flex items-center justify-center overflow-hidden rounded-ui bg-subtle transition-shadow"
        :class="[tileClass, { 'ring-2 ring-status-success': tile.speaking }]"
        :style="hugAspect ? { aspectRatio: String(tile.aspect) } : null"
        :data-call-tile="tile.identity"
    >
        <!-- The video element attaches its track itself (VideoTrack
             semantics): mount attaches, track change re-attaches, unmount
             detaches — the element pool follows the tile. -->
        <video
            ref="videoEl"
            class="h-full w-full"
            :class="[tile.isScreen ? 'object-contain' : 'object-cover', { 'opacity-0': !tile.hasVideo, 'scale-x-[-1]': mirrored && !tile.isScreen }]"
            autoplay
            playsinline
            muted
            @loadedmetadata="reportAspect"
            @resize="reportAspect"
        />
        <!-- No-video fallback is the avatar only: the identity chip below
             is the single name owner on every tile. -->
        <div v-if="!tile.hasVideo" class="absolute inset-0 flex items-center justify-center">
            <Avatar :label="tile.name?.charAt(0).toUpperCase() || '?'" shape="circle" class="bg-primary text-primary-contrast" />
        </div>

        <span
            v-if="tile.audioLevel"
            class="absolute top-2 left-2 h-2.5 w-2.5 rounded-ui bg-status-success"
            :aria-label="$t('call.speaking')"
        />
        <span class="absolute bottom-2 left-2 flex min-w-0 max-w-full items-center gap-2 rounded-ui bg-content px-2 py-1">
            <span class="min-w-0 truncate text-supporting">{{ tile.name || tile.identity }}</span>
            <i v-if="tile.muted" class="pi pi-microphone text-status-danger" :aria-label="$t('call.muted')" />
            <i v-if="tile.handRaised" class="pi pi-thumbs-up-fill text-status-warning" :aria-label="$t('call.handRaised')" />
            <!-- A healthy connection is the silent default; the quality
                 glyph appears only when it degrades. -->
            <i v-if="degradedQuality" class="pi pi-wifi" :class="qualityClass" :aria-label="$t(`call.quality.${tile.quality}`)" />
        </span>

        <!-- Spotlight control: a push-pin chip over the media, revealed on
             tile hover on pointer devices, always visible on touch
             widths; a spotlighted tile keeps it lit as its state. -->
        <Button
            severity="secondary"
            text
            rounded
            size="small"
            class="absolute top-2 right-2 bg-content shadow-overlay transition-opacity"
            :class="tile.pinned
                ? 'opacity-100'
                : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'"
            :aria-label="tile.pinned ? $t('call.unpin') : $t('call.pin')"
            @click="$emit('toggle-pin', tile.key)"
        >
            <template #icon>
                <!-- Material Symbols push_pin (Apache-2.0): primeicons
                     ships no pin glyph. -->
                <svg
                    :class="['w-4 h-4', tile.pinned ? 'text-primary' : '']"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                </svg>
            </template>
        </Button>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';

const props = defineProps({
    tile: { type: Object, required: true },
    spotlight: { type: Boolean, default: false },
    // Local camera self-view mirrors, the way every video caller expects
    // to see themselves; screen shares never mirror.
    mirrored: { type: Boolean, default: false }
});
const emit = defineEmits(['toggle-pin', 'aspect']);

const degradedQuality = computed(() => ['fair', 'poor', 'lost'].includes(props.tile.quality));

const qualityClass = computed(() => {
    if (props.tile.quality === 'excellent' || props.tile.quality === 'good') return 'text-status-success';
    if (props.tile.quality === 'fair') return 'text-status-warning';
    if (props.tile.quality === 'poor' || props.tile.quality === 'lost') return 'text-status-danger';
    return 'text-muted';
});

// Spotlighted screen shares hug their live source proportions instead of
// stretching the stage box; cameras fill the stage; grid/strip tiles keep a
// stable 16:9 cell.
const hugAspect = computed(() => props.spotlight && props.tile.isScreen && Number(props.tile.aspect) > 0);

const tileClass = computed(() => {
    if (hugAspect.value) return 'h-auto max-h-full w-auto max-w-full';
    if (props.spotlight) return 'h-full w-full';
    return 'aspect-video';
});

const videoEl = ref(null);

const attach = (track, el) => {
    if (!track || !el) return;
    if (track.attachedElements?.includes(el)) {
        el.play?.().catch(() => {});
        return;
    }
    try {
        track.attach(el);
    } catch {
        return;
    }
    el.play?.().catch(() => {});
};

const detach = (track, el) => {
    if (!track || !el) return;
    try {
        track.detach(el);
    } catch {
        /* the track may already be gone */
    }
};

// A track swap on the same tile re-attaches the element to the new track.
watch(() => [props.tile.track, videoEl.value], ([track, el], [previousTrack] = []) => {
    if (previousTrack && previousTrack !== track) detach(previousTrack, el);
    attach(track, el);
});

onBeforeUnmount(() => {
    detach(props.tile.track, videoEl.value);
});

const reportAspect = () => {
    const el = videoEl.value;
    if (!el?.videoWidth || !el?.videoHeight) return;
    const ratio = el.videoWidth / el.videoHeight;
    if (Number.isFinite(ratio) && ratio > 0) emit('aspect', ratio);
};
</script>
