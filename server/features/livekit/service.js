import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { createError } from 'h3';
import { hasPermissionGrant } from '#shared/access-control.js';
import * as connectionsService from '../connections/service.js';
import * as filesService from '../files/service.js';
import { getConversationContextByKey, findChatGroup, insertRecordingMessage } from '../support/service.js';
import * as repository from './repository.js';

/**
 * LiveKit calls capability module. Direct and organization rooms are derived,
 * never free-form:
 *
 * - `call:direct:<sorted-user-id-a>:<sorted-user-id-b>` — mirrors the support
 *   conversation keys; only participants (or admins) may mint tokens.
 * - `call:org:<orgId>` — organization rooms; any member may join.
 * - `call:group:<groupId>` — the call room of a persisted support group chat;
 *   only group participants (or admins) may join, mirroring the direct-room
 *   participant contract.
 *
 * Room access today derives from org membership and conversation/group
 * participation; under an active compiled process, org rooms additionally
 * ride the process access rights (livekit feature grant). Group rooms follow
 * their participants like direct rooms and stay grant-free.
 */

const config = () => ({
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'devsecret',
    publicUrl: process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880',
    // Server-to-server RoomService base: inside compose the published
    // localhost port is not reachable from the app container, so
    // administrative calls need the network-internal LiveKit address.
    internalUrl: process.env.LIVEKIT_INTERNAL_URL || process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880'
});

export const publicConfig = () => ({ url: config().publicUrl });

const sortedIds = (left, right) => [String(left), String(right)].sort();

export const directCallRoom = (left, right) => `call:direct:${sortedIds(left, right).join(':')}`;

export const orgCallRoom = (orgId) => `call:org:${orgId}`;

export const groupCallRoom = (groupId) => `call:group:${groupId}`;

function requireLiveKitGrant(auth, level = 'read') {
    if (!auth.process?.active || !auth.effectivePermissions) return;
    const granted = hasPermissionGrant({
        permissions: auth.effectivePermissions,
        feature: 'livekit',
        level
    });
    if (!granted) throw createError({ statusCode: 403, message: 'Forbidden' });
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

    if (room.startsWith('call:group:')) {
        const group = await findChatGroup(room.slice('call:group:'.length));
        if (!group) throw createError({ statusCode: 404, message: 'Unknown call group' });
        if (auth.isAdmin || group.participants.includes(String(auth.userId))) {
            return { room, kind: 'group' };
        }
        throw createError({ statusCode: 403, message: 'Forbidden' });
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
 * admins) can ring a room. Group conversations ring their group room;
 * support conversations ring the organization room.
 */
export async function inviteToCall(auth, conversationKey = null) {
    const context = await getConversationContextByKey(auth, conversationKey);
    const room = context.kind === 'direct'
        ? directCallRoom(auth.userId, context.participants.find(id => id !== auth.userId) || auth.userId)
        : context.kind === 'group'
            ? groupCallRoom(context.groupId)
            : orgCallRoom(auth.organizationId);
    connectionsService.publish(`conversation:${context.conversationKey}`, {
        type: 'call',
        conversationKey: context.conversationKey,
        room,
        from: auth.userId,
        fromName: auth.name || ''
    });
    for (const participant of context.participants || []) {
        if (String(participant) === String(auth.userId)) continue;
        connectionsService.publish(`user:${participant}`, {
            type: 'call.invite',
            conversationKey: context.conversationKey,
            room,
            from: auth.userId,
            fromName: auth.name || ''
        });
    }
    return { room, conversationKey: context.conversationKey };
}

/**
 * Snapshot of currently active call rooms the caller may join. Sourced from
 * the LiveKit server's RoomService ListRooms API and filtered through the
 * same `authorizeRoom` admission as token minting, so hidden rooms never
 * leak. Live updates ride `call.activity` webhook events on the connections
 * layer; this endpoint is the reconnect/bootstrap source of truth.
 */
export async function listActiveRooms(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const rooms = await fetchLiveKitRooms();
    const active = [];
    for (const room of rooms) {
        const name = room?.name || '';
        if (!name.startsWith('call:')) continue;
        // LiveKit keeps emptied rooms alive for the server empty_timeout
        // (default 300s) after the last participant leaves; a room with no
        // connected participants is not an active call, so the sidebar must
        // not list it as one.
        if (Number(room.num_participants || 0) < 1) continue;
        try {
            const { kind } = await authorizeRoom(auth, name);
            active.push({ room: name, kind, participants: Number(room.num_participants || 0) });
        } catch {
            /* rooms the caller cannot join stay hidden */
        }
    }
    return active.sort((left, right) => right.participants - left.participants);
}

async function fetchLiveKitRooms() {
    const { apiKey, apiSecret, internalUrl } = config();
    const httpBase = internalUrl.replace(/^ws/, 'http');
    const token = jwt.sign({ iss: apiKey, sub: apiKey, video: { roomList: true } }, apiSecret, { expiresIn: '1m' });
    try {
        const response = await fetch(`${httpBase}/twirp/livekit.RoomService/ListRooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({})
        });
        if (!response.ok) throw new Error(`LiveKit ListRooms responded ${response.status}`);
        const body = await response.json();
        return Array.isArray(body?.rooms) ? body.rooms : [];
    } catch (error) {
        console.error('Failed to list LiveKit rooms:', error);
        return [];
    }
}

/**
 * Signed twirp call into the Egress service. Egress APIs require the
 * `roomRecord` video grant; LiveKit's twirp endpoints speak proto-JSON with
 * original snake_case field names both ways (verified against the dev
 * server), unlike the room-event webhooks which arrive camelCase.
 */
async function egressTwirp(method, body) {
    const { apiKey, apiSecret, internalUrl } = config();
    const httpBase = internalUrl.replace(/^ws/, 'http');
    const token = jwt.sign({ iss: apiKey, sub: apiKey, video: { roomRecord: true } }, apiSecret, { expiresIn: '1m' });
    let response;
    try {
        response = await fetch(`${httpBase}/twirp/livekit.Egress/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body)
        });
    } catch (error) {
        throw createError({ statusCode: 502, message: `LiveKit egress ${method} is unreachable` });
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw createError({
            statusCode: 502,
            message: `LiveKit egress ${method} failed: ${payload?.msg || response.status}`
        });
    }
    return payload;
}

