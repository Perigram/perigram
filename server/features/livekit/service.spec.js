import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    connectionsPublish: vi.fn(),
    getConversationContextByKey: vi.fn(),
    findChatGroup: vi.fn(),
    fetch: vi.fn()
}));

vi.mock('../connections/service.js', () => ({
    publish: mocks.connectionsPublish,
    registerTopicAuthorizer: vi.fn()
}));
vi.mock('../support/service.js', () => ({
    getConversationContextByKey: mocks.getConversationContextByKey,
    findChatGroup: mocks.findChatGroup
}));

import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { directCallRoom, groupCallRoom, orgCallRoom } from '#shared/call-rooms.js';
import {
    authorizeRoom,
    inviteToCall,
    listActiveRooms,
    mintRoomToken,
    publishWebhookEvent,
    verifyWebhookAuthorization
} from './service.js';

const auth = (userId, organizationId = 'org-1', isAdmin = false) => ({
    userId,
    organizationId,
    isAdmin,
    name: 'Test User'
});

const group = (id, participants, organizationId = 'org-1') => ({
    _id: id,
    identity: { name: 'Workshop' },
    origin: { userId: participants[0] },
    lineage: { organizationId },
    participants
});

describe('livekit call rooms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LIVEKIT_API_KEY = 'devkey';
        process.env.LIVEKIT_API_SECRET = 'devsecret';
        vi.stubGlobal('fetch', mocks.fetch);
    });
    afterEach(() => {
        delete process.env.LIVEKIT_API_KEY;
        delete process.env.LIVEKIT_API_SECRET;
        vi.unstubAllGlobals();
    });

    it('derives deterministic direct rooms regardless of caller order', () => {
        expect(directCallRoom('user-b', 'user-a')).toBe('call:direct:user-a:user-b');
        expect(directCallRoom('user-a', 'user-b')).toBe('call:direct:user-a:user-b');
        expect(orgCallRoom('org-1')).toBe('call:org:org-1');
        expect(groupCallRoom('group-1')).toBe('call:group:group-1');
    });

    it('gates direct rooms to participants and admins', () => {
        expect(authorizeRoom(auth('user-a'), 'call:direct:user-a:user-b')).resolves.toMatchObject({ kind: 'direct' });
        expect(authorizeRoom(auth('user-c'), 'call:direct:user-a:user-b')).rejects.toMatchObject({ statusCode: 403 });
        expect(authorizeRoom(auth('admin', 'org-9', true), 'call:direct:user-a:user-b')).resolves.toMatchObject({ kind: 'direct' });
    });

    it('gates org rooms to members and rejects unknown rooms', () => {
        expect(authorizeRoom(auth('user-a', 'org-1'), 'call:org:org-1')).resolves.toMatchObject({ kind: 'org' });
        expect(authorizeRoom(auth('user-a', 'org-2'), 'call:org:org-1')).rejects.toMatchObject({ statusCode: 403 });
        expect(authorizeRoom(auth('user-a'), 'freeform-room')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('gates org rooms through the active process livekit grant when a process is active', async () => {
        const processAuth = (grants) => ({
            ...auth('user-a', 'org-1'),
            process: { active: true },
            effectivePermissions: grants
        });
        await expect(authorizeRoom(processAuth({ livekit: [{ level: 'read' }] }), 'call:org:org-1')).resolves.toMatchObject({ kind: 'org' });
        await expect(authorizeRoom(processAuth({ other: [{ level: 'read' }] }), 'call:org:org-1')).rejects.toMatchObject({ statusCode: 403 });
        await expect(authorizeRoom(processAuth({}), 'call:org:org-1')).rejects.toMatchObject({ statusCode: 403 });
        // without an active process, plain membership still admits
        await expect(authorizeRoom(auth('user-a', 'org-1'), 'call:org:org-1')).resolves.toMatchObject({ kind: 'org' });
    });

    it('gates group rooms to participants without a process grant', async () => {
        mocks.findChatGroup.mockResolvedValue(group('group-1', ['user-a', 'user-b']));
        await expect(authorizeRoom(auth('user-a', 'org-1'), groupCallRoom('group-1'))).resolves.toMatchObject({ kind: 'group' });
        await expect(authorizeRoom(auth('user-c', 'org-1'), groupCallRoom('group-1'))).rejects.toMatchObject({ statusCode: 403 });
        await expect(authorizeRoom(auth('admin', 'org-9', true), groupCallRoom('group-1'))).resolves.toMatchObject({ kind: 'group' });
        // participant admission is grant-free even under an active process
        const processAuth = { ...auth('user-a', 'org-1'), process: { active: true }, effectivePermissions: {} };
        await expect(authorizeRoom(processAuth, groupCallRoom('group-1'))).resolves.toMatchObject({ kind: 'group' });
        mocks.findChatGroup.mockResolvedValue(null);
        await expect(authorizeRoom(auth('user-a', 'org-1'), groupCallRoom('missing'))).rejects.toMatchObject({ statusCode: 404 });
    });

    it('fans webhook events for group rooms onto participant user topics', async () => {
        mocks.findChatGroup.mockResolvedValue(group('group-1', ['user-a', 'user-b']));
        await expect(publishWebhookEvent({
            event: 'participant_joined',
            room: { name: groupCallRoom('group-1') },
            participant: { identity: 'user-a', name: 'A' }
        })).resolves.toEqual({ published: true });
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-a', expect.objectContaining({
            type: 'call.activity',
            room: groupCallRoom('group-1')
        }));
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-b', expect.objectContaining({
            type: 'call.activity',
            room: groupCallRoom('group-1')
        }));
        mocks.findChatGroup.mockResolvedValue(null);
        await expect(publishWebhookEvent({ event: 'x', room: { name: 'call:group:missing' } })).resolves.toEqual({ published: false });
    });

    it('lists only active call rooms the caller may join', async () => {
        mocks.findChatGroup.mockImplementation(async (id) => (
            id === 'group-1' ? group('group-1', ['user-a', 'user-b']) : null
        ));
        mocks.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                rooms: [
                    { name: 'call:org:org-1', num_participants: 2 },
                    { name: 'call:group:group-1', num_participants: 3 },
                    { name: 'call:group:group-other', num_participants: 1 },
                    { name: 'call:direct:user-a:user-c', num_participants: 1 },
                    { name: 'call:direct:user-a:user-d', num_participants: 0 },
                    { name: 'unrelated-room', num_participants: 5 }
                ]
            })
        });

        const rooms = await listActiveRooms(auth('user-a', 'org-1'));
        expect(rooms).toEqual([
            { room: 'call:group:group-1', kind: 'group', participants: 3 },
            { room: 'call:org:org-1', kind: 'org', participants: 2 },
            { room: 'call:direct:user-a:user-c', kind: 'direct', participants: 1 }
        ]);
        const [, request] = mocks.fetch.mock.calls[0];
        expect(request.headers.Authorization).toEqual(expect.stringMatching(/^Bearer /));
    });

    it('returns an empty active-room list when the LiveKit server is unreachable', async () => {
        mocks.fetch.mockRejectedValue(new Error('network down'));
        await expect(listActiveRooms(auth('user-a', 'org-1'))).resolves.toEqual([]);
    });

    it('mints LiveKit-shaped room tokens for authorized callers', async () => {
        const room = directCallRoom('user-a', 'user-b');
        const grant = await mintRoomToken(auth('user-a'), room);
        expect(grant.url).toBe('ws://localhost:7880');
        const decoded = jwt.verify(grant.token, 'devsecret', { issuer: 'devkey' });
        expect(decoded.sub).toBe('user-a');
        expect(decoded.video).toMatchObject({ roomJoin: true, room, canPublish: true });
    });

    it('refuses to mint tokens for rooms the caller cannot access', async () => {
        await expect(mintRoomToken(auth('user-c'), 'call:direct:user-a:user-b')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('publishes call invites on the conversation topic', async () => {
        mocks.getConversationContextByKey.mockResolvedValue({
            kind: 'direct',
            conversationKey: 'direct:user-a:user-b',
            participants: ['user-a', 'user-b']
        });
        const result = await inviteToCall(auth('user-a'), 'direct:user-a:user-b');
        expect(result.room).toBe('call:direct:user-a:user-b');
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('conversation:direct:user-a:user-b', expect.objectContaining({
            type: 'call',
            room: 'call:direct:user-a:user-b',
            from: 'user-a'
        }));
    });

    it('rings group conversations into their group room', async () => {
        mocks.getConversationContextByKey.mockResolvedValue({
            kind: 'group',
            conversationKey: 'group:group-1',
            participants: ['user-a', 'user-b'],
            groupId: 'group-1'
        });
        const result = await inviteToCall(auth('user-a'), 'group:group-1');
        expect(result.room).toBe('call:group:group-1');
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('conversation:group:group-1', expect.objectContaining({
            type: 'call',
            room: 'call:group:group-1'
        }));
    });

    it('verifies webhook signatures including the body hash', () => {
        const body = JSON.stringify({ event: 'room_started' });
        const token = jwt.sign({ iss: 'devkey', sha256: createHash('sha256').update(body).digest('base64') }, 'devsecret');
        expect(() => verifyWebhookAuthorization(`Bearer ${token}`, body)).not.toThrow();
        expect(() => verifyWebhookAuthorization(`Bearer ${token}`, body + 'tampered')).toThrow();
        expect(() => verifyWebhookAuthorization('', body)).toThrow();
    });

    it('fans webhook events for org and direct rooms onto the connections layer', async () => {
        const published = await publishWebhookEvent({
            event: 'participant_joined',
            room: { name: 'call:org:org-1' },
            participant: { identity: 'user-a', name: 'A' }
        });
        expect(published).toEqual({ published: true });
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('org:org-1', expect.objectContaining({
            type: 'call.activity',
            event: 'participant_joined'
        }));

        publishWebhookEvent({
            event: 'participant_left',
            room: { name: 'call:direct:user-a:user-b' },
            participant: { identity: 'user-a', name: 'A' }
        });
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-a', expect.objectContaining({ type: 'call.activity' }));
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('user:user-b', expect.objectContaining({ type: 'call.activity' }));

        await expect(publishWebhookEvent({ event: 'x', room: { name: 'other' } })).resolves.toEqual({ published: false });
    });
});
