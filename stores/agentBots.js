import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

/**
 * The organization AI's client state: the assistant contact row for the
 * chat pickers and the room's AI panel (subscription flag, model pin,
 * wake rules), plus the org's chat model tables. `canChat` is the
 * role-capability gate — members without it see no AI anywhere.
 */
export const useAgentBotsStore = defineStore('agentBots', () => {
    const authStore = useAuthStore();
    const ai = ref(null);
    const canChat = ref(false);
    const chatProfiles = ref([]);
    const chatModels = ref([]);
    const chatRouteModel = ref('');
    const loaded = ref(false);

    /**
     * The member-visible AI contact (the chat pickers' AI row and the
     * room's AI panel): ensures the org assistant exists and decorates it
     * with the conversation's subscription flag and wake rules.
     */
    async function fetchContacts(conversationKey = '') {
        if (process.server || !authStore.userIsSet) return;
        try {
            const query = conversationKey ? `?conversationKey=${encodeURIComponent(conversationKey)}` : '';
            const response = await $fetch(`/api/agent-bots/contacts${query}`);
            ai.value = response?.assistant || null;
            canChat.value = Boolean(response?.canChat);
            chatProfiles.value = response?.chatProfiles || [];
            chatModels.value = response?.chatModels || [];
            chatRouteModel.value = response?.chatRouteModel || '';
            loaded.value = true;
        } catch (err) {
            console.error('Failed to load the AI contact:', err);
            ai.value = null;
            canChat.value = false;
        }
    }

    async function setSubscribed(conversationKey, subscribed) {
        await $fetch('/api/agent-bots/subscriptions', {
            method: subscribed ? 'POST' : 'DELETE',
            body: { conversationKey }
        });
        ai.value = ai.value ? { ...ai.value, subscribed } : ai.value;
    }

    /**
     * A fresh AI chat thread: the room is created server-side with the
     * caller and the assistant, titled by the first message (the caller
     * passes it; empty falls back to the assistant's name).
     */
    async function createChat(name = '') {
        return await $fetch('/api/agent-bots/chats', {
            method: 'POST',
            body: { name }
        });
    }

    async function setConversationProfile(conversationKey, profile, model = '') {
        await $fetch('/api/agent-bots/subscriptions', {
            method: 'POST',
            body: { conversationKey, profile, model }
        });
        if (ai.value) ai.value = { ...ai.value, profile, model };
    }

    async function setSubscriptionRules(conversationKey, wakeOn) {
        await $fetch('/api/agent-bots/subscriptions', {
            method: 'POST',
            body: { conversationKey, wakeOn }
        });
        await fetchContacts(conversationKey);
    }

    async function fetchWakeOptions() {
        try {
            return (await $fetch('/api/agent-bots/wake-options')) || [];
        } catch (err) {
            console.error('Failed to load wake options:', err);
            return [];
        }
    }

    function reset() {
        ai.value = null;
        canChat.value = false;
        chatProfiles.value = [];
        chatModels.value = [];
        chatRouteModel.value = '';
        loaded.value = false;
    }

    /**
     * Select options over the org's chat profiles, with the leading
     * "fall back to the org chat route" choice. Rows show the model each
     * profile routes to — the model is what is being chosen. One home for
     * every model picker that sets a chat execution point.
     */
    function chatProfileOptions(autoLabel) {
        return [
            { label: autoLabel, value: '' },
            ...chatProfiles.value.map(profile => ({ label: profile.model || profile.id, value: profile.id }))
        ];
    }

    const subscribedIn = computed(() => Boolean(ai.value?.subscribed));

    return {
        ai,
        canChat,
        chatProfiles,
        chatModels,
        chatRouteModel,
        loaded,
        subscribedIn,
        fetchContacts,
        createChat,
        setSubscribed,
        setConversationProfile,
        setSubscriptionRules,
        fetchWakeOptions,
        chatProfileOptions,
        reset
    };
});
