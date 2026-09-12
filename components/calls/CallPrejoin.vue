<template>
    <div class="flex h-full min-h-0 flex-col items-center justify-center gap-6 p-4">
        <div class="flex flex-col items-center gap-2 text-center">
            <h2 class="m-0 text-section-heading">{{ $t('call.prejoin.title') }}</h2>
            <p class="m-0 text-body text-muted-color">{{ room }}</p>
        </div>

        <div class="relative flex h-64 w-full max-w-md items-center justify-center overflow-hidden rounded-ui bg-subtle md:h-80">
            <video ref="previewEl" class="h-full w-full object-cover" :class="{ 'opacity-0': !cameraReady }" autoplay playsinline muted />
            <div v-if="!cameraReady" class="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Avatar icon="pi pi-user" shape="circle" class="bg-primary text-primary-contrast" />
                <span class="text-supporting">{{ cameraError ? $t('call.prejoin.cameraUnavailable') : $t('call.prejoin.cameraOff') }}</span>
            </div>
            <span
                class="absolute bottom-2 left-2 flex items-center gap-2 rounded-ui bg-content px-2 py-1"
                :class="{ 'opacity-0': !micLevel }"
            >
                <span class="h-2 w-2 rounded-ui bg-status-success" />
                <span class="text-supporting">{{ $t('call.prejoin.micLevel') }}</span>
            </span>
        </div>

        <div class="flex w-full max-w-md flex-col gap-3">
            <label class="flex flex-col gap-1">
                <span class="text-muted-color text-supporting">{{ $t('call.devices.microphone') }}</span>
                <Select v-model="deviceId.audioinput" :options="audioInputs" option-label="label" option-value="deviceId" size="small" class="w-full" :aria-label="$t('call.devices.microphone')" />
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-muted-color text-supporting">{{ $t('call.devices.camera') }}</span>
                <Select v-model="deviceId.videoinput" :options="videoInputs" option-label="label" option-value="deviceId" size="small" class="w-full" :aria-label="$t('call.devices.camera')" />
            </label>
        </div>

        <div class="flex items-center gap-2">
            <Button
                :icon="micEnabled ? 'pi pi-microphone' : 'pi pi-microphone-slash'"
                severity="secondary"
                rounded
                :aria-label="$t('call.toggleMic')"
                @click="micEnabled = !micEnabled"
            />
            <Button
                :icon="cameraEnabled ? 'pi pi-video' : 'pi pi-video-off'"
                severity="secondary"
                rounded
                :aria-label="$t('call.toggleCamera')"
                @click="toggleCameraPreview"
            />
            <Button
                :label="$t('call.prejoin.join')"
                icon="pi pi-phone"
                rounded
                :loading="joining"
                @click="join"
            />
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Select from '~/components/shared/EntitySelect.vue';

const props = defineProps({
    room: { type: String, required: true },
    joining: { type: Boolean, default: false }
});
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
let analyserContext = null;
let analyserSource = null;
let levelTimer = null;

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
    if (previewTrack || !cameraEnabled.value) return;
    try {
        const { createLocalVideoTrack } = await import('livekit-client');
        previewTrack = await createLocalVideoTrack({
            deviceId: deviceId.value.videoinput || undefined
        });
        if (previewEl.value) {
            previewEl.value.srcObject = new MediaStream([previewTrack.mediaStreamTrack]);
            await previewEl.value.play().catch(() => {});
        }
        cameraReady.value = true;
    } catch {
        cameraError.value = true;
        cameraReady.value = false;
    }
};

const stopPreview = () => {
    previewTrack?.stop();
    previewTrack = null;
    cameraReady.value = false;
};

const toggleCameraPreview = () => {
    cameraEnabled.value = !cameraEnabled.value;
    if (cameraEnabled.value) startPreview();
    else stopPreview();
};

const startMicMeter = async () => {
    if (!micEnabled.value || analyserContext) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: deviceId.value.audioinput || undefined }
        });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        analyserContext = new AudioContextClass();
        const analyser = analyserContext.createAnalyser();
        analyser.fftSize = 512;
        analyserSource = analyserContext.createMediaStreamSource(stream);
        analyserSource.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        levelTimer = setInterval(() => {
            analyser.getByteFrequencyData(buffer);
            micLevel.value = buffer.some(value => value > 24);
        }, 250);
        stream.getTracks().forEach(track => track.stop());
    } catch {
        micLevel.value = false;
    }
};

const join = () => {
    stopPreview();
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
});

onBeforeUnmount(() => {
    stopPreview();
    if (levelTimer) clearInterval(levelTimer);
    analyserSource?.disconnect();
    analyserContext?.close().catch(() => {});
});
</script>
