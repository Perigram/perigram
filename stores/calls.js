import { defineStore } from 'pinia';
import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue';
import { useAuthStore } from './auth';
import { useConnections } from '~/composables/useConnections.js';
import { roomForConversationKey } from '#shared/call-rooms.js';

const CALL_DATA_TOPIC = 'call.events';

/**
 * Global call-activity store: the app's call line state machine
 * (canonical contract in components/calls/README.md) and the one live
 * room session every call surface renders as a view. The room, its event
 * binder, and its reactive participant/track state live here for the
 * whole connected lifetime; panels, dialogs, the floating window, and
 * the mobile lane are thin surfaces over the same state, so moving
 * between them never touches the connection.
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

    // Rooms with a mounted call surface (any stage), and rooms with an
    // open workspace call tab. A call tab keeps its session seated even
    // while inactive (the pane renders the selected tab only): the
    // auto-surface rule parks into the floating window (desktop) or the
    // mobile lane exactly when the session has neither.
    const mountedRooms = reactive(new Set());
    const callTabs = reactive(new Set());

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
            if (session.value?.name === invite.room) continue;
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
            unsubscribeOrg = connections.subscribe(`org:${organizationId}`, scheduleRefresh);
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
        resetCallTabs();
        teardownSession();
        connected.value = false;
    }

    // A conversation's ongoing room: the room derived from the conversation
    // key must currently appear in the active snapshot.
    function activeRoomForConversation(conversationKey = '') {
        const room = roomForConversationKey(conversationKey, userId.value);
        if (!room) return null;
        return activeRooms.value.find(item => item.room === room) || null;
    }

    // ------------------------------------------------------------------
    // The live room session. One room is connected at a time; surfaces are
    // views. `session` is a shallowRef: it holds the LiveKit Room raw and
    // a reactive state block the surfaces render from.
    // ------------------------------------------------------------------

    const session = shallowRef(null);
    const joinedRooms = new Set();

    function newSessionState(name) {
        return reactive({
            name,
            state: 'connecting', // connecting | connected | failed
            error: '',
            reconnecting: false,
            micEnabled: false,
            camEnabled: false,
            sharing: false,
            handRaised: false,
            layout: 'speaker',
            // Speaker-layout maximize: the film strip hides and the focus
            // stream fills the stage.
            focusMaximized: false,
            pinnedKey: '',
            activeSpeakerKey: '',
            participants: [],
            remoteAudioTracks: [],
            reactions: [],
            devices: { audioinput: '', videoinput: '', audiooutput: '' },
            audioInputs: [],
            videoInputs: [],
            audioOutputs: []
        });
    }

    const participantKey = (identity, source) => `${identity}:${source}`;

    function ensureParticipant(room, identity, isLocal = false) {
        const state = session.value.state;
        let participant = state.participants.find(entry => entry.identity === identity);
        if (!participant) {
            const source = isLocal ? room.localParticipant : room.remoteParticipants.get(identity);
            participant = reactive({
                identity,
                name: source?.name || identity,
                isLocal,
                speaking: false,
                audioLevel: 0,
                handRaised: false,
                quality: 'unknown',
                audioMuted: false,
                cameraTrack: null,
                cameraMuted: false,
                screenTrack: null
            });
            state.participants.push(participant);
        }
        return participant;
    }

    function syncLocalEnabled() {
        const entry = session.value;
        if (!entry?.room) return;
        const local = entry.room.localParticipant;
        entry.state.micEnabled = local.isMicrophoneEnabled;
        entry.state.camEnabled = local.isCameraEnabled;
        entry.state.sharing = local.isScreenShareEnabled;
    }

    function setCameraTrack(participant, track, muted = false) {
        participant.cameraTrack = track ? markRaw(track) : null;
        participant.cameraMuted = muted;
    }

    function setScreenTrack(participant, track) {
        participant.screenTrack = track ? markRaw(track) : null;
    }

    function dropParticipant(identity) {
        const state = session.value?.state;
        if (!state) return;
        const index = state.participants.findIndex(entry => entry.identity === identity);
        if (index >= 0) state.participants.splice(index, 1);
        if (state.activeSpeakerKey.startsWith(`${identity}:`)) state.activeSpeakerKey = '';
    }

    async function enumerateSessionDevices() {
        const entry = session.value;
        if (!entry || process.server) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            entry.state.audioInputs = devices.filter(device => device.kind === 'audioinput');
            entry.state.videoInputs = devices.filter(device => device.kind === 'videoinput');
            entry.state.audioOutputs = devices.filter(device => device.kind === 'audiooutput');
        } catch {
            entry.state.audioInputs = [];
            entry.state.videoInputs = [];
            entry.state.audioOutputs = [];
        }
    }

    function bindSessionEvents(entry) {
        const { room, LiveKit, state } = entry;
        room
            .on(LiveKit.RoomEvent.ParticipantConnected, participant => {
                ensureParticipant(room, participant.identity);
            })
            .on(LiveKit.RoomEvent.ParticipantDisconnected, participant => {
                dropParticipant(participant.identity);
            })
            .on(LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
                const target = ensureParticipant(room, participant.identity, participant.isLocal);
                if (track.kind === LiveKit.Track.Kind.Video) {
                    if (track.source === LiveKit.Track.Source.ScreenShare) setScreenTrack(target, track);
                    else setCameraTrack(target, track);
                    return;
                }
                if (track.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                    const audio = state.remoteAudioTracks;
                    if (!audio.includes(track)) audio.push(markRaw(track));
                }
            })
            .on(LiveKit.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                const target = state.participants.find(item => item.identity === participant.identity);
                if (track.kind === LiveKit.Track.Kind.Video) {
                    if (!target) return;
                    if (track.source === LiveKit.Track.Source.ScreenShare) setScreenTrack(target, null);
                    else setCameraTrack(target, null);
                    return;
                }
                if (track.kind === LiveKit.Track.Kind.Audio && !participant.isLocal) {
                    const index = state.remoteAudioTracks.indexOf(track);
                    if (index >= 0) state.remoteAudioTracks.splice(index, 1);
                }
            })
            .on(LiveKit.RoomEvent.TrackUnpublished, (publication, participant) => {
                if (publication.kind !== LiveKit.Track.Kind.Video) return;
                const target = state.participants.find(item => item.identity === participant.identity);
                if (!target) return;
                if (publication.source === LiveKit.Track.Source.ScreenShare) setScreenTrack(target, null);
                else setCameraTrack(target, null);
            })
            .on(LiveKit.RoomEvent.LocalTrackPublished, (publication, participant) => {
                const target = ensureParticipant(room, participant.identity, true);
                if (publication.kind !== LiveKit.Track.Kind.Video) return;
                if (publication.source === LiveKit.Track.Source.ScreenShare) setScreenTrack(target, publication.track);
                else setCameraTrack(target, publication.track);
                syncLocalEnabled();
            })
            .on(LiveKit.RoomEvent.LocalTrackUnpublished, () => {
                syncLocalEnabled();
            })
            .on(LiveKit.RoomEvent.TrackMuted, (publication, participant) => {
                const target = state.participants.find(item => item.identity === participant.identity);
                if (publication.kind === LiveKit.Track.Kind.Audio) {
                    if (participant.isLocal) state.micEnabled = false;
                    if (target) target.audioMuted = true;
                } else if (target && !participant.isLocal) {
                    setCameraTrack(target, target.cameraTrack, true);
                }
            })
            .on(LiveKit.RoomEvent.TrackUnmuted, (publication, participant) => {
                const target = state.participants.find(item => item.identity === participant.identity);
                if (publication.kind === LiveKit.Track.Kind.Audio) {
                    if (participant.isLocal) state.micEnabled = true;
                    if (target) target.audioMuted = false;
                } else if (target && !participant.isLocal) {
                    setCameraTrack(target, target.cameraTrack, false);
                }
            })
            .on(LiveKit.RoomEvent.ActiveSpeakersChanged, speakers => {
                const levels = new Map();
                for (const speaker of speakers) {
                    levels.set(speaker.identity, speaker.audioLevel || 0.6);
                }
                for (const participant of state.participants) {
                    participant.speaking = levels.has(participant.identity);
                    participant.audioLevel = levels.get(participant.identity) || 0;
                }
                const top = speakers[0];
                state.activeSpeakerKey = top ? participantKey(top.identity, 'camera') : '';
            })
            .on(LiveKit.RoomEvent.ConnectionQualityChanged, (quality, participant) => {
                const target = state.participants.find(item => item.identity === participant.identity)
                    || (participant.isLocal ? ensureParticipant(room, participant.identity, true) : null);
                if (target) target.quality = quality;
            })
            .on(LiveKit.RoomEvent.MediaDevicesChanged, () => {
                enumerateSessionDevices();
            })
            .on(LiveKit.RoomEvent.Reconnecting, () => { state.reconnecting = true; })
            .on(LiveKit.RoomEvent.Reconnected, () => { state.reconnecting = false; })
            .on(LiveKit.RoomEvent.Disconnected, () => {
                if (leavingSession) return;
                state.reconnecting = false;
                state.state = 'failed';
                state.error = 'disconnected';
                leaveRoom(state.name);
            })
            .on(LiveKit.RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
                if (topic !== CALL_DATA_TOPIC) return;
                receiveCallEvent(participant.identity, participant.name, payload);
            });
    }

    function receiveCallEvent(identity, name, payload) {
        let event;
        try {
            event = JSON.parse(new TextDecoder().decode(payload));
        } catch {
            return;
        }
        const state = session.value?.state;
        if (!state) return;
        if (event?.type === 'hand') {
            const target = state.participants.find(item => item.identity === identity);
            if (target) target.handRaised = Boolean(event.raised);
        } else if (event?.type === 'reaction' && event.emoji) {
            state.reactions.push({
                id: `reaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                emoji: event.emoji,
                name: name || identity,
                left: 10 + Math.random() * 75
            });
            if (state.reactions.length > 12) state.reactions.splice(0, state.reactions.length - 12);
        }
    }

    function removeReaction(id) {
        const state = session.value?.state;
        if (!state) return;
        const index = state.reactions.findIndex(reaction => reaction.id === id);
        if (index >= 0) state.reactions.splice(index, 1);
    }

    let leavingSession = false;

    async function teardownSession() {
        const entry = session.value;
        if (!entry) return;
        leavingSession = true;
        session.value = null;
        try {
            entry.room.removeAllListeners?.();
        } catch {
            /* best-effort listener cleanup */
        }
        entry.room.disconnect?.().catch?.(() => {});
        leaveRoom(entry.state.name);
        if (floatingRoom.value === entry.state.name) floatingRoom.value = '';
        leavingSession = false;
    }

    /**
     * Connects the session room. Device failures are per-track: each is
     * reported back to the caller (for a localized toast) and the call
     * continues with that track off; only a failed connection fails the
     * session.
     */
    async function openSession(roomName = '', prejoin = {}) {
        if (session.value && session.value.state.name === roomName) return { deviceErrors: [] };
        if (session.value) await teardownSession();
        let LiveKit;
        try {
            LiveKit = await import('livekit-client');
        } catch (importError) {
            console.error('Failed to load livekit-client:', importError);
            return { fatal: importError?.message || 'livekit-client failed to load' };
        }
        const entry = { room: markRaw(new LiveKit.Room({ adaptiveStream: true, dynacast: true })), LiveKit: markRaw(LiveKit), state: newSessionState(roomName) };
        session.value = entry;
        try {
            const grant = await $fetch('/api/livekit/token', { method: 'POST', body: { room: roomName } });
            bindSessionEvents(entry);
            await entry.room.connect(grant.url, grant.token);
        } catch (connectError) {
            console.error('Failed to join call:', connectError);
            entry.state.state = 'failed';
            entry.state.error = connectError?.data?.message || connectError?.message || '';
            return { fatal: entry.state.error };
        }
        const local = entry.room.localParticipant;
        ensureParticipant(entry.room, local.identity, true);
        for (const participant of entry.room.remoteParticipants.values()) {
            const target = ensureParticipant(entry.room, participant.identity);
            for (const publication of participant.trackPublications.values()) {
                if (!publication.track || !publication.isSubscribed) continue;
                if (publication.kind !== LiveKit.Track.Kind.Video) continue;
                if (publication.source === LiveKit.Track.Source.ScreenShare) setScreenTrack(target, publication.track);
                else setCameraTrack(target, publication.track, publication.isMuted);
            }
            for (const publication of participant.trackPublications.values()) {
                const track = publication.track;
                if (track && publication.kind === LiveKit.Track.Kind.Audio && publication.isSubscribed) {
                    if (!entry.state.remoteAudioTracks.includes(track)) entry.state.remoteAudioTracks.push(markRaw(track));
                }
            }
        }
        const deviceErrors = [];
        try {
            await local.setMicrophoneEnabled(prejoin.micEnabled !== false, {
                deviceId: prejoin.deviceId?.audioinput || undefined
            });
        } catch (micError) {
            deviceErrors.push({ device: 'microphone', message: micError?.message || '' });
        }
        try {
            await local.setCameraEnabled(Boolean(prejoin.cameraEnabled), {
                deviceId: prejoin.deviceId?.videoinput || undefined
            });
        } catch (cameraError) {
            deviceErrors.push({ device: 'camera', message: cameraError?.message || '' });
        }
        // The session may have been torn down while the devices opened
        // (the call tab closed mid-join): the detached entry goes quiet.
        if (session.value !== entry) return { deviceErrors };
        syncLocalEnabled();
        const self = ensureParticipant(entry.room, local.identity, true);
        self.cameraMuted = !entry.state.camEnabled;
        entry.state.state = 'connected';
        enumerateSessionDevices();
        joinRoom(roomName);
        return { deviceErrors };
    }

    async function leaveSession() {
        await teardownSession();
    }

    async function toggleMic() {
        const entry = session.value;
        if (!entry) return null;
        const local = entry.room.localParticipant;
        try {
            await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
        } catch (deviceError) {
            syncLocalEnabled();
            return { device: 'microphone', message: deviceError?.message || '' };
        }
        syncLocalEnabled();
        const self = entry.state.participants.find(item => item.isLocal);
        if (self) self.audioMuted = !entry.state.micEnabled;
        return null;
    }

    async function toggleCamera() {
        const entry = session.value;
        if (!entry) return null;
        const local = entry.room.localParticipant;
        try {
            await local.setCameraEnabled(!local.isCameraEnabled);
        } catch (deviceError) {
            syncLocalEnabled();
            return { device: 'camera', message: deviceError?.message || '' };
        }
        syncLocalEnabled();
        const self = entry.state.participants.find(item => item.isLocal);
        if (self) setCameraTrack(self, self.cameraTrack, !entry.state.camEnabled);
        return null;
    }

    async function toggleShare() {
        const entry = session.value;
        if (!entry) return null;
        const local = entry.room.localParticipant;
        try {
            await local.setScreenShareEnabled(!local.isScreenShareEnabled);
        } catch (shareError) {
            syncLocalEnabled();
            return { device: 'share', message: shareError?.message || '' };
        }
        syncLocalEnabled();
        return null;
    }

    async function switchDevice(kind, id) {
        const entry = session.value;
        if (!entry || !id) return;
        entry.state.devices[kind] = id;
        try {
            if (kind === 'audiooutput') await entry.room.switchActiveDevice('audiooutput', id);
            else await entry.room.localParticipant.switchActiveDevice(kind, id);
        } catch (switchError) {
            console.error(`Failed to switch ${kind}:`, switchError);
        }
    }

    function toggleHand() {
        const entry = session.value;
        if (!entry) return;
        entry.state.handRaised = !entry.state.handRaised;
        publishCallEvent({ type: 'hand', raised: entry.state.handRaised });
        const self = entry.state.participants.find(item => item.isLocal);
        if (self) self.handRaised = entry.state.handRaised;
    }

    function sendReaction(emoji) {
        const entry = session.value;
        if (!entry) return;
        publishCallEvent({ type: 'reaction', emoji });
        receiveCallEvent(entry.room.localParticipant.identity, entry.room.localParticipant.name || '',
            new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji })));
    }

    function publishCallEvent(payload) {
        const entry = session.value;
        if (!entry) return;
        entry.room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(payload)),
            { reliable: true, topic: CALL_DATA_TOPIC }
        ).catch(() => {});
    }

    function togglePin(key = '') {
        const state = session.value?.state;
        if (!state) return;
        state.pinnedKey = state.pinnedKey === key ? '' : key;
    }

    function setLayout(layout = 'speaker') {
        const state = session.value?.state;
        if (state) state.layout = layout;
    }

    function toggleFocusMaximized() {
        const state = session.value?.state;
        if (state) state.focusMaximized = !state.focusMaximized;
    }

    // Surface registry: panels register their room while mounted. The live
    // session with no mounted surface parks into the desktop floating
    // window (SPEC §11); mobile surfaces never set floatingRoom, so the
    // media dock's call lane entry takes over there. A pending tab room
    // suspends the rule while the home workspace mounts the adopting tab.
    function mountSurface(roomName = '') {
        if (roomName) mountedRooms.add(roomName);
    }

    function unmountSurface(roomName = '') {
        mountedRooms.delete(roomName);
    }

    function tabOpened(roomName = '') {
        if (roomName) callTabs.add(roomName);
    }

    function tabClosed(roomName = '') {
        if (!roomName || !callTabs.has(roomName)) return;
        callTabs.delete(roomName);
        // Closing the call tab ends the call. A dispatched call keeps its
        // floating surface (floatingRoom holds the room), and route leaves
        // clear the registry without this path, so the floating window
        // takes those sessions (SPEC §11).
        const entry = session.value;
        if (entry && entry.state.name === roomName && floatingRoom.value !== roomName) {
            teardownSession();
        }
    }

    // The home workspace unmounts on route leave; its call tabs go with
    // it, and the floating-window rule takes over (SPEC §11).
    function resetCallTabs() {
        callTabs.clear();
    }

    const isDesktopViewport = () => process.client
        && window.matchMedia?.('(min-width: 768px)')?.matches;

    watch(() => [session.value?.state?.state, session.value?.state?.name, pendingTabRoom.value, mountedRooms.size, callTabs.size], () => {
        const entry = session.value;
        if (!entry || entry.state.state !== 'connected') return;
        if (pendingTabRoom.value) return;
        if (mountedRooms.has(entry.state.name)) return;
        if (callTabs.has(entry.state.name)) return;
        if (floatingRoom.value === entry.state.name) return;
        if (isDesktopViewport()) floatingRoom.value = entry.state.name;
    });

    function closeFloating() {
        floatingRoom.value = '';
    }

    // The floating window as an opening surface (the routing fallback for
    // organizations with no generated home workspace).
    function setFloating(room = '') {
        if (room) floatingRoom.value = room;
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
        mountedRooms,
        callTabs,
        tabOpened,
        tabClosed,
        resetCallTabs,
        session,
        connect,
        disconnect,
        refresh,
        pushIncoming,
        dismissIncoming,
        acceptInvite,
        consumePendingTabRoom,
        joinRoom,
        leaveRoom,
        openSession,
        leaveSession,
        toggleMic,
        toggleCamera,
        toggleShare,
        switchDevice,
        toggleHand,
        sendReaction,
        removeReaction,
        togglePin,
        setLayout,
        toggleFocusMaximized,
        mountSurface,
        unmountSurface,
        closeFloating,
        setFloating,
        activeRoomForConversation
    };
});
