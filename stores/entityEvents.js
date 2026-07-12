import { defineStore } from 'pinia';
import { ref } from 'vue';
import { emitEntityChanged } from '~/utils/entity-events.js';

export const useEntityEventsStore = defineStore('entityEvents', () => {
    const connected = ref(false);
    const error = ref(null);
    let eventSource = null;

    function connect() {
        if (process.server || eventSource) return;
        error.value = null;
        eventSource = new EventSource('/api/entity-events');
        eventSource.onopen = () => {
            connected.value = true;
        };
        eventSource.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type !== 'entityChanged') return;
            emitEntityChanged({
                ...message.data,
                source: 'server'
            });
        };
        eventSource.onerror = (err) => {
            connected.value = false;
            error.value = err;
        };
    }

    function disconnect() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        connected.value = false;
        error.value = null;
    }

    return {
        connected,
        error,
        connect,
        disconnect
    };
});
