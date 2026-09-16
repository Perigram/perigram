import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';
import { useConnections } from '~/composables/useConnections.js';
import { roomForConversationKey } from '~/utils/call-rooms.js';

/**
 * Global call-activity store: one shared surface for active call rooms and
 * incoming call invites. The server publishes `call.invite` on the callee's
 * user topic when a room is rung and `call.activity` on the participants'
 * user/org topics for every LiveKit room webhook (see
 * `server/features/livekit/service.js`); the store subscribes once for the
 * whole app so the sidebar, chats, and the floating notifications all see
 * the same snapshot without per-surface polling.
 */
export const useCallsStore = defineStore('calls', () => {
    const authStore = useAuthStore();

    const activeRooms = ref([]);
    const incoming = ref([]);
    const connected = ref(false);

    let unsubscribeUser = null;
    let unsubscribeOrg = null;
    let refreshTimer = null;
    const inviteTimers = new Map();

    const userId = computed(() => String(
        authStore.userData?.id || authStore.userData?.userId || authStore.userData?._id || ''
    ));
    const organizationId = computed(() => String(
        authStore.organizationData?._id || authStore.userData?.organizationId || ''
    ));

    async function refresh() {
        if (process.server || !authStore.userIsSet) return;
        try {
            activeRooms.value = await $fetch('/api/livekit/active-rooms');
        } catch {
            activeRooms.value = [];
        }
    }

    function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            refresh();
        }, 1000);
    }

    // Incoming invites stay visible for a short window: they are live
    // notifications, not persistent state — the sidebar's active-rooms list
    // is the durable entry point for rooms that are still running.
    function pushIncoming(payload = {}) {
        if (!payload?.room || payload.from === userId.value) return;
        dismissIncoming(payload.room);
        const invite = {
            id: `${payload.room}:${Date.now()}`,
            room: payload.room,
            conversationKey: payload.conversationKey || '',
            from: payload.from || '',
            fromName: payload.fromName || ''
        };
        incoming.value = [...incoming.value, invite];
        inviteTimers.set(invite.room, setTimeout(() => dismissIncoming(invite.room), 30000));
    }

    function dismissIncoming(roomOrId = '') {
        incoming.value = incoming.value.filter(item => item.room !== roomOrId && item.id !== roomOrId);
        const timer = inviteTimers.get(roomOrId);
        if (timer) {
            clearTimeout(timer);
            inviteTimers.delete(roomOrId);
        }
    }

    // A conversation's ongoing room: the room derived from the conversation
    // key must currently appear in the active snapshot.
    function activeRoomForConversation(conversationKey = '') {
        const room = roomForConversationKey(conversationKey, userId.value);
        if (!room) return null;
        return activeRooms.value.find(item => item.room === room) || null;
    }

    function handleUserEvent(payload) {
        if (payload?.type === 'call.invite') {
            pushIncoming(payload);
            scheduleRefresh();
            return;
        }
        if (payload?.type === 'call.activity') scheduleRefresh();
    }

    function connect() {
        if (connected.value || process.server || !authStore.userIsSet) return;
        if (userId.value && !unsubscribeUser) {
            unsubscribeUser = useConnections().subscribe(`user:${userId.value}`, handleUserEvent);
        }
        if (organizationId.value && !unsubscribeOrg) {
            unsubscribeOrg = useConnections().subscribe(`org:${organizationId.value}`, scheduleRefresh);
        }
        connected.value = true;
        refresh();
    }

    function disconnect() {
        if (unsubscribeUser) {
            unsubscribeUser();
            unsubscribeUser = null;
        }
        if (unsubscribeOrg) {
            unsubscribeOrg();
            unsubscribeOrg = null;
        }
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        for (const timer of inviteTimers.values()) clearTimeout(timer);
        inviteTimers.clear();
        incoming.value = [];
        activeRooms.value = [];
        connected.value = false;
    }

    return {
        activeRooms,
        incoming,
        connected,
        connect,
        disconnect,
        refresh,
        pushIncoming,
        dismissIncoming,
        activeRoomForConversation
    };
});
