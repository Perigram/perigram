import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';
import { useCallsStore } from './calls.js';

vi.mock('~/composables/useConnections.js', async () => {
    const { ref } = await import('vue');
    let connectionStatus = ref('idle');
    return {
        // Swaps the ref so each test's store watcher binds to a fresh
        // stream status; earlier stores keep watching the detached ref.
        resetConnectionStatus: () => { connectionStatus = ref('idle'); },
        getConnectionStatus: () => connectionStatus,
        useConnections: () => ({ status: connectionStatus, subscribe: () => () => {} })
    };
});

const ROOM_EVENTS = {
    ParticipantConnected: 'ParticipantConnected',
    ParticipantDisconnected: 'ParticipantDisconnected',
    TrackSubscribed: 'TrackSubscribed',
    TrackUnsubscribed: 'TrackUnsubscribed',
    TrackUnpublished: 'TrackUnpublished',
    LocalTrackPublished: 'LocalTrackPublished',
    LocalTrackUnpublished: 'LocalTrackUnpublished',
    TrackMuted: 'TrackMuted',
    TrackUnmuted: 'TrackUnmuted',
    ActiveSpeakersChanged: 'ActiveSpeakersChanged',
    ConnectionQualityChanged: 'ConnectionQualityChanged',
    MediaDevicesChanged: 'MediaDevicesChanged',
    Reconnecting: 'Reconnecting',
    Reconnected: 'Reconnected',
    Disconnected: 'Disconnected',
    DataReceived: 'DataReceived'
};

vi.mock('livekit-client', () => ({
    Room: class FakeRoom {
        constructor() {
            this.handlers = new Map();
            this.localParticipant = {
                identity: 'me',
                name: 'Me',
                isMicrophoneEnabled: true,
                isCameraEnabled: false,
                isScreenShareEnabled: false,
                setMicrophoneEnabled: async () => {},
                setCameraEnabled: async () => {},
                setScreenShareEnabled: async () => {},
                publishData: async () => {},
                switchActiveDevice: async () => {}
            };
            this.remoteParticipants = new Map();
            this.connect = async () => {
                if (globalThis.__roomConnectError) throw globalThis.__roomConnectError;
            };
            this.disconnect = async () => {};
            this.removeAllListeners = () => this.handlers.clear();
            globalThis.__livekitRoom = this;
        }

        on(event, handler) {
            if (!this.handlers.has(event)) this.handlers.set(event, []);
            this.handlers.get(event).push(handler);
            return this;
        }

        emit(event, ...args) {
            for (const handler of this.handlers.get(event) || []) handler(...args);
        }
    },
    RoomEvent: ROOM_EVENTS,
    Track: {
        Kind: { Video: 'video', Audio: 'audio' },
        Source: { ScreenShare: 'screen' }
    }
}));

const emitRoomEvent = (event, ...args) => globalThis.__livekitRoom?.emit(event, ...args);

