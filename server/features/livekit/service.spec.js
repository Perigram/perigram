import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    connectionsPublish: vi.fn(),
    getConversationContextByKey: vi.fn(),
    repository: (() => {
        const channels = new Map();
        let sequence = 0;
        return {
            reset: () => channels.clear(),
            seed: (doc) => {
                const id = `channel-${++sequence}`;
                channels.set(id, { ...doc, _id: id });
                return channels.get(id);
            },
            create: vi.fn(async (data) => {
                const id = `channel-${++sequence}`;
                channels.set(id, { ...data, _id: id });
                return channels.get(id);
            }),
            findById: vi.fn(async (id) => channels.get(String(id)) || null),
            findByOrganization: vi.fn(async (organizationId) => [...channels.values()]
                .filter(channel => String(channel.lineage?.organizationId) === String(organizationId))
                .sort((left, right) => String(left.identity?.name).localeCompare(String(right.identity?.name)))),
            deleteById: vi.fn(async (id) => {
                channels.delete(String(id));
                return { deletedCount: 1 };
            })
        };
    })()
}));

vi.mock('../connections/service.js', () => ({
    publish: mocks.connectionsPublish,
    registerTopicAuthorizer: vi.fn()
}));
vi.mock('../support/service.js', () => ({
    getConversationContextByKey: mocks.getConversationContextByKey
}));
vi.mock('./repository.js', () => mocks.repository);

import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import {
    authorizeRoom,
    createChannel,
    deleteChannel,
    directCallRoom,
    inviteToCall,
    listChannels,
    mintRoomToken,
    orgCallRoom,
    channelCallRoom,
    publishWebhookEvent,
    verifyWebhookAuthorization
} from './service.js';

const auth = (userId, organizationId = 'org-1', isAdmin = false) => ({
    userId,
    organizationId,
    isAdmin,
    name: 'Test User'
});

describe('livekit call rooms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.repository.reset();
        process.env.LIVEKIT_API_KEY = 'devkey';
        process.env.LIVEKIT_API_SECRET = 'devsecret';
    });
    afterEach(() => {
        delete process.env.LIVEKIT_API_KEY;
        delete process.env.LIVEKIT_API_SECRET;
    });

    it('derives deterministic direct rooms regardless of caller order', () => {
        expect(directCallRoom('user-b', 'user-a')).toBe('call:direct:user-a:user-b');
        expect(directCallRoom('user-a', 'user-b')).toBe('call:direct:user-a:user-b');
        expect(orgCallRoom('org-1')).toBe('call:org:org-1');
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

    it('creates, lists, and deletes organization call channels', async () => {
        const created = await createChannel(auth('user-a', 'org-1'), { name: 'Workshop' });
        expect(created.identity.name).toBe('Workshop');
        expect(channelCallRoom(created._id)).toBe(`call:channel:${created._id}`);

        await createChannel(auth('user-a', 'org-1'), { name: 'Office' });
        const channels = await listChannels(auth('user-b', 'org-1'));
        expect(channels.map(channel => channel.identity.name)).toEqual(['Office', 'Workshop']);

        await expect(deleteChannel(auth('user-b', 'org-1'), created._id)).rejects.toMatchObject({ statusCode: 403 });
        await expect(deleteChannel(auth('user-a', 'org-1'), created._id)).resolves.toMatchObject({ deleted: true });
        await expect(deleteChannel(auth('admin', 'org-1', true), 'missing')).rejects.toMatchObject({ statusCode: 404 });
        await expect(createChannel(auth('user-a', 'org-1'), { name: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('gates channel rooms to the owning organization', async () => {
        const channel = mocks.repository.seed({
            identity: { name: 'Workshop' },
            lineage: { organizationId: 'org-1' },
            origin: { userId: 'user-a' }
        });
        await expect(authorizeRoom(auth('user-a', 'org-1'), channelCallRoom(channel._id))).resolves.toMatchObject({ kind: 'channel' });
        await expect(authorizeRoom(auth('user-a', 'org-2'), channelCallRoom(channel._id))).rejects.toMatchObject({ statusCode: 403 });
        await expect(authorizeRoom(auth('admin', 'org-2', true), channelCallRoom(channel._id))).resolves.toMatchObject({ kind: 'channel' });
        await expect(authorizeRoom(auth('user-a', 'org-1'), 'call:channel:missing')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('gates channel creation through the active process livekit write grant', async () => {
        const processAuth = (grants) => ({
            ...auth('user-a', 'org-1'),
            process: { active: true },
            effectivePermissions: grants
        });
        await expect(createChannel(processAuth({ livekit: [{ level: 'write' }] }), { name: 'Workshop' })).resolves.toMatchObject({
            identity: { name: 'Workshop' }
        });
        await expect(createChannel(processAuth({ livekit: [{ level: 'read' }] }), { name: 'Denied' })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('fans webhook events for channel rooms onto the organization topic', async () => {
        const channel = mocks.repository.seed({
            identity: { name: 'Workshop' },
            lineage: { organizationId: 'org-1' },
            origin: { userId: 'user-a' }
        });
        await expect(publishWebhookEvent({
            event: 'participant_joined',
            room: { name: channelCallRoom(channel._id) },
            participant: { identity: 'user-a', name: 'A' }
        })).resolves.toEqual({ published: true });
        expect(mocks.connectionsPublish).toHaveBeenCalledWith('org:org-1', expect.objectContaining({
            type: 'call.activity',
            room: channelCallRoom(channel._id)
        }));
        await expect(publishWebhookEvent({ event: 'x', room: { name: 'call:channel:missing' } })).resolves.toEqual({ published: false });
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
