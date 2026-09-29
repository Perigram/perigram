import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAuthStore } from './auth';
import { useConnections } from '~/composables/useConnections.js';
import { roomForConversationKey } from '~/utils/call-rooms.js';

/**
 * Global call-activity store and the app's call line state machine.
 *
 * Activity half: the server publishes `call.invite` on the callee's user
 * topic when a room is rung and `call.activity` on the participants'
 * user/org topics for every LiveKit room webhook (see
 * `server/features/livekit/service.js`); the store subscribes once for the
 * whole app so the sidebar, chats, and the floating notifications all see
 * the same snapshot without per-surface polling.
 *
 * Line half — one explicit state machine owns the user's call so every
 * surface agrees (this is what used to let one surface keep "ringing"
 * after another accepted the same call):
 *
 *   idle ──invite──▶ ringing ──accept──▶ joining ──CallPanel connected──▶ in-call
 *     ▲                 │                                    │              │
 *     └── decline/TTL ──┘◄────────────────────────────────────┴── leave ─────┘
 *
 * `acceptInvite` routes the call to the home workspace tab; surface-specific
 * fallbacks (mobile dialog, floating window when no workspace exists) are
 * chosen by the callers through the store's floating/pending fields.
 */
export const useCallsStore = defineStore('calls', () => {
    const authStore = useAuthStore();

    const activeRooms = ref([]);
    const recordings = ref([]);
    const incoming = ref([]);
    const connected = ref(false);

    const status = ref('idle');
    const activeRoom = ref('');
    const pendingTabRoom = ref('');
    const floatingRoom = ref('');
    // Live rooms parked during a surface transfer (tab → floating window or
    // the reverse): the WebRTC connection survives; the adopting CallPanel
    // takes it over.
    const parkedRoom = ref('');
    const transferRoom = ref('');
    const liveRooms = new Map();

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
        try {
            // Recording state rides the same refresh as active rooms:
            // egress events arrive as `call.activity` payloads and debounce
            // into this snapshot, so toggles and dots never need their own
            // subscription.
            recordings.value = await $fetch('/api/livekit/recordings');
        } catch {
            recordings.value = [];
        }
        reconcileInvitesWithSnapshot();
    }

    function roomRecording(room = '') {
        return recordings.value.find(item => item.room === room) || null;
    }

    // Room-scoped ring lifecycle: an invite lives while its room is alive —
    // the caller (or anyone) staying in it. When a refreshed snapshot no
    // longer lists the room, the ring stops immediately instead of waiting
    // out its TTL. Fresh invites get a grace window so a snapshot taken just
    // before the invite arrived cannot dismiss it.
    const INVITE_SNAPSHOT_GRACE_MS = 5000;

    function reconcileInvitesWithSnapshot() {
        const liveRooms = new Set(activeRooms.value.map(item => item.room));
        const now = Date.now();
        for (const invite of [...incoming.value]) {
            if (liveRooms.has(invite.room)) continue;
            if (now - (invite.at || 0) < INVITE_SNAPSHOT_GRACE_MS) continue;
            if (activeRoom.value === invite.room) continue;
            dismissIncoming(invite.room);
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
            fromName: payload.fromName || '',
            at: Date.now()
        };
        incoming.value = [...incoming.value, invite];
        if (status.value === 'idle' || status.value === 'ringing') status.value = 'ringing';
        inviteTimers.set(invite.room, setTimeout(() => dismissIncoming(invite.room), 30000));
    }

    function dismissIncoming(roomOrId = '') {
        incoming.value = incoming.value.filter(item => item.room !== roomOrId && item.id !== roomOrId);
        const timer = inviteTimers.get(roomOrId);
        if (timer) {
            clearTimeout(timer);
            inviteTimers.delete(roomOrId);
        }
        if (!incoming.value.length && status.value === 'ringing') status.value = 'idle';
    }

    // Accepting an invite is a single global transition: every ring for that
    // room clears everywhere, and the call opens as a home workspace tab
    // (consumed by the workspace's pending-tab watcher).
    function acceptInvite(invite = {}) {
        if (!invite.room) return;
        dismissIncoming(invite.room);
        pendingTabRoom.value = invite.room;
        status.value = 'joining';
    }

    function consumePendingTabRoom() {
        pendingTabRoom.value = '';
    }

    // CallPanel reports the live connection; joining the room stops every
    // remaining ring for it (the fix for surfaces that kept ringing).
    function joinRoom(room = '') {
        if (!room) return;
        activeRoom.value = room;
        status.value = 'in-call';
        for (const invite of incoming.value.filter(item => item.room === room)) {
            dismissIncoming(invite.room);
        }
        if (pendingTabRoom.value === room) pendingTabRoom.value = '';
    }

    function leaveRoom(room = '') {
        if (room && activeRoom.value !== room) return;
        activeRoom.value = '';
        status.value = incoming.value.length ? 'ringing' : 'idle';
    }

    // The floating window: a popped-out call that stays above the app.
    function setFloating(room = '') {
        if (!room) return;
        floatingRoom.value = room;
        status.value = 'joining';
    }

    function closeFloating() {
        floatingRoom.value = '';
    }

    function popOutToFloating(room = '') {
        if (!room) return;
        transferRoom.value = room;
        floatingRoom.value = room;
    }

    // Docking hands the floating call back to a home workspace tab; the
    // floating window closes and the tab's panel adopts the parked room.
    function beginTransferToTab(room = '') {
        if (!room) return;
        transferRoom.value = room;
        floatingRoom.value = '';
    }

    // Surface transfer: park the connected room (its CallPanel is unmounting
    // because the call moved to the floating window), then hand it to the
    // adopting panel. The connection is never dropped mid-transfer.
    function parkLiveRoom(name = '', livekitRoomInstance = null, liveKitLib = null) {
        if (!name || !livekitRoomInstance) return;
        liveRooms.set(name, { room: livekitRoomInstance, LiveKit: liveKitLib });
        parkedRoom.value = name;
    }

    function takeLiveRoom(name = '') {
        const entry = liveRooms.get(name) || null;
        liveRooms.delete(name);
        parkedRoom.value = '';
        if (transferRoom.value === name) transferRoom.value = '';
        return entry;
    }

    function dropLiveRoom(name = '') {
        const entry = liveRooms.get(name);
        liveRooms.delete(name);
        if (parkedRoom.value === name) parkedRoom.value = '';
        entry?.room?.disconnect?.().catch?.(() => {});
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
        recordings.value = [];
        status.value = 'idle';
        activeRoom.value = '';
        pendingTabRoom.value = '';
        floatingRoom.value = '';
        transferRoom.value = '';
        for (const name of [...liveRooms.keys()]) dropLiveRoom(name);
        connected.value = false;
    }

    return {
        activeRooms,
        recordings,
        roomRecording,
        incoming,
        connected,
        status,
        activeRoom,
        pendingTabRoom,
        floatingRoom,
        parkedRoom,
        transferRoom,
        connect,
        disconnect,
        refresh,
        pushIncoming,
        dismissIncoming,
        acceptInvite,
        consumePendingTabRoom,
        joinRoom,
        leaveRoom,
        setFloating,
        closeFloating,
        popOutToFloating,
        beginTransferToTab,
        parkLiveRoom,
        takeLiveRoom,
        dropLiveRoom,
        activeRoomForConversation
    };
});
