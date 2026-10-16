import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from '~/stores/auth';

/**
 * Org bot administration state for the chat surfaces: the picker rows for
 * one conversation (bots with their subscription flag) and the created
 * bot's one-time token reveal. Server gates everything through user
 * management access; a 403 here means the surface stays hidden.
 */
export const useAgentBotsStore = defineStore('agentBots', () => {
    const authStore = useAuthStore();
    const bots = ref([]);
    const loaded = ref(false);
    const forbidden = ref(false);
    const contacts = ref([]);
    const chatProfiles = ref([]);
    const chatModels = ref([]);
    const assistantId = ref(null);

    const canManageBots = computed(() => authStore.hasTenantPermission?.('users', 'admin'));

    /**
     * Member-visible bot contacts (the AI rows in chat pickers and the
     * per-conversation bot sheet): ensures the org assistant exists and
     * decorates rows with the conversation's subscription flag and wake
     * rules. Administration stays manager-gated.
     */
    async function fetchContacts(conversationKey = '') {
        if (process.server || !authStore.userIsSet) return;
        try {
            const query = conversationKey ? `?conversationKey=${encodeURIComponent(conversationKey)}` : '';
            const response = await $fetch(`/api/agent-bots/contacts${query}`);
            contacts.value = response?.contacts || [];
            chatProfiles.value = response?.chatProfiles || [];
            chatModels.value = response?.chatModels || [];
            assistantId.value = response?.assistantId || null;
            loaded.value = true;
        } catch (err) {
            console.error('Failed to load bot contacts:', err);
            contacts.value = [];
        }
    }

    async function refresh(conversationKey = '') {
        if (process.server || !authStore.userIsSet) return;
        forbidden.value = false;
        try {
            const query = conversationKey ? `?conversationKey=${encodeURIComponent(conversationKey)}` : '';
            bots.value = (await $fetch(`/api/agent-bots${query}`)) || [];
            loaded.value = true;
        } catch (err) {
            if (err?.status === 403 || err?.statusCode === 403 || err?.response?.status === 403) {
                forbidden.value = true;
                bots.value = [];
            } else {
                console.error('Failed to load agent bots:', err);
            }
        }
    }

    async function createBot({ name } = {}) {
        const created = await $fetch('/api/agent-bots', { method: 'POST', body: { name } });
        return created;
    }

    async function deleteBot(botId) {
        await $fetch(`/api/agent-bots/${botId}`, { method: 'DELETE' });
    }

    async function rotateBotToken(botId) {
        return await $fetch(`/api/agent-bots/${botId}/token`, { method: 'POST' });
    }

    async function setSubscribed(botId, conversationKey, subscribed) {
        await $fetch('/api/agent-bots/subscriptions', {
            method: subscribed ? 'POST' : 'DELETE',
            body: { botId, conversationKey }
        });
        contacts.value = contacts.value.map(bot => (
            String(bot.id) === String(botId) ? { ...bot, subscribed } : bot
        ));
        bots.value = bots.value.map(bot => (
            String(bot.id) === String(botId) ? { ...bot, subscribed } : bot
        ));
    }

    async function fetchWakeOptions() {
        try {
            return (await $fetch('/api/agent-bots/wake-options')) || [];
        } catch (err) {
            console.error('Failed to load wake options:', err);
            return [];
        }
    }

    async function setSubscriptionProfile(botId, conversationKey, profile, model = '') {
        await $fetch('/api/agent-bots/subscriptions', {
            method: 'POST',
            body: { botId, conversationKey, profile, model }
        });
        contacts.value = contacts.value.map(bot => (
            String(bot.id) === String(botId) ? { ...bot, profile, model } : bot
        ));
    }

    async function setSubscriptionRules(botId, conversationKey, wakeOn) {
        await $fetch('/api/agent-bots/subscriptions', {
            method: 'POST',
            body: { botId, conversationKey, wakeOn }
        });
        await fetchContacts(conversationKey);
    }

    function reset() {
        bots.value = [];
        loaded.value = false;
        forbidden.value = false;
        contacts.value = [];
        chatProfiles.value = [];
        assistantId.value = null;
    }

    /**
     * Select options over the org's chat profiles, with the leading
     * "fall back to the bot's own brain" choice. Rows show the model each
     * profile routes to — the model is what is being chosen. One home for
     * every model picker that sets a chat execution point.
     */
    function chatProfileOptions(autoLabel) {
        return [
            { label: autoLabel, value: '' },
            ...chatProfiles.value.map(profile => ({ label: profile.model || profile.id, value: profile.id }))
        ];
    }

    return {
        bots,
        loaded,
        forbidden,
        contacts,
        chatProfiles,
        chatModels,
        assistantId,
        canManageBots,
        refresh,
        fetchContacts,
        createBot,
        deleteBot,
        rotateBotToken,
        setSubscribed,
        setSubscriptionProfile,
        fetchWakeOptions,
        setSubscriptionRules,
        chatProfileOptions,
        reset
    };
});