const recordingsStore = () => ({
    endpoint: (process.env.LIVEKIT_RECORDINGS_S3_ENDPOINT || '').replace(/\/+$/, ''),
    bucket: (process.env.LIVEKIT_RECORDINGS_S3_BUCKET || '').replace(/^\/+|\/+$/g, '')
});

/**
 * Room → conversation mapping for recordings: direct and group rooms mirror
 * the support conversation keys; org rooms have no conversation thread, so
 * they are not recordable.
 */
export function conversationKeyForRoom(room = '') {
    if (room.startsWith('call:direct:')) {
        const parts = room.split(':').slice(2);
        return parts.length === 2 ? `direct:${parts[0]}:${parts[1]}` : null;
    }
    if (room.startsWith('call:group:')) return `group:${room.slice('call:group:'.length)}`;
    return null;
}

export async function startRoomRecording(auth, room = '') {
    const { kind } = await authorizeRoom(auth, room);
    const conversationKey = conversationKeyForRoom(room);
    if (!conversationKey) {
        throw createError({ statusCode: 400, message: 'Room has no conversation to record into' });
    }
    if ((await repository.findActiveByRoom(room)).length) {
        throw createError({ statusCode: 409, message: 'Room is already recording' });
    }
    const egress = await egressTwirp('StartRoomCompositeEgress', {
        room_name: room,
        audio_only: false,
        file_outputs: [{ filepath_pattern: '{room_id}-{time}.mp4' }]
    });
    const egressId = String(egress?.egress_id || '');
    if (!egressId) {
        throw createError({ statusCode: 502, message: 'LiveKit egress returned no egress id' });
    }
    return await repository.insert({
        egressId,
        room,
        conversationKey,
        conversationKind: kind,
        startedByUserId: String(auth.userId),
        startedAt: new Date(),
        status: 'recording'
    });
}

export async function stopRoomRecording(auth, room = '') {
    await authorizeRoom(auth, room);
    const active = await repository.findActiveByRoom(room);
    if (!active.length) throw createError({ statusCode: 404, message: 'Room is not recording' });
    for (const record of active) {
        await egressTwirp('StopEgress', { egressId: record.egressId });
    }
    return { room, stopped: active.length };
}

/**
 * Active recordings for rooms the caller may enter — the record-toggle
 * state source for call surfaces, filtered through `authorizeRoom` like the
 * active-rooms snapshot.
 */
