import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth.js';
import { useCallsStore } from './calls.js';

vi.mock('~/composables/useConnections.js', () => ({
    useConnections: () => ({ subscribe: () => () => {} })
}));

describe('calls store line machine', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.useFakeTimers();
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
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
        // The caller left before the callee answered: the next snapshot no
        // longer lists the room, and the invite is past its grace window.
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
        vi.advanceTimersByTime(6000);
        await store.refresh();
        expect(store.incoming).toEqual([]);
        expect(store.status).toBe('idle');
    });

    it('keeps fresh invites alive against a snapshot taken before the invite', async () => {
        const store = useCallsStore();
        store.pushIncoming(inviteFrom('call:direct:caller:me'));
        vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([]));
        await store.refresh();
        // Within the grace window the ring survives even though the stale
        // snapshot does not list the room yet.
        expect(store.incoming).toHaveLength(1);
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
});
