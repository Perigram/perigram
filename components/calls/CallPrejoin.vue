<template>
    <div class="flex h-full min-h-0 flex-col items-center justify-center gap-6 overflow-y-auto p-4">
        <h2 class="m-0 text-section-heading">{{ $t('call.prejoin.title') }}</h2>

        <div class="relative flex h-64 w-full max-w-md items-center justify-center overflow-hidden rounded-ui bg-subtle">
            <video ref="previewEl" class="h-full w-full object-cover" :class="{ 'opacity-0': !cameraReady }" autoplay playsinline muted />
            <div v-if="!cameraReady" class="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Avatar icon="pi pi-user" shape="circle" class="bg-primary text-primary-contrast" />
                <span class="text-supporting">{{ cameraError ? $t('call.prejoin.cameraUnavailable') : $t('call.prejoin.cameraOff') }}</span>
            </div>
            <!-- Bare mic-activity dot: the level meter is a pre-join sanity
                 signal, not prose. -->
            <span
                class="absolute bottom-2 left-2 flex items-center rounded-ui bg-content px-2 py-1"
                :class="{ 'opacity-0': !micLevel }"
                :aria-label="$t('call.prejoin.micLevel')"
            >
                <span class="h-2 w-2 rounded-ui bg-status-success" />
            </span>
        </div>

        <div class="flex w-full max-w-md flex-col gap-3">
            <label class="flex flex-col gap-1">
                <span class="text-muted text-supporting">{{ $t('call.devices.microphone') }}</span>
                <Select v-model="deviceId.audioinput" :options="audioInputs" option-label="label" option-value="deviceId" size="small" class="w-full" :aria-label="$t('call.devices.microphone')" />
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-muted text-supporting">{{ $t('call.devices.camera') }}</span>
                <Select v-model="deviceId.videoinput" :options="videoInputs" option-label="label" option-value="deviceId" size="small" class="w-full" :aria-label="$t('call.devices.camera')" />
            </label>
        </div>

        <div class="flex items-center gap-2">
            <Button
                :icon="micEnabled ? 'pi pi-microphone' : 'pi pi-microphone text-status-danger'"
                severity="secondary"
                rounded
                :aria-label="$t('call.toggleMic')"
                @click="micEnabled = !micEnabled"
            />
            <Button
                :icon="cameraEnabled ? 'pi pi-video' : 'pi pi-video text-status-danger'"
                severity="secondary"
                rounded
                :aria-label="$t('call.toggleCamera')"
                @click="toggleCameraPreview"
            />
            <Button
                :label="$t('call.prejoin.join')"
                icon="pi pi-phone"
                rounded
                @click="join"
            />
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Select from '~/components/shared/InstanceSelect.vue';

const emit = defineEmits(['join']);

const previewEl = ref(null);
const micEnabled = ref(true);
const cameraEnabled = ref(true);
const cameraReady = ref(false);
const cameraError = ref(false);
const micLevel = ref(false);
const deviceId = ref({ audioinput: '', videoinput: '' });
const audioInputs = ref([]);
const videoInputs = ref([]);

let previewTrack = null;
let previewStartToken = 0;
let meterStream = null;
let analyserContext = null;
let analyserSource = null;
let levelTimer = null;
let meterStartToken = 0;

const enumerate = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs.value = devices.filter(device => device.kind === 'audioinput');
        videoInputs.value = devices.filter(device => device.kind === 'videoinput');
        if (!deviceId.value.audioinput && audioInputs.value[0]) deviceId.value.audioinput = audioInputs.value[0].deviceId;
        if (!deviceId.value.videoinput && videoInputs.value[0]) deviceId.value.videoinput = videoInputs.value[0].deviceId;
    } catch {
        audioInputs.value = [];
        videoInputs.value = [];
    }
};

const startPreview = async () => {
    stopPreview();
    if (!cameraEnabled.value) return;
    const token = ++previewStartToken;
    try {
        const { createLocalVideoTrack } = await import('livekit-client');
        const track = await createLocalVideoTrack({
            deviceId: deviceId.value.videoinput || undefined
        });
        if (token !== previewStartToken) {
            track.stop();
            return;
        }
        previewTrack = track;
        if (previewEl.value) {
            previewTrack.attach(previewEl.value);
            await previewEl.value.play().catch(() => {});
        }
        cameraReady.value = true;
        cameraError.value = false;
    } catch {
        cameraError.value = true;
        cameraReady.value = false;
    }
    // Permission was (just) granted or denied: labels and ids are readable
    // now, so the pickers re-read their lists.
    enumerate();
};

const stopPreview = () => {
    previewStartToken++;
    if (previewTrack && previewEl.value) {
        try {
            previewTrack.detach(previewEl.value);
        } catch {
            /* the element may already be gone */
        }
    }
    previewTrack?.stop();
    previewTrack = null;
    cameraReady.value = false;
};

const toggleCameraPreview = () => {
    cameraEnabled.value = !cameraEnabled.value;
    if (cameraEnabled.value) startPreview();
    else stopPreview();
};

const stopMicMeter = () => {
    meterStartToken++;
    if (levelTimer) clearInterval(levelTimer);
    levelTimer = null;
    analyserSource?.disconnect();
    analyserSource = null;
    analyserContext?.close().catch(() => {});
    analyserContext = null;
    meterStream?.getTracks().forEach(track => track.stop());
    meterStream = null;
    micLevel.value = false;
};

// The meter's stream must stay live for the analyser to see levels;
// stopping it here would silence the dot for the whole pre-join.
const startMicMeter = async () => {
    stopMicMeter();
    if (!micEnabled.value) return;
    const token = meterStartToken;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: deviceId.value.audioinput || undefined }
        });
        if (token !== meterStartToken) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        meterStream = stream;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        analyserContext = new AudioContextClass();
        const analyser = analyserContext.createAnalyser();
        analyser.fftSize = 512;
        analyserSource = analyserContext.createMediaStreamSource(meterStream);
        analyserSource.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        levelTimer = setInterval(() => {
            analyser.getByteFrequencyData(buffer);
            micLevel.value = buffer.some(value => value > 24);
        }, 250);
        enumerate();
    } catch {
        stopMicMeter();
    }
};

// Pickers switch the live source, the way a device picker is expected to.
watch(() => deviceId.value.videoinput, () => {
    if (cameraEnabled.value) startPreview();
});
watch(() => deviceId.value.audioinput, () => {
    if (micEnabled.value) startMicMeter();
});
watch(micEnabled, enabled => {
    if (enabled) startMicMeter();
    else stopMicMeter();
});

const join = () => {
    stopPreview();
    stopMicMeter();
    emit('join', {
        micEnabled: micEnabled.value,
        cameraEnabled: cameraEnabled.value,
        deviceId: { ...deviceId.value }
    });
};

onMounted(async () => {
    await enumerate();
    startPreview();
    startMicMeter();
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerate);
});

onBeforeUnmount(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', enumerate);
    stopPreview();
    stopMicMeter();
});
</script>
