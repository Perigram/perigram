import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { emitInstanceChanged, isSelfPublished } from '~/utils/instance-events.js';
import { useConnections } from '~/composables/useConnections.js';
import { refreshFileTypeView } from '~/composables/useFileTypeView.js';
import { useAuthStore } from './auth';

const POLL_INTERVAL_MS = 15_000;
const RETRY_INTERVAL_MS = 5_000;
const CONTRACT_REFRESH_DEBOUNCE_MS = 2_000;

export const useEntityEventsStore = defineStore('instanceEvents', () => {
    // idle → polling → connected | error; error → polling (retry);
    // disconnect → stopped; connect from stopped → polling.
    const status = ref('idle');
    const error = ref(null);
    const connected = computed(() => status.value === 'connected');
    let cursor = null;
    let timer = null;
    let runId = 0;
    let running = false;
    let onVisibilityChange = null;
    let contractTopic = null;
    let unsubscribeContract = null;
    let contractTimer = null;

    // Contract refresh hint: registry/process changes published on the org
    // topic trigger one debounced re-hydration. The hint never carries
    // contract data — auth hydration remains the sole resolution point.
    function handleContractChanged() {
        if (contractTimer) clearTimeout(contractTimer);
        contractTimer = setTimeout(async () => {
            contractTimer = null;
            try {
                await useAuthStore().setUser();
            } catch {
                // The next poll cycle or route change re-hydrates.
                return;
            }
            await refreshFileTypeView(useAuthStore().user?.organizationId || '');
        }, CONTRACT_REFRESH_DEBOUNCE_MS);
    }

    function syncContractSubscription() {
        const organizationId = useAuthStore().user?.organizationId;
        const topic = organizationId ? `org:${organizationId}` : null;
        if (topic === contractTopic) return;
        if (unsubscribeContract) unsubscribeContract();
        contractTopic = topic;
        unsubscribeContract = topic
            ? useConnections().subscribe(topic, payload => {
                if (payload?.type === 'contractChanged') handleContractChanged();
                if (payload?.type === 'entityChanged') handleEntityChanged(payload?.data);
            })
            : null;
    }

    // Rapid events: entity changes the server bridges onto the org topic
    // ride the realtime stream instead of waiting for the poll. The event
    // is the same invalidation signal the poll delivers — the poll stays
    // the catch-up path for hidden tabs and dropped streams. The cursor
    // advances past every realtime-delivered event so the poll never
    // re-delivers it; events this tab published itself (its mutation
    // already applied the fresher snapshot) are skipped in both paths.
    function handleEntityChanged(data = {}) {
        if (!isDocumentVisible()) return;
        advanceCursor(data.eventId);
        if (isSelfPublished(data.eventId)) return;
        emitInstanceChanged({ ...data, source: 'server' });
    }

    function advanceCursor(eventId) {
        const id = Number(eventId);
        if (!Number.isFinite(id)) return;
        cursor = Math.max(cursor || 0, id);
    }

    async function poll(activeRunId) {
        if (activeRunId !== runId || !isDocumentVisible()) return;
        if (status.value !== 'connected') status.value = 'polling';

        try {
            const response = await $fetch('/api/instance-events', {
                query: cursor === null ? undefined : { after: cursor }
            });
            if (activeRunId !== runId) return;

            cursor = Math.max(cursor || 0, response.cursor);
            status.value = 'connected';
            error.value = null;
            for (const event of response.events || []) {
                if (isSelfPublished(event.eventId)) continue;
                emitInstanceChanged({ ...event, source: 'server' });
            }
            timer = setTimeout(() => poll(activeRunId), POLL_INTERVAL_MS);
        } catch (err) {
            if (activeRunId !== runId) return;
            status.value = 'error';
            error.value = err;
            timer = setTimeout(() => poll(activeRunId), RETRY_INTERVAL_MS);
        }
    }

    function connect() {
        if (typeof window === 'undefined' || running) return;
        running = true;
        const activeRunId = ++runId;
        error.value = null;
        status.value = 'polling';
        onVisibilityChange = () => {
            if (!isDocumentVisible() || activeRunId !== runId) return;
            if (timer) clearTimeout(timer);
            timer = null;
            poll(activeRunId);
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        syncContractSubscription();
        poll(activeRunId);
    }

    function disconnect() {
        if (typeof window === 'undefined') return;
        runId++;
        running = false;
        if (timer) clearTimeout(timer);
        timer = null;
        if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
        onVisibilityChange = null;
        if (contractTimer) clearTimeout(contractTimer);
        contractTimer = null;
        if (unsubscribeContract) unsubscribeContract();
        unsubscribeContract = null;
        contractTopic = null;
        cursor = null;
        status.value = 'stopped';
        error.value = null;
    }

    return { status, connected, error, connect, disconnect };
});

function isDocumentVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}
