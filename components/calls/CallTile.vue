<template>
    <div
        class="relative flex items-center justify-center overflow-hidden rounded-ui bg-subtle"
        :class="tileClass"
        :style="hugAspect ? { aspectRatio: String(tile.aspect) } : null"
        :data-call-tile="tile.identity"
    >
        <video
            :ref="videoRef"
            class="h-full w-full"
            :class="[tile.isScreen ? 'object-contain' : 'object-cover', { 'opacity-0': !tile.hasVideo }]"
            autoplay
            playsinline
            muted
            @loadedmetadata="reportAspect"
            @resize="reportAspect"
        />
        <div v-if="!tile.hasVideo" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Avatar :label="tile.name?.charAt(0).toUpperCase() || '?'" shape="circle" class="bg-primary text-primary-contrast" />
            <span class="text-label">{{ tile.name || tile.identity }}</span>
        </div>

        <span
            v-if="tile.audioLevel"
            class="absolute top-2 left-2 h-2.5 w-2.5 rounded-ui bg-status-success"
            :aria-label="$t('call.speaking')"
        />
        <span class="absolute bottom-2 left-2 flex items-center gap-2 rounded-ui bg-content px-2 py-1">
            <span class="text-supporting">{{ tile.name || tile.identity }}</span>
            <i v-if="tile.muted" class="pi pi-microphone-slash text-muted-color" :aria-label="$t('call.muted')" />
            <i v-if="tile.handRaised" class="pi pi-thumbs-up-fill text-status-warning" :aria-label="$t('call.handRaised')" />
            <i class="pi pi-wifi" :class="qualityClass" :aria-label="$t(`call.quality.${tile.quality || 'unknown'}`)" />
        </span>

        <Button
            :icon="tile.pinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'"
            severity="secondary"
            text
            rounded
            size="small"
            class="absolute top-2 right-2"
            :aria-label="tile.pinned ? $t('call.unpin') : $t('call.pin')"
            @click="$emit('toggle-pin', tile.identity)"
        />
    </div>
</template>

<script setup>
import { computed } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';

const props = defineProps({
    tile: { type: Object, required: true },
    spotlight: { type: Boolean, default: false }
});
const emit = defineEmits(['toggle-pin', 'video', 'aspect']);

const qualityClass = computed(() => {
    if (props.tile.quality === 'excellent' || props.tile.quality === 'good') return 'text-status-success';
    if (props.tile.quality === 'fair') return 'text-status-warning';
    if (props.tile.quality === 'poor' || props.tile.quality === 'lost') return 'text-status-danger';
    return 'text-muted-color';
});

// Spotlighted screen shares hug their live source proportions instead of
// stretching the stage box; cameras fill the stage; grid/strip tiles keep a
// stable 16:9 cell.
const hugAspect = computed(() => props.spotlight && props.tile.isScreen && Number(props.tile.aspect) > 0);

const tileClass = computed(() => {
    if (hugAspect.value) return 'h-auto max-h-full w-auto max-w-full';
    if (props.spotlight) return 'h-full min-h-36 w-full';
    return 'aspect-video';
});

// A stable ref callback: re-creating the callback every render re-fires it
// with the same element, and re-attaching the same stream made tiles flash.
let lastVideoEl = null;
const videoRef = (el) => {
    if (el && el !== lastVideoEl) {
        lastVideoEl = el;
        emit('video', el);
        reportAspect();
    }
};

const reportAspect = () => {
    const el = lastVideoEl;
    if (!el?.videoWidth || !el?.videoHeight) return;
    const ratio = el.videoWidth / el.videoHeight;
    if (Number.isFinite(ratio) && ratio > 0) emit('aspect', ratio);
};
</script>
