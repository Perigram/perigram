import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useConnections } from '~/composables/useConnections.js';

export const useSupportChatStore = defineStore('supportChat', () => {
    const authStore = useAuthStore();
    const conversations = ref([]);
    const totalUnread = ref(0);
    const connected = ref(false);
    const error = ref(null);
    let unsubscribeInbox = null;
    let unsubscribeOrg = null;

    const supportConversation = computed(() => conversations.value.find(item => item.conversationKind === 'support') || null);

    async function refresh() {
        if (process.server || !authStore.userIsSet) return;
        error.value = null;
        try {
            const response = await $fetch('/api/support/conversations');
            conversations.value = response?.data || [];
            totalUnread.value = Number(response?.totalUnread || 0);
            connected.value = true;
        } catch (err) {
            console.error('Failed to refresh support conversations:', err);
            connected.value = false;
            error.value = err;
        }
    }

    function connect() {
        if (unsubscribeInbox || process.server || !authStore.userIsSet) return;
        refresh();
        const handleInboxPing = (payload) => {
            if (payload?.type === 'support.inbox') refresh();
        };
        unsubscribeInbox = useConnections().subscribe(`user:${authStore.user.userId}`, handleInboxPing);
        // Entity-linked chats fan their inbox pings out on the organization
        // topic: org-mates see each other's entity messages without being
        // conversation participants.
        const organizationId = String(authStore.organizationData?._id || authStore.userData?.organizationId || '');
        if (organizationId) {
            unsubscribeOrg = useConnections().subscribe(`org:${organizationId}`, handleInboxPing);
        }
        connected.value = true;
    }

    function disconnect() {
        if (unsubscribeInbox) {
            unsubscribeInbox();
            unsubscribeInbox = null;
        }
        if (unsubscribeOrg) {
            unsubscribeOrg();
            unsubscribeOrg = null;
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

    // Per-user pin/archive flags; the row updates locally from the saved
    // pref so the inbox reacts without a full snapshot refresh.
    async function setConversationPref(conversationKey, patch = {}) {
        if (!conversationKey) return;
        const saved = await $fetch('/api/support/prefs', {
            method: 'POST',
            body: { conversationKey, ...patch }
        }).catch((err) => {
            console.error('Failed to save conversation preference:', err);
            return null;
        });
        if (saved) {
            conversations.value = conversations.value.map(item => (
                item.conversationKey === conversationKey
                    ? { ...item, pinned: saved.pinned, archived: saved.archived }
                    : item
            ));
        }
    }

    return {
        conversations,
        totalUnread,
        connected,
        error,
        supportConversation,
        connect,
        disconnect,
        refresh,
        markRead,
        upsertConversation,
        setConversationPref
    };
});
