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

    const canManageBots = computed(() => authStore.hasTenantPermission?.('users', 'admin'));

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
        bots.value = bots.value.map(bot => (
            String(bot.id) === String(botId) ? { ...bot, subscribed } : bot
        ));
    }

    function reset() {
        bots.value = [];
        loaded.value = false;
        forbidden.value = false;
    }

    return {
        bots,
        loaded,
        forbidden,
        canManageBots,
        refresh,
        createBot,
        deleteBot,
        rotateBotToken,
        setSubscribed,
        reset
    };
});
