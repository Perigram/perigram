import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { createError } from 'h3';
import { hasPermissionGrant } from '#shared/access-control.js';
import * as connectionsService from '../connections/service.js';
import { getConversationContextByKey } from '../support/service.js';
import * as repository from './repository.js';
import { createIdentity, createStatus } from '../../core/blocks/index.js';
import { toFlexibleId } from '../../utils/objectid.js';

/**
 * LiveKit calls capability module. Direct and organization rooms are derived,
 * never free-form:
 *
 * - `call:direct:<sorted-user-id-a>:<sorted-user-id-b>` — mirrors the support
 *   conversation keys; only participants (or admins) may mint tokens.
 * - `call:org:<orgId>` — organization rooms; any member may join.
 * - `call:channel:<channelId>` — persisted organization call channels created
 *   and deleted by members like Discord voice channels.
 *
 * Room access today derives from org membership and conversation
 * participation; under an active compiled process, org and channel rooms
 * additionally ride the process access rights (livekit feature grant).
 */

const config = () => ({
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'devsecret',
    publicUrl: process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880'
});

export const publicConfig = () => ({ url: config().publicUrl });

const sortedIds = (left, right) => [String(left), String(right)].sort();

export const directCallRoom = (left, right) => `call:direct:${sortedIds(left, right).join(':')}`;

export const orgCallRoom = (orgId) => `call:org:${orgId}`;

export const channelCallRoom = (channelId) => `call:channel:${channelId}`;

function requireLiveKitGrant(auth, level = 'read') {
    if (!auth.process?.active || !auth.effectivePermissions) return;
    const granted = hasPermissionGrant({
        permissions: auth.effectivePermissions,
        feature: 'livekit',
        level
    });
    if (!granted) throw createError({ statusCode: 403, message: 'Forbidden' });
}

async function channelById(channelId) {
    if (!channelId) return null;
    return await repository.findById(channelId);
}

function channelOrganizationId(channel = null) {
    const organizationId = channel?.lineage?.organizationId;
    return organizationId ? String(organizationId) : '';
}

function channelDTO(channel = null) {
    if (!channel) return null;
    return {
        _id: channel._id,
        identity: channel.identity,
        status: channel.status,
        origin: channel.origin,
        lineage: channel.lineage,
        data: channel.data || {}
    };
}

export async function createChannel(auth, data = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const name = String(data?.name || '').trim();
    if (!name) throw createError({ statusCode: 400, message: 'Channel name is required' });
    if (!auth.organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });
    requireLiveKitGrant(auth, 'write');
    const status = createStatus('ACTIVE', auth.userId, { note: 'Call channel created' });
    const doc = {
        identity: createIdentity(name),
        status,
        origin: status,
        lineage: { organizationId: toFlexibleId(auth.organizationId) },
        data: {}
    };
    const created = await repository.create(doc);
    return channelDTO(created);
}

export async function listChannels(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!auth.organizationId) return [];
    const channels = await repository.findByOrganization(auth.organizationId);
    return channels.map(channelDTO);
}

export async function deleteChannel(auth, channelId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const channel = await channelById(channelId);
    if (!channel) throw createError({ statusCode: 404, message: 'Call channel not found' });
    const isCreator = String(channel.origin?.userId || '') === String(auth.userId);
    if (!auth.isAdmin && !isCreator) throw createError({ statusCode: 403, message: 'Forbidden' });
    await repository.deleteById(channelId);
    return { deleted: true };
}

