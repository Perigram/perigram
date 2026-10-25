import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'

// MediaRecorder lifecycle for chat voice messages: capture, pause-aware
// elapsed accounting, teardown, and blob assembly. Sending the assembled
// file stays with the composer.
const VOICE_RECORDING_MAX_SECONDS = 600

export function useVoiceRecorder() {
    const { t } = useI18n()
    const toast = useToast()
    const voiceRecording = ref(false)
    const voicePaused = ref(false)
    const recordingElapsed = ref(0)
    const voiceRecordingSupported = computed(() => process.client
        && Boolean(navigator.mediaDevices?.getUserMedia)
        && typeof MediaRecorder !== 'undefined')
    let mediaRecorder = null
    let recordedChunks = []
    let recordingStream = null
    let recordingTimer = null
    let recordingElapsedBase = 0
    let recordingRunStartedAt = 0
    let stopResolver = null

    const formatRecordingDuration = (seconds) => {
        const total = Math.max(0, Math.floor(seconds))
        const minutes = Math.floor(total / 60)
        const rest = total % 60
        return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    }

    const stopRecordingTracks = () => {
        if (recordingTimer) {
            clearInterval(recordingTimer)
            recordingTimer = null
        }
        if (recordingStream) {
            for (const track of recordingStream.getTracks()) track.stop()
            recordingStream = null
        }
    }

    const teardownRecording = () => {
        stopRecordingTracks()
        mediaRecorder = null
        recordedChunks = []
        voiceRecording.value = false
        voicePaused.value = false
        recordingElapsed.value = 0
    }

    const currentRecordingSeconds = () => (voicePaused.value
        ? recordingElapsedBase
        : recordingElapsedBase + (Date.now() - recordingRunStartedAt) / 1000)

    const startRecordingTimer = () => {
        if (recordingTimer) clearInterval(recordingTimer)
        recordingTimer = setInterval(() => {
            recordingElapsed.value = recordingElapsedBase
                + Math.floor((Date.now() - recordingRunStartedAt) / 1000)
            if (recordingElapsed.value >= VOICE_RECORDING_MAX_SECONDS && stopResolver) stopResolver()
        }, 500)
    }

    const toggleVoiceRecordingPause = () => {
        if (!mediaRecorder || stopResolver) return
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.pause()
            recordingElapsedBase = recordingElapsed.value
            if (recordingTimer) {
                clearInterval(recordingTimer)
                recordingTimer = null
            }
            voicePaused.value = true
            return
        }
        if (mediaRecorder.state === 'paused') {
            mediaRecorder.resume()
            recordingRunStartedAt = Date.now()
            startRecordingTimer()
            voicePaused.value = false
        }
    }

    const startVoiceRecording = async () => {
        if (voiceRecording.value || !voiceRecordingSupported.value) return
        try {
            recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (error) {
            toast.add({ severity: 'error', summary: t('common.error'), detail: error?.message || '', life: 4000 })
            return
        }
        recordedChunks = []
        mediaRecorder = new MediaRecorder(recordingStream)
        mediaRecorder.ondataavailable = event => {
            if (event.data?.size) recordedChunks.push(event.data)
        }
        mediaRecorder.onstop = () => {
            const mimeType = mediaRecorder?.mimeType || 'audio/webm'
            const blob = new Blob(recordedChunks, { type: mimeType })
            const durationSeconds = Math.max(1, Math.round(currentRecordingSeconds()))
            stopRecordingTracks()
            teardownRecording()
            if (stopResolver) {
                stopResolver({ blob, mimeType, durationSeconds })
                stopResolver = null
            }
        }
        recordingRunStartedAt = Date.now()
        recordingElapsed.value = 0
        recordingElapsedBase = 0
        voicePaused.value = false
        startRecordingTimer()
        mediaRecorder.start()
        voiceRecording.value = true
    }

    const cancelVoiceRecording = () => {
        if (!mediaRecorder) {
            teardownRecording()
            return
        }
        stopResolver = null
        mediaRecorder.onstop = () => teardownRecording()
        mediaRecorder.stop()
        stopRecordingTracks()
    }

    // Resolves the assembled recording, or null when nothing was captured.
    const finishVoiceRecording = () => new Promise(resolve => {
        if (!mediaRecorder) {
            resolve(null)
            return
        }
        stopResolver = resolve
        mediaRecorder.stop()
    })

    return {
        voiceRecording,
        voicePaused,
        recordingElapsed,
        voiceRecordingSupported,
        formatRecordingDuration,
        toggleVoiceRecordingPause,
        startVoiceRecording,
        cancelVoiceRecording,
        finishVoiceRecording
    }
}
