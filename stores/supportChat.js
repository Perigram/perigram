import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useSupportChatStore = defineStore('supportChat', () => {
    const conversations = ref([]);
    const totalUnread = ref(0);
    const connected = ref(false);
    const error = ref(null);
    let eventSource = null;

    const supportConversation = computed(() => conversations.value.find(item => item.conversationKind === 'support') || null);

    function connect() {
        if (eventSource || process.server) return;
        error.value = null;
        eventSource = new EventSource('/api/support/conversations');
        eventSource.onopen = () => {
            connected.value = true;
        };
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'initial' || data.type === 'update') {
                conversations.value = data.data || [];
                totalUnread.value = Number(data.totalUnread || 0);
            }
        };
        eventSource.onerror = (err) => {
            console.error('Support conversations SSE error:', err);
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
    }

    async function markRead(conversationKey) {
        if (!conversationKey) return;
        await $fetch('/api/support/read', {
            method: 'POST',
            body: { conversationKey }
        }).catch((err) => {
            console.error('Failed to mark support conversation read:', err);
        });
        conversations.value = conversations.value.map(item => item.conversationKey === conversationKey
            ? { ...item, unreadCount: 0 }
            : item);
        totalUnread.value = conversations.value.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
    }

    function upsertConversation(conversation) {
        if (!conversation?.conversationKey) return;
        const index = conversations.value.findIndex(item => item.conversationKey === conversation.conversationKey);
        if (index >= 0) conversations.value.splice(index, 1, { ...conversations.value[index], ...conversation });
        else conversations.value.unshift(conversation);
    }

    return {
        conversations,
        totalUnread,
        connected,
        error,
        supportConversation,
        connect,
        disconnect,
        markRead,
        upsertConversation
    };
});