export async function listRoomRecordings(auth) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const visible = [];
    for (const record of await repository.findAllActive()) {
        try {
            await authorizeRoom(auth, record.room);
        } catch {
            continue;
        }
        visible.push({
            room: record.room,
            egressId: record.egressId,
            startedByUserId: record.startedByUserId,
            startedAt: record.startedAt
        });
    }
    return visible;
}

/**
 * Imports one finished egress file: fetch it from the recordings object
 * store (the egress plane uploads there; the bucket allows anonymous reads —
 * write credentials live on the egress deployment, never in the app),
 * persist into GridFS, and post the conversation's `video` attachment
 * message from the recording starter.
 */
async function importRecordingFile(record, result) {
    const filename = String(result.filename || '').split('/').pop();
    if (!filename) return;
    const { endpoint, bucket } = recordingsStore();
    if (!endpoint || !bucket) {
        throw createError({ statusCode: 503, message: 'Recordings store is not configured' });
    }
    let response;
    try {
        response = await fetch(`${endpoint}/${bucket}/${encodeURIComponent(filename)}`);
    } catch (error) {
        console.error(`Recording store unreachable for ${filename}:`, error);
        return;
    }
    if (!response.ok) {
        console.error(`Recording store responded ${response.status} for ${filename}`);
        return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const uploaded = await filesService.uploadFile(buffer, `call-recording-${record.egressId}.mp4`, {
        kind: 'call-recording',
        room: record.room
    });
    const durationSeconds = Math.round(Number(result.duration || 0));
    await insertRecordingMessage({
        conversationKey: record.conversationKey,
        senderUserId: record.startedByUserId,
        attachment: {
            kind: 'video',
            fileId: uploaded.id,
            mimeType: 'video/mp4',
            ...(durationSeconds > 0 ? { durationSeconds } : {})
        }
    });
}

async function handleEgressWebhookEvent(body = {}) {
    const event = body?.event || '';
    const info = body?.egressInfo || {};
    const egressId = String(info.egressId || '');
    const room = String(info.roomName || '');
    if (!egressId || !room.startsWith('call:')) return { published: false };
    const record = await repository.findByEgressId(egressId).catch(() => null);
    if (record) {
        try {
            if (event === 'egress_failed') {
                await repository.updateById(record._id, { $set: { status: 'failed', endedAt: new Date() } });
            } else if (event === 'egress_ended') {
                for (const result of Array.isArray(info.fileResults) ? info.fileResults : []) {
                    await importRecordingFile(record, result);
                }
                await repository.updateById(record._id, { $set: { status: 'completed', endedAt: new Date() } });
            }
        } catch (error) {
            console.error(`Recording import failed for egress ${egressId}:`, error);
            await repository.updateById(record._id, { $set: { status: 'failed', endedAt: new Date() } }).catch(() => {});
        }
    }
    await publishRoomActivity(room, { type: 'call.activity', event, room });
    return { published: true };
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
 * Fans webhook room events onto the connections layer: organization rooms
 * publish on the org topic, direct and group rooms on each participant's
 * user topic (matching room admission, so nobody learns about calls they
 * cannot join). Egress lifecycle events additionally drive the recording
 * import before fanning out.
 */
export async function publishWebhookEvent(body = {}) {
    const event = body?.event;
    if (String(event || '').startsWith('egress_')) {
        return await handleEgressWebhookEvent(body);
    }
    const room = body?.room?.name || '';
    if (!event || !room.startsWith('call:')) return { published: false };
    const participant = body?.participant?.identity
        ? { identity: body.participant.identity, name: body.participant.name || '' }
        : null;
    return await publishRoomActivity(room, { type: 'call.activity', event, room, participant });
}

async function publishRoomActivity(room, payload) {
    if (room.startsWith('call:org:')) {
        connectionsService.publish(`org:${room.slice('call:org:'.length)}`, payload);
        return { published: true };
    }
    if (room.startsWith('call:group:')) {
        const group = await findChatGroup(room.slice('call:group:'.length));
        if (!group) return { published: false };
        for (const userId of group.participants) connectionsService.publish(`user:${userId}`, payload);
        return { published: true };
    }
    if (room.startsWith('call:direct:')) {
        const participants = room.split(':').slice(2);
        for (const userId of participants) connectionsService.publish(`user:${userId}`, payload);
        return { published: true };
    }
    return { published: false };
}