describe('calls store line machine', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
        globalThis.__roomConnectError = null;
        globalThis.__livekitRoom = null;
        const auth = useAuthStore();
        auth.user = { userId: 'me', organizationId: 'org-1' };
        auth.isUserSet = true;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const inviteFrom = (room, from = 'caller') => ({
        type: 'call.invite',
        room,
        conversationKey: 'direct:caller:me',
        from,
        fromName: 'Caller'
    });

    it('rings on invite and clears every ring for a room once anyone accepts it', () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:direct:caller:me'));
        expect(store.status).toBe('ringing');
        expect(store.incoming).toHaveLength(1);

        // Accepting is one global transition: the ring clears everywhere.
        store.acceptInvite(store.incoming[0]);
        expect(store.incoming).toEqual([]);
        expect(store.status).toBe('joining');
        expect(store.pendingTabRoom).toBe('call:direct:caller:me');

        // The connected panel reports the live room.
        store.joinRoom('call:direct:caller:me');
        expect(store.status).toBe('in-call');
        expect(store.activeRoom).toBe('call:direct:caller:me');
        store.consumePendingTabRoom();
    });

    it('joining the room stops a ring that arrived from another surface', () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:group:g1'));
        store.joinRoom('call:group:g1');
        expect(store.status).toBe('in-call');
        expect(store.incoming).toEqual([]);
    });

    it('falls back to ringing after leaving when another invite is pending', () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:group:g1'));
        store.joinRoom('call:group:g1');
        store.pushIncoming(inviteFrom('call:direct:other:me', 'other'));
        store.leaveRoom('call:group:g1');
        expect(store.status).toBe('ringing');
        expect(store.incoming.map(invite => invite.room)).toEqual(['call:direct:other:me']);
    });

    it('leaves the line idle after leaving with no pending invites', () => {
        const store = useCallsStore();
        store.joinRoom('call:group:g1');
        store.leaveRoom('call:group:g1');
        expect(store.status).toBe('idle');
        expect(store.activeRoom).toBe('');
    });

    it('holds in-call until the last joined room is left', () => {
        const store = useCallsStore();
        store.joinRoom('call:group:g1');
        store.joinRoom('call:direct:other:me');
        expect(store.activeRoom).toBe('call:direct:other:me');
        store.leaveRoom('call:direct:other:me');
        expect(store.status).toBe('in-call');
        expect(store.activeRoom).toBe('call:group:g1');
        store.leaveRoom('call:group:g1');
        expect(store.status).toBe('idle');
        expect(store.activeRoom).toBe('');
    });

    it('expires unanswered invites by TTL', () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:direct:caller:me'));
        vi.advanceTimersByTime(30_001);
        expect(store.incoming).toEqual([]);
        expect(store.status).toBe('idle');
    });

    it('stops ringing when the room dies while the invite is unanswered', async () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:direct:caller:me'));
        // The caller joined (the snapshot observed the room running), then
        // left before the callee answered: the next snapshot no longer
        // lists the room and the invite is past observing it.
        vi.stubGlobal('$fetch', vi.fn()
            .mockResolvedValueOnce([{ room: 'call:direct:caller:me', kind: 'direct', participants: 1 }])
            .mockResolvedValueOnce([]));
        await store.refresh();
        expect(store.incoming).toHaveLength(1);
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
        await store.refresh();
        expect(store.incoming).toEqual([]);
        expect(store.status).toBe('idle');
    });

    it('keeps invites alive while the caller has not joined yet', async () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:direct:caller:me'));
        // The room never appeared in a snapshot (the caller is still on the
        // pre-join screen): its absence must not read as "the call ended".
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
        await store.refresh();
        await store.refresh();
        expect(store.incoming).toHaveLength(1);
    });

    it('keeps the last known snapshot when a refetch fails', async () => {
        const store = useCallsStore();
        vi.stubGlobal('$fetch', vi.fn()
            .mockResolvedValueOnce([{ room: 'call:group:g1', kind: 'group', participants: 2 }])
            .mockResolvedValueOnce([]));
        await store.refresh();
        expect(store.activeRooms).toHaveLength(1);
        vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('boom')));
        await store.refresh();
        expect(store.activeRooms).toHaveLength(1);
    });

    it('refetches the snapshot when the connections stream re-opens', async () => {
        const connections = await import('~/composables/useConnections.js');
        connections.resetConnectionStatus();
        useCallsStore();
        const fetchMock = vi.fn().mockResolvedValue([]);
        vi.stubGlobal('$fetch', fetchMock);
        const connectionStatus = connections.getConnectionStatus();
        connectionStatus.value = 'idle';
        await nextTick();
        connectionStatus.value = 'open';
        await nextTick();
        expect(fetchMock).not.toHaveBeenCalled();
        connectionStatus.value = 'error';
        await nextTick();
        connectionStatus.value = 'open';
        await nextTick();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('maps a conversation to its ongoing room from the live snapshot', async () => {
        const store = useCallsStore();
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([
            { room: 'call:direct:caller:me', kind: 'direct', participants: 2 }
        ]));
        await store.refresh();
        const ongoing = store.activeRoomForConversation('direct:me:caller');
        expect(ongoing).toMatchObject({ room: 'call:direct:caller:me', participants: 2 });
        expect(store.activeRoomForConversation('direct:me:someone-else')).toBeNull();
    });

    it('expires a join that never connects back to ringing or idle', () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:group:g1'));
        store.acceptInvite(store.incoming[0]);
        expect(store.status).toBe('joining');

        vi.advanceTimersByTime(30_001);
        expect(store.status).toBe('idle');
        expect(store.pendingTabRoom).toBe('');

        store.pushIncoming(inviteFrom('call:group:g1'));
        store.acceptInvite(store.incoming[0]);
        vi.advanceTimersByTime(1);
        store.pushIncoming(inviteFrom('call:direct:other:me', 'other'));
        vi.advanceTimersByTime(29_999);
        expect(store.status).toBe('ringing');
        expect(store.incoming.map(invite => invite.room)).toEqual(['call:direct:other:me']);
    });

    it('settles a failed session and recovers through retry', async () => {
        const store = useCallsStore();
        globalThis.__roomConnectError = new Error('token rejected');
        const failed = await store.openSession('call:group:g1');
        expect(failed).toMatchObject({ fatal: 'token rejected' });
        expect(store.session.state.state).toBe('failed');
        expect(store.session.state.error).toBe('token rejected');
        expect(store.status).toBe('idle');

        globalThis.__roomConnectError = null;
        await store.leaveSession();
        await store.openSession('call:group:g1');
        expect(store.session.state.state).toBe('connected');
        expect(store.status).toBe('in-call');
    });

    it('moves the session through reconnecting and fails on a lost connection', async () => {
        const store = useCallsStore();
        vi.stubGlobal('$fetch', vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ url: 'wss://livekit', token: 'token' }));
        await store.openSession('call:group:g1');
        expect(store.session.state.state).toBe('connected');

        emitRoomEvent('Reconnecting');
        expect(store.session.state.state).toBe('reconnecting');

        emitRoomEvent('Reconnected');
        expect(store.session.state.state).toBe('connected');

        emitRoomEvent('Disconnected');
        expect(store.session.state.state).toBe('failed');
        expect(store.status).toBe('idle');
    });

    it('moves placement between mounted surfaces and the parked dock', async () => {
        const store = useCallsStore();
        vi.stubGlobal('$fetch', vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ url: 'wss://livekit', token: 'token' }));
        await store.openSession('call:group:g1');

        store.mountSurface('call:group:g1', 'dialog');
        expect(store.placement).toBe('dialog');
        store.setFloating('call:group:g1');
        expect(store.placement).toBe('floating');

        store.unmountSurface('call:group:g1');
        store.mountSurface('call:group:g1', 'tab');
        expect(store.placement).toBe('tab');

        store.closeFloating();
        store.unmountSurface('call:group:g1');
        await nextTick();
        expect(store.placement).toBe('dock');
        expect(store.floatingRoom).toBe('');
    });
});