export async function authorizeRoom(auth, room = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (typeof room !== 'string' || !room) throw createError({ statusCode: 400, message: 'Room is required' });

    if (room.startsWith('call:direct:')) {
        const parts = room.split(':').slice(2);
        if (parts.length !== 2) throw createError({ statusCode: 400, message: 'Invalid direct call room' });
        if (auth.isAdmin || parts.includes(String(auth.userId))) return { room, kind: 'direct' };
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }

    if (room.startsWith('call:org:')) {
        const orgId = room.slice('call:org:'.length);
        if (auth.isAdmin) return { room, kind: 'org' };
        const isMember = Boolean(auth.organizationId && String(auth.organizationId) === orgId);
        if (!isMember) throw createError({ statusCode: 403, message: 'Forbidden' });
        // With an active compiled process, org rooms are a declared service:
        // admission rides the process access rights (livekit feature grant).
        requireLiveKitGrant(auth);
        return { room, kind: 'org' };
    }

    if (room.startsWith('call:channel:')) {
        const channel = await channelById(room.slice('call:channel:'.length));
        if (!channel) throw createError({ statusCode: 404, message: 'Unknown call channel' });
        if (auth.isAdmin) return { room, kind: 'channel' };
        const isMember = Boolean(auth.organizationId && String(auth.organizationId) === channelOrganizationId(channel));
        if (!isMember) throw createError({ statusCode: 403, message: 'Forbidden' });
        requireLiveKitGrant(auth);
        return { room, kind: 'channel' };
    }

    throw createError({ statusCode: 400, message: 'Unknown call room' });
}

export async function mintRoomToken(auth, room = '') {
    const { kind } = await authorizeRoom(auth, room);
    const { apiKey, apiSecret } = config();
    const token = jwt.sign(
        {
            iss: apiKey,
            sub: String(auth.userId),
            name: auth.name || '',
            metadata: JSON.stringify({ kind, organizationId: auth.organizationId || null }),
            video: {
                roomJoin: true,
                room,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true
            }
        },
        apiSecret,
        { expiresIn: '2h' }
    );
    return { token, room, kind, url: config().publicUrl };
}

/**
 * Publishes a call invite on the conversation topic. Authorization reuses
 * the support conversation contract, so only conversation participants (or
 * admins) can ring a room.
 */
export async function inviteToCall(auth, conversationKey = null) {
    const context = await getConversationContextByKey(auth, conversationKey);
    const room = context.kind === 'direct'
        ? directCallRoom(auth.userId, context.participants.find(id => id !== auth.userId) || auth.userId)
        : orgCallRoom(auth.organizationId);
    connectionsService.publish(`conversation:${context.conversationKey}`, {
        type: 'call',
        conversationKey: context.conversationKey,
        room,
        from: auth.userId,
        fromName: auth.name || ''
    });
    return { room, conversationKey: context.conversationKey };
}

/**
 * LiveKit signs webhook payloads as a JWT in the Authorization header whose
 * `sha256` claim hashes the raw body. Dev keys are fixed, so strict
 * verification is cheap and always on.
 */
export function verifyWebhookAuthorization(header = '', rawBody = '') {
    const token = String(header).replace(/^Bearer\s+/i, '');
    if (!token) throw createError({ statusCode: 401, message: 'Missing webhook token' });
    let decoded;
    try {
        decoded = jwt.verify(token, config().apiSecret, { issuer: config().apiKey });
    } catch {
        throw createError({ statusCode: 401, message: 'Invalid webhook token' });
    }
    if (decoded.sha256 && rawBody) {
        const hash = createHash('sha256').update(rawBody).digest('base64');
        if (hash !== decoded.sha256) throw createError({ statusCode: 401, message: 'Webhook body hash mismatch' });
    }
    return decoded;
}

/**
 * Fans webhook room events onto the connections layer: organization and
 * channel rooms publish on the org topic, direct rooms on each participant's
 * user topic.
 */
export async function publishWebhookEvent(body = {}) {
    const event = body?.event;
    const room = body?.room?.name || '';
    if (!event || !room.startsWith('call:')) return { published: false };
    const participant = body?.participant?.identity
        ? { identity: body.participant.identity, name: body.participant.name || '' }
        : null;
    const payload = {
        type: 'call.activity',
        event,
        room,
        participant
    };
    if (room.startsWith('call:org:')) {
        connectionsService.publish(`org:${room.slice('call:org:'.length)}`, payload);
        return { published: true };
    }
    if (room.startsWith('call:channel:')) {
        const channel = await channelById(room.slice('call:channel:'.length));
        const organizationId = channelOrganizationId(channel);
        if (!organizationId) return { published: false };
        connectionsService.publish(`org:${organizationId}`, payload);
        return { published: true };
    }
    if (room.startsWith('call:direct:')) {
        const participants = room.split(':').slice(2);
        for (const userId of participants) connectionsService.publish(`user:${userId}`, payload);
        return { published: true };
    }
    return { published: false };
}
