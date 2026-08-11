import { defineStore } from 'pinia';
import { ref } from 'vue';
import { emitEntityChanged } from '~/utils/entity-events.js';

const POLL_INTERVAL_MS = 15_000;
const RETRY_INTERVAL_MS = 5_000;

export const useEntityEventsStore = defineStore('entityEvents', () => {
    const connected = ref(false);
    const error = ref(null);
    let cursor = null;
    let timer = null;
    let runId = 0;
    let running = false;
    let onVisibilityChange = null;

    async function poll(activeRunId) {
        if (activeRunId !== runId || !isDocumentVisible()) return;

        try {
            const response = await $fetch('/api/entity-events', {
                query: cursor === null ? undefined : { after: cursor }
            });
            if (activeRunId !== runId) return;

            cursor = response.cursor;
            connected.value = true;
            error.value = null;
            for (const event of response.events || []) {
                emitEntityChanged({ ...event, source: 'server' });
            }
            timer = setTimeout(() => poll(activeRunId), POLL_INTERVAL_MS);
        } catch (err) {
            if (activeRunId !== runId) return;
            connected.value = false;
            error.value = err;
            timer = setTimeout(() => poll(activeRunId), RETRY_INTERVAL_MS);
        }
    }

    function connect() {
        if (process.server || running) return;
        running = true;
        const activeRunId = ++runId;
        error.value = null;
        onVisibilityChange = () => {
            if (!isDocumentVisible() || activeRunId !== runId) return;
            if (timer) clearTimeout(timer);
            timer = null;
            poll(activeRunId);
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        poll(activeRunId);
    }

    function disconnect() {
        runId++;
        running = false;
        if (timer) clearTimeout(timer);
        timer = null;
        if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange);
        onVisibilityChange = null;
        cursor = null;
        connected.value = false;
        error.value = null;
    }

    return { connected, error, connect, disconnect };
});

function isDocumentVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}
