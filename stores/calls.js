import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useAuthStore } from './auth';
import { useConnections } from '~/composables/useConnections.js';
import { roomForConversationKey } from '#shared/call-rooms.js';

/**
 * Global call-activity store and the app's call line state machine. The
 * canonical contract (line states, room-scoped ringing, surface transfers)
 * lives in components/calls/README.md; the store subscribes once for the
 * whole app so every surface sees the same snapshot without per-surface
 * polling.
 */
export const useCallsStore = defineStore('calls', () => {
    const authStore = useAuthStore();
    const connections = useConnections();

    const activeRooms = ref([]);
    const recordings = ref([]);
    const incoming = ref([]);
    const connected = ref(false);

    const status = ref('idle');
    const activeRoom = ref('');
    const pendingTabRoom = ref('');
    const floatingRoom = ref('');
    // Live rooms parked during a surface transfer (tab → floating window or
    // the reverse) or into the mobile top lane: the WebRTC connection
    // survives and remote audio keeps playing through the store's hidden
    // sink; the adopting CallPanel takes the room — and its audio
    // attachments — over.
    const parkedRoom = ref('');
    const transferRoom = ref('');
    const liveRooms = new Map();
    const joinedRooms = new Set();
    // Hidden document-level sink keeping parked rooms audible; created
    // lazily client-side because the store also constructs on the server.
    let parkedAudioSink = null;
    function parkedAudioSinkEl() {
        if (!parkedAudioSink) {
            parkedAudioSink = document.createElement('div');
            parkedAudioSink.dataset.parkedCallAudio = '';
            parkedAudioSink.style.display = 'none';
            document.body.appendChild(parkedAudioSink);
        }
        return parkedAudioSink;
    }

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
        let roomsLoaded = false;
        try {
            activeRooms.value = await $fetch('/api/livekit/active-rooms');
            roomsLoaded = true;
        } catch {
            // Keep the last known snapshot: a failed refetch must not read
            // as "no calls running".
        }
        try {
            // Recording state rides the same refresh as active rooms:
            // egress events arrive as `call.activity` payloads and debounce
            // into this snapshot, so toggles and dots never need their own
            // subscription.
            recordings.value = await $fetch('/api/livekit/recordings');
        } catch {
            // Same policy as rooms: keep the last known snapshot.
        }
        if (roomsLoaded) reconcileInvitesWithSnapshot();
    }

    function roomRecording(room = '') {
        return recordings.value.find(item => item.room === room) || null;
    }

    // Room-scoped ring lifecycle: an invite is dropped only after its room
    // was observed running and then disappeared from the snapshot — the
    // caller (or anyone) was in it and left. A room the snapshot never saw
    // running never dismisses an invite: invites are published before the
    // caller joins, and a caller still on the pre-join screen must not kill
    // the callee's ring.
    function reconcileInvitesWithSnapshot() {
        const running = new Set(activeRooms.value.map(item => item.room));
        for (const invite of [...incoming.value]) {
            if (running.has(invite.room)) {
                invite.wasRunning = true;
                continue;
            }
            if (!invite.wasRunning) continue;
            if (joinedRooms.has(invite.room)) continue;
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
            fromAvatarUrl: payload.fromAvatarUrl || '',
            // Set by reconcileInvitesWithSnapshot once a snapshot lists the
            // room; only then can a later absence dismiss the invite.
            wasRunning: false
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

    // CallPanel reports live connections; joining the room stops every
    // remaining ring for it (the fix for surfaces that kept ringing). The
    // machine tolerates concurrent rooms: in-call holds until the last
    // joined room is left.
    function joinRoom(room = '') {
        if (!room) return;
        joinedRooms.add(room);
        activeRoom.value = room;
        status.value = 'in-call';
        for (const invite of incoming.value.filter(item => item.room === room)) {
            dismissIncoming(invite.room);
        }
        if (pendingTabRoom.value === room) pendingTabRoom.value = '';
    }

    function leaveRoom(room = '') {
        if (!room) return;
        joinedRooms.delete(room);
        if (joinedRooms.size) {
            if (activeRoom.value === room) activeRoom.value = [...joinedRooms][0];
            return;
        }
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

    // A transfer that cannot complete (the source panel was never connected,
    // so nothing will be parked): the adopting surface falls back to its own
    // pre-join stage.
    function abortTransfer(room = '') {
        if (room && transferRoom.value === room) transferRoom.value = '';
    }

    // Surface transfer: park the connected room (its CallPanel is unmounting
    // because the call moved to another surface), then hand it to the
    // adopting panel. The connection is never dropped mid-transfer. The
    // handed-off audio attachments (track + LiveKit-attached element pairs)
    // keep playing in the store's hidden sink, so a parked call stays
    // audible; the adopting panel moves the same elements into its own sink
    // without a gap.
    function parkLiveRoom(name = '', livekitRoomInstance = null, liveKitLib = null, audioAttachments = []) {
        if (!name || !livekitRoomInstance) return;
        liveRooms.set(name, { room: livekitRoomInstance, LiveKit: liveKitLib, audioAttachments });
        parkedRoom.value = name;
        if (process.client && audioAttachments.length) {
            const sink = parkedAudioSinkEl();
            for (const { element } of audioAttachments) sink.appendChild(element);
        }
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
        for (const { track, element } of entry?.audioAttachments || []) {
            try {
                if (track) track.detach(element);
            } catch {
                /* the track may already be gone */
            }
            element?.remove?.();
        }
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

    // Webhook events published while the connections stream was down never
    // arrive; a stream re-open therefore refetches the snapshot so missed
    // activity self-heals.
    let streamWasOpen = false;
    watch(connections.status, (next) => {
        if (next !== 'open') return;
        if (streamWasOpen) refresh();
        streamWasOpen = true;
    });

    function connect() {
        if (connected.value || process.server || !authStore.userIsSet) return;
        if (userId.value && !unsubscribeUser) {
            unsubscribeUser = connections.subscribe(`user:${userId.value}`, handleUserEvent);
        }
        if (organizationId.value && !unsubscribeOrg) {
            unsubscribeOrg = connections.subscribe(`org:${organizationId.value}`, scheduleRefresh);
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
        joinedRooms.clear();
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
        abortTransfer,
        parkLiveRoom,
        takeLiveRoom,
        dropLiveRoom,
        activeRoomForConversation
    };
});
