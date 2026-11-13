import { createError } from 'h3';
import * as usersService from '~/server/features/users/service.js';
import * as filesService from '~/server/features/files/service.js';
import * as transcriptionService from '~/server/features/transcription/service.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { declarationForType } from '~/server/features/instances/service.js';
import { lineageKeyForParent, payloadAccepts } from '~/packages/cts/src/index.js';
import * as connectionsService from '~/server/features/connections/service.js';
import { actionToLevel, levelAtLeast, normalizePermissionGrants } from '#shared/access-control.js';
import { createIdentity, createStatus } from '../../core/blocks/index.js';
import { toFlexibleId } from '../../utils/objectid.js';
import * as repository from './repository.js';
import { MESSAGE_SENDER } from './const.js';

const INSTANCE_REF_LIMIT = 6;
const INSTANCE_OPTION_LIMIT = 20;
const MESSAGE_PAGE_DEFAULT = 50;
const MESSAGE_PAGE_MAX = 100;
const ATTACHMENT_KINDS = ['audio', 'video', 'image', 'file'];
const ATTACHMENT_LIMIT = 10;
const ATTACHMENT_DURATION_MAX_SECONDS = 600;
// New chat attachments live in the §3 Blob home; the marker key keeps
// pre-migration voice/recording blobs resolvable in their old bucket.
const ATTACHMENT_LEGACY_BUCKET = 'uploads';
const ATTACHMENT_AUDIO_EXTENSIONS = {
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-wav': 'wav'
};
const INSTANCE_OPTION_LOADERS = {
    user: (auth) => usersService.list(auth)
};

/**
 * One loader seam per type: framework/pack types keep their feature list
 * services; every other type resolves its scoped list through the
 * registry-resolved per-class instance service (`processList`, CTS SPEC
 * §13 — see the instances README), so org-authored types are pickable,
 * resolvable, and recipient-checkable without a hand-registered loader.
 */
function instanceOptionLoaderFor(type) {
    const featureLoader = INSTANCE_OPTION_LOADERS[type];
    if (featureLoader) return featureLoader;
    const service = getAppRegistry().getInstanceService(type);
    if (!service?.processList) return null;
    return async (auth, filters) => (await service.processList(filters || {}, auth)) ?? [];
}

export async function getUserConversationContext(auth, recipientUserId = null) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });

    if (!recipientUserId) {
        return {
            kind: 'support',
            conversationKey: supportConversationKey(userId),
            participants: [userId],
            match: { conversationKey: supportConversationKey(userId) },
            recipient: null
        };
    }

    const recipient = await usersService.getById(recipientUserId);
    if (!recipient) throw createError({ statusCode: 404, message: 'User not found' });
    // Direct threads are open between any two accounts: directory
    // discovery stays name-only (emails never leak), and the direct
    // conversation itself is the contact channel — the recipient merely
    // has to exist.

    const participants = recipientUserId === userId
        ? [String(userId)]
        : [userId, recipientUserId].map(String).sort();
    const conversationKey = directConversationKey(userId, recipientUserId);
    return {
        kind: 'direct',
        conversationKey,
        participants,
        match: { conversationKey },
        recipient: recipient.toJSON()
    };
}

export function getAdminSupportContext(customerId) {
    return {
        kind: 'support',
        conversationKey: supportConversationKey(customerId),
        participants: [customerId],
        match: { conversationKey: supportConversationKey(customerId) }
    };
}

export function groupConversationKey(groupId) {
    return `group:${groupId}`;
}

function groupDTO(group = null) {
    if (!group) return null;
    return {
        _id: group._id,
        identity: group.identity,
        status: group.status,
        origin: group.origin,
        lineage: group.lineage,
        participants: (group.participants || []).map(item => item?.toString?.() || item),
        data: group.data || {}
    };
}

/**
 * Group chats are the persisted multi-participant conversation record and the
 * livekit group-call room source: `{ conversationKey: 'group:<id>', room:
 * 'call:group:<id>' }`. Participants are user-scope — any existing account —
 * and the creator is always a participant.
 */
export async function createGroup(auth, body = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const name = String(body?.name || '').trim();
    if (!name) throw createError({ statusCode: 400, message: 'Group name is required' });
    if (!auth.organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });

    const requestedIds = [...new Set((Array.isArray(body?.participantIds) ? body.participantIds : [])
        .map(item => item?.toString?.().trim() || '')
        .filter(Boolean))];
    // Group participants are user-scope: any existing account may join
    // (the group itself stays homed in the creator's organization
    // lineage). Unknown ids are rejected, never silently dropped.
    const resolvedIds = [];
    for (const id of requestedIds) {
        if (id === String(auth.userId)) continue;
        const participant = await usersService.getById(id).catch(() => null);
        if (!participant) throw createError({ statusCode: 400, message: 'Unknown participants' });
        resolvedIds.push(id);
    }
    const participants = [String(auth.userId), ...resolvedIds];

    const status = createStatus('ACTIVE', auth.userId, { note: 'Chat group created' });
    const created = await repository.insertGroup({
        identity: createIdentity(name),
        status,
        origin: status,
        lineage: { organizationId: toFlexibleId(auth.organizationId) },
        participants,
        data: {}
    });
    notifyInboxParticipants(participants, groupConversationKey(created._id));
    return groupDTO(created);
}

export async function deleteGroup(auth, groupId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = await repository.findGroupById(groupId);
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    const isCreator = String(group.origin?.userId || '') === String(auth.userId);
    if (!auth.isAdmin && !isCreator) throw createError({ statusCode: 403, message: 'Forbidden' });
    await repository.deleteGroupById(groupId);
    notifyInboxParticipants((group.participants || []).map(item => item?.toString?.() || item), groupConversationKey(group._id));
    return { deleted: true };
}

/**
 * Membership edits on an existing group, gated like deletion (creator or
 * admin). Adding follows the creation rule — participants are user-scope,
 * unknown ids rejected — and both directions notify participant inboxes so
 * the member list and conversation admission converge live.
 */
export async function addGroupParticipant(auth, groupId = '', userId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = await repository.findGroupById(groupId);
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    assertGroupManager(auth, group);
    const participantId = String(userId || '').trim();
    if (!participantId) throw createError({ statusCode: 400, message: 'Participant is required' });
    const participant = await usersService.getById(participantId).catch(() => null);
    if (!participant) throw createError({ statusCode: 400, message: 'Unknown participant' });
    // Assistant membership is twin-only: the human seam never seats or
    // removes a bot, so the participants entry and the AI's subscription
    // cannot diverge.
    if (participant?.data?.bot) throw createError({ statusCode: 400, message: 'Assistant membership is managed through the AI panel' });
    const participants = (group.participants || []).map(item => item?.toString?.() || item);
    if (participants.includes(participantId)) return groupDTO(group);
    const next = [...participants, participantId];
    await repository.updateGroupParticipants(groupId, next);
    notifyInboxParticipants([participantId], groupConversationKey(group._id));
    return groupDTO({ ...group, participants: next });
}

export async function removeGroupParticipant(auth, groupId = '', userId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = await repository.findGroupById(groupId);
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    assertGroupManager(auth, group);
    const participantId = String(userId || '').trim();
    const isCreator = String(group.origin?.userId || '') === participantId;
    if (isCreator) throw createError({ statusCode: 400, message: 'The group creator cannot be removed' });
    const removedUser = await usersService.getById(participantId).catch(() => null);
    if (removedUser?.data?.bot) throw createError({ statusCode: 400, message: 'Assistant membership is managed through the AI panel' });
    const participants = (group.participants || []).map(item => item?.toString?.() || item);
    const next = participants.filter(item => item !== participantId);
    if (next.length === participants.length) return groupDTO(group);
    await repository.updateGroupParticipants(groupId, next);
    return groupDTO({ ...group, participants: next });
}

function assertGroupManager(auth, group) {
    const isCreator = String(group.origin?.userId || '') === String(auth.userId);
    if (!auth.isAdmin && !isCreator) throw createError({ statusCode: 403, message: 'Forbidden' });
}

/**
 * Bot membership edits are participant-gated (any member adds an agent to
 * the room, the chat-app convention) and bot-only: the target must carry
 * the users feature's bot marker. Human membership keeps the
 * creator-or-admin gate above.
 */
export async function addBotGroupParticipant(auth, groupId = '', botUserId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = await repository.findGroupById(groupId);
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    const participants = (group.participants || []).map(item => item?.toString?.() || item);
    if (!auth.isAdmin && !participants.includes(String(auth.userId))) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
    const botId = String(botUserId || '').trim();
    const target = await usersService.getById(botId).catch(() => null);
    if (!target?.data?.bot) throw createError({ statusCode: 400, message: 'Target is not a bot member' });
    if (participants.includes(botId)) return groupDTO(group);
    const next = [...participants, botId];
    await repository.updateGroupParticipants(groupId, next);
    notifyInboxParticipants([botId], groupConversationKey(group._id));
    return groupDTO({ ...group, participants: next });
}

export async function removeBotGroupParticipant(auth, groupId = '', botUserId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = await repository.findGroupById(groupId);
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    const participants = (group.participants || []).map(item => item?.toString?.() || item);
    if (!auth.isAdmin && !participants.includes(String(auth.userId))) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
    const botId = String(botUserId || '').trim();
    const next = participants.filter(item => item !== botId);
    if (next.length === participants.length) return groupDTO(group);
    await repository.updateGroupParticipants(groupId, next);
    return groupDTO({ ...group, participants: next });
}

/**
 * Read-side group lookup shared with the livekit feature for group-room
 * admission and webhook fanout; returns the group DTO or null.
 */
export async function findChatGroup(groupId) {
    if (!groupId) return null;
    return groupDTO(await repository.findGroupById(groupId));
}

export async function getGroupConversationContext(auth, groupId = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const group = groupId ? await repository.findGroupById(groupId) : null;
    if (!group) throw createError({ statusCode: 404, message: 'Chat group not found' });
    const participants = (group.participants || []).map(item => item?.toString?.() || item);
    if (!auth.isAdmin && !participants.includes(String(auth.userId))) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }
    const conversationKey = groupConversationKey(group._id);
    return {
        kind: 'group',
        conversationKey,
        participants,
        match: { conversationKey },
        name: group.identity?.name || conversationKey,
        groupId: group._id
    };
}

function notifyInboxParticipants(participants = [], conversationKey) {
    for (const participant of participants) {
        connectionsService.publish(`user:${participant}`, {
            type: 'support.inbox',
            conversationKey
        });
    }
}

/**
 * Instance-linked conversations. A message may be linked to one instance through
 * the auth-scoped registry read; `conversationKey: 'instance:<typeId>:<instanceId>'`
 * scopes its own thread, while the stored `instancePath` (organization root,
 * every lineage-binding ancestor, then the linked instance, each with a
 * display name) lets any ancestor view compose all descendant messages.
 */
export function instanceConversationKey(type, id) {
    return `instance:${type}:${id}`;
}

export function parseInstanceKey(instanceKey = '') {
    const parts = String(instanceKey || '').split(':');
    if (parts.length !== 3 || parts[0] !== 'instance' || !parts[1] || !parts[2]) return null;
    return { type: normalizeInstanceOptionType(parts[1]), id: parts[2] };
}

function instanceDto(instance = null) {
    return instance?.toJSON ? instance.toJSON() : instance;
}

function instanceIdOf(dto = null) {
    const value = dto?._id || dto?.id || '';
    return value ? String(value) : '';
}

// Party entities (organization, user) keep their explicit feature
// services and legacy wire (the instance flip covers CTS instances only).
function partyNameOf(dto = null) {
    return dto?.identity?.name || '';
}

function instanceName(dto = null) {
    // The stored name slot only: never the raw id, never the type id —
    // surfaces fall back to the localized type label client-side when
    // this is empty (the no-technical-ids rule). The declared identifier
    // row's value resolves client-side through the display contract.
    return dto?.identity?.name || dto?.name || '';
}

function organizationIdOf(dto = null, scopedAuth = {}) {
    return String(dto?.organizationId || scopedAuth.organizationId || '');
}

/**
 * Distinguishes "exists but grants deny" from "not found": the registry read
 * throwing 403 (or returning null after a permission error) proves the
 * instance exists while a 404/null proves it does not.
 */
async function registryReadDenied(scopedAuth, type, id) {
    try {
        const service = getAppRegistry().getInstanceService(type);
        if (!service?.processGetById) return false;
        await service.processGetById(id, scopedAuth);
        return false;
    } catch (error) {
        return error?.statusCode === 403;
    }
}

async function fetchLinkedInstance(scopedAuth, type, id) {
    if (!type || !id) return null;
    try {
        const service = getAppRegistry().getInstanceService(type);
        if (!service?.processGetById) return null;
        return await service.processGetById(id, scopedAuth);
    } catch {
        return null;
    }
}

export async function getInstanceConversationContext(auth, instanceKey = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const parsed = parseInstanceKey(instanceKey);
    if (!parsed) throw createError({ statusCode: 400, message: 'Invalid instance conversation key' });
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    let instance = await fetchLinkedInstance(scopedAuth, parsed.type, parsed.id);
    if (!instance) {
        // Child instances (cassettes, nesting runs, sheet designs) deny direct
        // registry reads but stay readable through their scoped list sources.
        // Unlike the picker (first source per type), context validation unions
        // EVERY generated source of the type, so parent-scoped child lists
        // count too.
        const sources = scopedInstanceOptionSources(scopedAuth)
            .filter(source => source.typeId === parsed.type);
        const loader = instanceOptionLoaderFor(parsed.type);
        const scoped = sources.length
            ? await loadInstanceOptionsForSources(scopedAuth, parsed.type, sources).catch(() => [])
            : [];
        // The unfiltered org-scope list is the final pool: org members can
        // discuss any org instance, including standalone children whose
        // lineage never linked them to a readable parent.
        const orgWide = loader ? await loader(scopedAuth, {}).catch(() => []) : [];
        const seen = new Set();
        const candidates = [...scoped, ...orgWide].filter(candidate => {
            const dto = instanceDto(candidate);
            const id = String(dto?._id || dto?.id || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        const dto = candidates
            .map(candidate => instanceDto(candidate))
            .find(dto => String(dto?._id || dto?.id || '') === String(parsed.id));
        if (dto) instance = dto;
    }
    if (!instance && await registryReadDenied(scopedAuth, parsed.type, parsed.id)) {
        // Grants can deny reads on instances the org process still owns
        // (standalone children, gray-lineage test instances) — the registry
        // read answers "exists, denied" rather than "not found". Chat
        // admits those with a bare link and an organization-only path;
        // unreadable lineage simply never climbs.
        instance = {
            _id: parsed.id,
            identity: {},
            lineage: { organizationId: scopedAuth.organizationId }
        };
    }
    if (!instance) throw createError({ statusCode: 403, message: 'Forbidden' });
    const dto = instanceDto(instance);
    return {
        kind: 'instance',
        conversationKey: instanceConversationKey(parsed.type, parsed.id),
        typeId: parsed.type,
        instanceId: parsed.id,
        instanceName: instanceName(dto, parsed.type),
        instance: dto,
        participants: [String(auth.userId)],
        match: { conversationKey: instanceConversationKey(parsed.type, parsed.id) },
        organizationId: organizationIdOf(dto, scopedAuth)
    };
}

/**
 * Ancestor chain for a linked message: organization root first, then every
 * lineage-binding ancestor, then the linked instance. Aggregated reads match
 * any path entry, so a top-level chat composes all descendant messages.
 */
async function buildInstancePath(scopedAuth, type, instance) {
    const dto = instanceDto(instance);
    const path = [{ type, id: instanceIdOf(dto), name: instanceName(dto, type) }];
    const bindings = scopedAuth.process?.lineageBindings || [];
    let currentType = type;
    let currentDto = dto;
    while (currentDto) {
        const binding = bindings.find(item => item.childTypeId === currentType);
        const parentId = binding ? String(currentDto?.lineage?.[binding.lineageKey] || '') : '';
        if (!binding || !parentId) break;
        if (path.some(entry => entry.type === binding.parentTypeId && entry.id === parentId)) break;
        const parent = await fetchLinkedInstance(scopedAuth, binding.parentTypeId, parentId);
        if (!parent) break;
        const parentDto = instanceDto(parent);
        path.unshift({
            type: binding.parentTypeId,
            id: parentId,
            name: instanceName(parentDto, binding.parentTypeId)
        });
        currentType = binding.parentTypeId;
        currentDto = parentDto;
    }
    const organizationId = organizationIdOf(dto, scopedAuth);
    if (organizationId && !(path[0].type === 'organization' && path[0].id === String(organizationId))) {
        const org = await fetchLinkedInstance(scopedAuth, 'organization', organizationId);
        path.unshift({
            type: 'organization',
            id: String(organizationId),
            // Party types keep their explicit feature service and its wire
            // contract (the §3 wire decision covers instances): the org
            // label reads the org service's own DTO shape.
            name: org ? partyNameOf(instanceDto(org)) : ''
        });
    }
    return path;
}

/**
 * Match for an instance thread view: the instance's own key when narrowed, or
 * any message whose instancePath contains the instance when children compose
 * the view.
 */
export function instanceConversationMatch(context, includeChildren = true) {
    if (!includeChildren) return context.match;
    return {
        instancePath: { $elemMatch: { type: context.typeId, id: context.instanceId } }
    };
}

/**
 * Reads one conversation page in ascending order. `options.before` is an ISO
 * timestamp cursor for lazy history loads; `options.limit` caps the page so
 * opening a thread renders the newest slice, not the whole history. The
 * optional viewer id merges that user's private transcripts onto the page
 * (support README, Transcription).
 */
export async function listMessages(match, options = {}, viewerId = null) {
    const limit = Math.min(
        Math.max(Number.parseInt(options.limit, 10) || MESSAGE_PAGE_DEFAULT, 1),
        MESSAGE_PAGE_MAX
    );
    const page = await repository.find(match, messageProjection(), {
        limit,
        before: options.before || null
    });
    return await attachViewerTranscripts(page, viewerId);
}

async function attachViewerTranscripts(messages = [], viewerId = null) {
    if (!viewerId || !messages.length) return messages;
    const rows = await repository.findTranscripts(viewerId, messages.map(message => message._id));
    const byMessage = new Map(rows.map(row => [String(row.messageId), row.text]));
    return messages.map(message => {
        const text = byMessage.get(String(message._id));
        return text === undefined ? message : { ...message, transcript: text };
    });
}

export async function listUserConversations(auth) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const [messages, groups] = await Promise.all([
        repository.findConversationMessages(userConversationsMatch(userId, auth.organizationId || null), messageProjection()),
        repository.findGroupsByParticipant(userId)
    ]);
    const personMessages = messages.filter(message => message.conversationKind !== 'instance');
    const summaries = await buildConversationSummaries(personMessages, auth, { groups: groups.map(groupDTO) });
    const instanceRows = await instanceConversationSummaries(messages, auth);
    return [...instanceRows, ...summaries];
}

/**
 * Instance chat inbox rows: one row per messaged instance (the
 * organization chat included), nested by live lineage — each row carries
 * the conversation key of its nearest ancestor with its own row as
 * `parentKey`, so the org chat roots the tree and deeper instances nest
 * under their parent instance's chat. Unread counts land on the row
 * itself and on every ancestor row (roots aggregate their subtree, like
 * the composed thread views), and shell totals count root rows only.
 */
async function instanceConversationSummaries(messages, auth) {
    const instanceMessages = messages.filter(message => message.conversationKind === 'instance' && message.instanceLink);
    if (!instanceMessages.length) return [];

    const scopedAuth = await resolveInstanceOptionAuth(auth);
    const instanceCache = new Map();
    const cachedInstance = async (type, id) => {
        const cacheKey = `${type}:${id}`;
        if (!instanceCache.has(cacheKey)) {
            instanceCache.set(cacheKey, await fetchLinkedInstance(scopedAuth, type, id));
        }
        return instanceCache.get(cacheKey);
    };

    // Every messaged instance gets its own chat row. Labels resolve LIVE
    // from the instance record (cached); the stored link name survives only
    // when the record is unreadable AND the stored value is not a stale
    // id-fallback — surfaces localize the type label for empty names.
    const rowByKey = new Map();
    for (const message of instanceMessages) {
        const link = message.instanceLink;
        const key = instanceConversationKey(link.type, link.id);
        if (rowByKey.has(key)) continue;
        const live = instanceDto(await cachedInstance(link.type, String(link.id)));
        const storedName = link.name && link.name !== String(link.id) ? link.name : '';
        const entry = { type: link.type, id: String(link.id), name: instanceName(live) || storedName };
        rowByKey.set(key, instanceSummaryRow(entry, message, { isInstanceRoot: link.type === 'organization' }));
    }

    // Ancestor chains (nearest first, organization root last) walk the
    // LIVE lineage — instance lineage keys plus the compiled bindings —
    // never the stored instancePath, which can be degraded when ancestors
    // failed to resolve at send time.
    const chainByKey = new Map();
    const ancestorChainFor = async (type, id) => {
        const chain = [];
        const seen = new Set([`${type}:${String(id)}`]);
        const bindings = scopedAuth.process?.lineageBindings || [];
        const parentBindingFor = (currentType) => bindings.find(binding => (
            binding.childTypeId === currentType
            && binding.parentTypeId !== 'organization'
            && binding.lineageKey
        ));
        let currentType = type;
        let currentId = String(id);
        while (currentType) {
            const binding = parentBindingFor(currentType);
            const instance = instanceDto(await cachedInstance(currentType, currentId));
            const parentId = binding && instance?.lineage?.[binding.lineageKey]
                ? String(instance.lineage[binding.lineageKey])
                : '';
            if (!binding || !parentId) break;
            const parentKey = `${binding.parentTypeId}:${parentId}`;
            if (seen.has(parentKey)) break;
            seen.add(parentKey);
            chain.push({ type: binding.parentTypeId, id: parentId });
            currentType = binding.parentTypeId;
            currentId = parentId;
        }
        const organizationId = type === 'organization'
            ? ''
            : organizationIdOf(instanceDto(await cachedInstance(type, String(id))), scopedAuth);
        if (organizationId && !seen.has(`organization:${organizationId}`)) {
            chain.push({ type: 'organization', id: String(organizationId) });
        }
        return chain;
    };
    for (const key of rowByKey.keys()) {
        const parsed = parseInstanceKey(key);
        if (parsed) chainByKey.set(key, await ancestorChainFor(parsed.type, parsed.id));
    }

    // Nesting: the nearest ancestor that carries its own row.
    for (const [key, row] of rowByKey) {
        const parent = (chainByKey.get(key) || [])
            .find(ancestor => rowByKey.has(instanceConversationKey(ancestor.type, ancestor.id)));
        if (parent) row.parentKey = instanceConversationKey(parent.type, parent.id);
    }

    const reads = await repository.findReadStates(auth.userId, [...rowByKey.keys()]);
    const readsByKey = new Map(reads.map(read => [read.conversationKey, read.lastReadAt]));
    for (const message of instanceMessages) {
        if (message.senderUserId === auth.userId) continue;
        const link = message.instanceLink;
        const key = instanceConversationKey(link.type, link.id);
        const targets = new Set([
            key,
            ...(chainByKey.get(key) || []).map(ancestor => instanceConversationKey(ancestor.type, ancestor.id))
        ]);
        for (const target of targets) {
            const row = rowByKey.get(target);
            if (!row) continue;
            const lastReadAt = readsByKey.get(target) || new Date(0);
            if (new Date(message.timestamp) > new Date(lastReadAt)) row.unreadCount += 1;
        }
    }

    const rows = [...rowByKey.values()];
    await applyConversationPrefsAndReads(rows, auth);
    return rows.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
}

function instanceSummaryRow(entry, message, flags = {}) {
    return {
        conversationKey: instanceConversationKey(entry.type, entry.id),
        conversationKind: 'instance',
        typeId: entry.type,
        instanceId: entry.id,
        instanceName: entry.name || '',
        lastMessage: message.message,
        instanceRefs: message.instanceRefs || [],
        attachments: message.attachments || null,
        senderUserId: message.senderUserId,
        timestamp: message.timestamp,
        unreadCount: 0,
        ...flags
    };
}

export async function listAdminSupportConversations(auth) {
    if (!auth?.userId || !auth?.isAdmin) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    const messages = await repository.findConversationMessages(adminSupportConversationsMatch(), messageProjection());
    return await buildConversationSummaries(messages, auth, { adminSupportOnly: true });
}

export async function markConversationRead(auth, body = {}) {
    const context = await getConversationContextByKey(auth, body.conversationKey || null);
    const read = await repository.markRead(context.conversationKey, auth.userId);
    connectionsService.publish(`conversation:${context.conversationKey}`, {
        type: 'read',
        conversationKey: context.conversationKey,
        userId: auth.userId,
        at: read?.lastReadAt || new Date().toISOString()
    });
    return read;
}

export async function listReadCursors(context) {
    const rows = await repository.findConversationReads(context.conversationKey);
    return rows.map(row => ({
        userId: row.userId,
        lastReadAt: row.lastReadAt instanceof Date ? row.lastReadAt.toISOString() : row.lastReadAt
    }));
}

const SEARCH_LIMIT_CAP = 50;
const escapeRegExpText = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchConversationMessages(auth, query = {}) {
    const context = await getConversationContextByKey(auth, query.conversationKey || null);
    const match = { ...context.match };
    if (query.sender) match.senderUserId = String(query.sender);
    if (query.attachmentKind) match['attachments.kind'] = String(query.attachmentKind);
    if (query.instanceType) match['instanceRefs.type'] = String(query.instanceType);
    if (query.q) match.message = { $regex: escapeRegExpText(query.q), $options: 'i' };
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || SEARCH_LIMIT_CAP, 1), SEARCH_LIMIT_CAP);
    const page = await repository.find(match, messageProjection(), { limit });
    return page.slice().reverse();
}

/**
 * Ephemeral typing signal: authorized like a read, published to the
 * conversation topic, never persisted.
 */
export async function notifyTyping(auth, conversationKey = null) {
    const context = await getConversationContextByKey(auth, conversationKey);
    connectionsService.publish(`conversation:${context.conversationKey}`, {
        type: 'typing',
        conversationKey: context.conversationKey,
        userId: auth.userId,
        name: auth.name || ''
    });
}

export async function listEntityOptions(auth, type, query = '', recipientUserId = null) {
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    if (!scopedAuth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const normalizedType = normalizeInstanceOptionType(type);
    if (!isInstanceOptionTypeAllowed(scopedAuth, normalizedType)) {
        throw createError({ statusCode: 400, message: 'Unsupported instance type' });
    }

    const normalizedQuery = query.toString().trim().toLowerCase();
    const instances = await loadInstanceOptions(scopedAuth, normalizedType);
    const options = instances
        .map(instance => normalizeInstanceOption(normalizedType, instance))
        .filter(option => option.value && matchesInstanceQuery(option, normalizedQuery))
        .slice(0, INSTANCE_OPTION_LIMIT);

    if (!recipientUserId || recipientUserId === scopedAuth.userId || normalizedType === 'user') return options;

    const recipientAuth = await resolveConversationParticipantAuth(scopedAuth, recipientUserId).catch(() => null);
    if (!recipientAuth) return options;

    const recipientIds = await listReadableInstances(recipientAuth, normalizedType);
    return options.map(option => ({
        ...option,
        recipientHasAccess: recipientIds.has(option.value)
    }));
}

export async function listEntityOptionTypes(auth = {}) {
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    return scopedInstanceOptionTypes(scopedAuth).map(source => ({
        value: source.typeId,
        label: source.label || source.typeId,
        labelKey: source.labelKey || null,
        sourceId: source.id || null,
        screenKey: source.screenKey || null
    }));
}

export async function sendUserMessage(auth, body = {}, { refsAuth = null } = {}) {
    const context = body?.instance?.type || body?.instance?.id
        ? await getInstanceConversationContext(auth, instanceConversationKey(
            normalizeInstanceOptionType(body.instance.type),
            body.instance.id
        ))
        : body?.conversationKey?.startsWith('group:')
            ? await getGroupConversationContext(auth, body.conversationKey.slice('group:'.length))
            : await getUserConversationContext(auth, body.recipientUserId || null);
    return await insertMessage({
        context,
        sender: MESSAGE_SENDER.USER,
        senderUserId: auth.userId,
        message: body.message,
        instanceRefs: body.instanceRefs,
        attachments: body.attachments,
        parentMessageId: body.parentMessageId,
        agent: body.agent || null,
        notice: body.notice || null,
        auth,
        // Refs may ride a send attributed to one principal while carrying
        // another's validation rights: an agent run posts as the
        // assistant but its attachments were earned under the delegated
        // user — validation follows the rights, not the byline.
        refsAuth: refsAuth || auth,
        recipientUserId: context.kind === 'direct'
            ? context.participants.find(participant => participant !== auth.userId)
            : null
    });
}

export async function sendAdminSupportMessage(auth, customerId, body = {}) {
    if (!auth?.userId || !auth?.isAdmin) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    return await insertMessage({
        context: getAdminSupportContext(customerId),
        sender: MESSAGE_SENDER.SUPPORT,
        senderUserId: auth.userId,
        message: body.message,
        instanceRefs: body.instanceRefs,
        attachments: body.attachments,
        auth
    });
}

/**
 * Server-internal call-recording messages: the livekit feature posts a
 * finished recording (attachment) and the meetings feature its summary
 * (text) into the room's conversation. The conversation context is rebuilt
 * from the key without auth checks — the callers are trusted server code
 * that derived the key from an admitted room; client requests must go
 * through the auth-checked send paths.
 */
export async function insertRecordingMessage({ conversationKey = '', senderUserId = '', message = '', attachment = null } = {}) {
    const context = await trustedConversationContext(conversationKey);
    return await insertMessage({
        context,
        sender: MESSAGE_SENDER.USER,
        senderUserId: String(senderUserId || ''),
        message,
        attachments: [attachment],
        auth: {}
    });
}

async function trustedConversationContext(conversationKey = '') {
    if (conversationKey.startsWith('direct:')) {
        const parts = conversationKey.split(':').slice(1);
        if (parts.length !== 2) throw createError({ statusCode: 400, message: 'Invalid direct conversation key' });
        return { kind: 'direct', conversationKey, participants: parts, match: { conversationKey } };
    }
    if (conversationKey.startsWith('group:')) {
        const group = await findChatGroup(conversationKey.slice('group:'.length));
        if (!group) throw createError({ statusCode: 404, message: 'Unknown conversation group' });
        return {
            kind: 'group',
            conversationKey,
            participants: (group.participants || []).map(item => item?.toString?.() || item),
            match: { conversationKey }
        };
    }
    throw createError({ statusCode: 400, message: 'Unsupported conversation key' });
}

/**
 * Converts a voice message into text for the calling user only (see the
 * support README, Transcription): the transcript persists per user in
 * `supportTranscripts`, never on the shared message document — the message
 * body, reply quotes, and inbox previews stay untouched and other viewers
 * see nothing. Provider selection is per organization; instance messages
 * carry their org, person conversations fall back to the caller's.
 */
export async function transcribeMessageAudio(auth, messageId = '') {
    const id = String(messageId || '').trim();
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!id) throw createError({ statusCode: 400, message: 'Message id is required' });
    const message = await repository.findById(id);
    if (!message) throw createError({ statusCode: 404, message: 'Message not found' });
    await getConversationContextByKey(auth, message.conversationKey);
    const attachments = message.attachments || [];
    const attachment = attachments.length === 1 ? attachments[0] : null;
    if (attachment?.kind !== 'audio') {
        throw createError({ statusCode: 400, message: 'Message has no audio attachment' });
    }
    if (await repository.findTranscript(auth.userId, id)) {
        throw createError({ statusCode: 409, message: 'Audio message is already transcribed' });
    }
    if (messageSnippet(message)) {
        throw createError({ statusCode: 409, message: 'Message already carries text' });
    }
    let buffer;
    try {
        buffer = await filesService.getFileBuffer(attachment.fileId, attachment.bucket || 'files');
    } catch (error) {
        throw createError({ statusCode: 404, message: 'Audio attachment is no longer available' });
    }
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType : '';
    const { text, provider, model } = await transcriptionService.transcribeAudio({
        buffer,
        filename: `voice-message.${ATTACHMENT_AUDIO_EXTENSIONS[mimeType] || 'webm'}`,
        mimeType,
        organizationId: message.organizationId || auth.organizationId || null
    });
    if (!text) {
        throw createError({ statusCode: 422, message: 'No speech detected in the recording' });
    }
    const stored = await repository.upsertTranscript({
        messageId: id,
        userId: auth.userId,
        text,
        provider,
        model
    });
    // The caller's page swaps the bubble in place from this response; the
    // change is private, so no conversation event is published.
    return { ...message, transcript: stored.text };
}

/**
 * Forwards a message into another conversation (support README, Forwarding):
 * the caller's copy of the text and attachments rides a fresh message sent
 * by the forwarder, provenance denormalized as `forwardedFrom`. Instance
 * refs stay behind — they describe the source conversation's context, not
 * the target's. Instance-target materialization re-validates every file
 * against the target's accepting children like any send.
 */
export async function forwardMessage(auth, messageId = '', body = {}) {
    const id = String(messageId || '').trim();
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!id) throw createError({ statusCode: 400, message: 'Message id is required' });
    const source = await repository.findById(id);
    if (!source) throw createError({ statusCode: 404, message: 'Message not found' });
    await getConversationContextByKey(auth, source.conversationKey);
    const target = await getConversationContextByKey(auth, String(body?.conversationKey || ''));
    return await insertMessage({
        context: target,
        sender: MESSAGE_SENDER.USER,
        senderUserId: auth.userId,
        message: source.message,
        attachments: source.attachments || null,
        auth,
        recipientUserId: target.kind === 'direct'
            ? target.participants.find(participant => participant !== auth.userId)
            : null,
        forwardedFrom: {
            senderUserId: source.senderUserId || '',
            senderName: await resolveUserName(source.senderUserId),
            sentAt: source.timestamp || null
        }
    });
}

async function insertMessage({ context, sender, senderUserId, message, instanceRefs, attachments, parentMessageId, auth, refsAuth = null, recipientUserId = null, forwardedFrom = null, agent = null, notice = null }) {
    const normalizedAttachments = normalizeAttachments(attachments);
    const materialized = context.kind === 'instance' && normalizedAttachments
        ? await materializeInstanceAttachments(auth, context, normalizedAttachments)
        : { attachments: normalizedAttachments, refs: [] };
    const refs = [...await normalizeInstanceRefs(instanceRefs, refsAuth || auth, { recipientUserId }), ...materialized.refs];
    const text = normalizeMessage(message, refs, materialized.attachments);
    const parent = await resolveParentMessage(auth, context, parentMessageId);
    const instanceFields = context.kind === 'instance'
        ? await resolveInstanceMessageFields(auth, context)
        : {};
    const inserted = await repository.insert({
        userId: context.kind === 'support' ? context.participants[0] : null,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        participants: context.participants,
        sender,
        senderUserId,
        message: text,
        instanceRefs: refs,
        ...(materialized.attachments?.length ? { attachments: materialized.attachments } : {}),
        ...(parent ? { parent } : {}),
        ...(forwardedFrom ? { forwardedFrom } : {}),
        ...(agent ? { agent } : {}),
        ...(notice ? { notice } : {}),
        ...instanceFields,
        timestamp: new Date()
    }, messageProjection());
    notifyConversationEvent(context, inserted);
    notifyMessageObservers(context, inserted);
    return inserted;
}

// Server-side message consumers (the agent bot runtime): registered at boot
// through registerMessageObserver, invoked after every persisted send that
// already fanned out through the connections layer. Observers must never
// break the send path — failures are logged, not propagated.
const messageObservers = [];

/**
 * One attachment descriptor carried by a message in a conversation — the
 * chat-run read gate: the agent's `read_attachment` tool may only reach
 * files a message in the room it answers already carries.
 */
export async function findConversationAttachment(conversationKey, fileId = '') {
    const key = String(conversationKey || '').trim();
    const id = String(fileId || '').trim();
    if (!key || !id) return null;
    const rows = await repository.find(
        { conversationKey: key, 'attachments.fileId': id },
        { attachments: 1 },
        { limit: 1 }
    );
    for (const attachment of rows[0]?.attachments || []) {
        if (String(attachment?.fileId || '') === id) return attachment;
    }
    return null;
}

export function registerMessageObserver(observer) {
    if (typeof observer === 'function') messageObservers.push(observer);
    return () => {
        const index = messageObservers.indexOf(observer);
        if (index >= 0) messageObservers.splice(index, 1);
    };
}

function notifyMessageObservers(context, message) {
    for (const observer of messageObservers) {
        try {
            const outcome = observer(context, message);
            if (outcome?.catch) outcome.catch((error) => console.error('[SUPPORT] message observer failed:', error));
        } catch (error) {
            console.error('[SUPPORT] message observer failed:', error);
        }
    }
}

/**
 * Reply quotes carry the parent conversationKey check as "same thread or same
 * instance family": in an aggregated view the parent may be linked to a child
 * instance while the reply itself links to the composed instance.
 */
async function resolveParentMessage(auth, context, parentMessageId = '') {
    const id = String(parentMessageId || '').trim();
    if (!id) return null;
    const parentMessage = await repository.findById(id);
    if (!parentMessage) throw createError({ statusCode: 400, message: 'Parent message not found' });
    const sameConversation = parentMessage.conversationKey === context.conversationKey;
    const sameInstanceFamily = parentMessage.conversationKind === 'instance'
        && context.kind === 'instance'
        && String(parentMessage.organizationId || '') === String(context.organizationId || '');
    if (!sameConversation && !sameInstanceFamily) {
        throw createError({ statusCode: 400, message: 'Parent message must belong to the same conversation' });
    }
    const senderName = await resolveUserName(parentMessage.senderUserId);
    return {
        _id: parentMessage._id,
        senderUserId: parentMessage.senderUserId || '',
        senderName,
        snippet: messageSnippet(parentMessage),
        ...(parentMessage.attachments?.length ? { attachments: parentMessage.attachments } : {}),
        ...(parentMessage.instanceRefs?.length ? { instanceRefs: parentMessage.instanceRefs } : {}),
        timestamp: parentMessage.timestamp
    };
}

async function resolveUserName(userId = '') {
    if (!userId) return '';
    try {
        const user = await usersService.getById(userId);
        return instanceDto(user)?.identity?.name || '';
    } catch {
        return '';
    }
}

function messageSnippet(message = {}) {
    const text = typeof message.message === 'string' ? message.message.trim() : '';
    return text ? text.slice(0, 140) : '';
}

async function resolveInstanceMessageFields(auth, context) {
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    const instancePath = await buildInstancePath(scopedAuth, context.typeId, context.instance);
    return {
        instanceLink: instancePath[instancePath.length - 1],
        instancePath,
        organizationId: context.organizationId
    };
}

/**
 * Fanout for a persisted message: conversation subscribers receive the
 * message, each participant's user topic receives an inbox ping for badge and
 * list refreshes, and support-channel messages also ping the admin topic.
 */
function notifyConversationEvent(context, message) {
    if (context.kind === 'instance') {
        // Aggregated ancestor views subscribe to their own conversation
        // topic, so the message fans out along the whole instance path; the
        // org topic pings every member inbox for the summary refresh.
        const keys = new Set([context.conversationKey]);
        for (const entry of message.instancePath || []) {
            keys.add(instanceConversationKey(entry.type, entry.id));
        }
        for (const key of keys) {
            connectionsService.publish(`conversation:${key}`, {
                type: 'message',
                conversationKey: key,
                message
            });
        }
        if (context.organizationId) {
            connectionsService.publish(`org:${context.organizationId}`, {
                type: 'support.inbox',
                conversationKey: context.conversationKey
            });
        }
        return;
    }
    connectionsService.publish(`conversation:${context.conversationKey}`, {
        type: 'message',
        conversationKey: context.conversationKey,
        message
    });
    for (const participant of context.participants || []) {
        connectionsService.publish(`user:${participant}`, {
            type: 'support.inbox',
            conversationKey: context.conversationKey
        });
    }
    if (context.kind === 'support') {
        connectionsService.publish('admin-support', {
            type: 'support.inbox',
            conversationKey: context.conversationKey
        });
    }
}

connectionsService.registerTopicAuthorizer('conversation:', async (auth, topic) => {
    const context = await getConversationContextByKey(auth, topic.slice('conversation:'.length));
    return Boolean(context);
});

function normalizeMessage(message, instanceRefs = [], attachments = null) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text && !instanceRefs.length && !attachments?.length) {
        throw createError({ statusCode: 400, message: 'Message is required' });
    }
    return text;
}

/**
 * Chat attachments reference files uploaded through the files feature by
 * GridFS id; the message document never embeds media bytes. The kinds, the
 * descriptor shape, and the instance-chat materialization rule are owned by
 * the support README (Message Attachments).
 */
function normalizeAttachments(attachments) {
    if (!attachments) return null;
    const list = Array.isArray(attachments) ? attachments : [attachments];
    if (!list.length) return null;
    if (list.length > ATTACHMENT_LIMIT) {
        throw createError({ statusCode: 400, message: `A message carries at most ${ATTACHMENT_LIMIT} attachments` });
    }
    return list.map(item => {
        if (!item || typeof item !== 'object') return null;
        const kind = String(item.kind || '');
        const fileId = String(item.fileId || '').trim();
        if (!ATTACHMENT_KINDS.includes(kind)) {
            throw createError({ statusCode: 400, message: 'Unsupported attachment kind' });
        }
        if (!fileId) {
            throw createError({ statusCode: 400, message: 'Attachment file is required' });
        }
        const durationSeconds = Number(item.durationSeconds);
        const size = Number(item.size);
        const targetTypeId = String(item.targetTypeId || '').trim();
        return {
            kind,
            fileId,
            mimeType: typeof item.mimeType === 'string' ? item.mimeType.slice(0, 100) : '',
            ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 200) } : {}),
            ...(Number.isFinite(size) ? { size } : {}),
            ...(Number.isFinite(durationSeconds)
                ? { durationSeconds: Math.min(Math.max(durationSeconds, 0), ATTACHMENT_DURATION_MAX_SECONDS) }
                : {}),
            // The sender's child-type choice for instance targets survives
            // normalization: materialization validates it against the
            // server's own candidate set (support README, Message
            // Attachments). Storage never keeps it.
            ...(targetTypeId ? { targetTypeId } : {}),
            ...(item.bucket === ATTACHMENT_LEGACY_BUCKET ? { bucket: ATTACHMENT_LEGACY_BUCKET } : {})
        };
    }).filter(Boolean);
}

/**
 * Instance-chat materialization (support README, Message Attachments):
 * every uploaded file becomes an instance of the composer target type's
 * declared child that accepts it, created through the registry-resolved
 * `upload` construction handler with the target stamped on the child
 * edge's lineage key. Returns the stored attachments plus refs for the
 * created instances; person conversations and party-class targets (the
 * organization chat) keep plain unlinked attachments.
 */
async function materializeInstanceAttachments(auth, context, attachments = []) {
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    const targetDeclaration = await declarationForType(context.typeId, scopedAuth.organizationId).catch(() => null);
    if (!targetDeclaration || targetDeclaration.class === 'party') {
        return { attachments, refs: [] };
    }
    const snapshotPathsByType = new Map();
    const snapshotPathsFor = async (typeId) => {
        if (!snapshotPathsByType.has(typeId)) {
            const declaration = await declarationForType(typeId, scopedAuth.organizationId).catch(() => null);
            snapshotPathsByType.set(typeId, Array.isArray(declaration?.snapshot) ? declaration.snapshot : null);
        }
        return snapshotPathsByType.get(typeId);
    };

    const stored = [];
    const refs = [];
    for (const attachment of attachments) {
        const candidates = await fileChildCandidates(scopedAuth, targetDeclaration, attachment);
        const chosen = attachment.targetTypeId
            ? candidates.filter(candidate => candidate.typeId === attachment.targetTypeId)
            : (candidates.length === 1 ? candidates : []);
        if (!chosen.length) {
            const accepted = [...new Set(candidates.flatMap(candidate => [].concat(candidate.declaration.payload?.mime || [])))];
            if (candidates.length > 1) {
                throw createError({ statusCode: 400, message: 'Attachment matches several target types; pick one' });
            }
            throw createError({
                statusCode: 400,
                message: accepted.length
                    ? `This chat accepts ${accepted.join(', ')} files`
                    : 'This chat accepts no file uploads'
            });
        }
        const candidate = chosen[0];
        const { targetTypeId, ...descriptor } = attachment;
        stored.push(descriptor);
        const created = await candidate.service.constructionHandlers.upload({
            payload: {
                fileId: attachment.fileId,
                mime: attachment.mimeType,
                size: attachment.size,
                name: attachment.name
            },
            lineage: { [candidate.lineageKey]: context.instanceId },
            ...(attachment.name ? { name: attachment.name } : {})
        }, { userId: scopedAuth.userId, organizationId: context.organizationId });
        const id = created?._id?.toString?.() || created?._id || created?.id || '';
        if (id) {
            refs.push({
                type: candidate.typeId,
                id: String(id),
                label: created?.name || attachment.name || '',
                instance: compactInstanceSnapshot(candidate.typeId, created, await snapshotPathsFor(candidate.typeId))
            });
        }
    }
    return { attachments: stored, refs };
}

/**
 * Declared children of the target type that accept the attachment as an
 * `upload` construction (SPEC §4 payload traits through the shared
 * predicate), in declaration order; only children the registry can
 * construct through the generic handler are candidates.
 */
async function fileChildCandidates(scopedAuth, parentDeclaration, attachment = {}) {
    const organizationId = scopedAuth.organizationId || null;
    const candidates = [];
    for (const [key, edge] of Object.entries(parentDeclaration?.edges?.children || {})) {
        const lineageKey = edge?.lineageKey || lineageKeyForParent(parentDeclaration.id) || key;
        for (const typeId of [].concat(edge?.types || [])) {
            if (candidates.some(candidate => candidate.typeId === typeId)) continue;
            const declaration = await declarationForType(typeId, organizationId).catch(() => null);
            if (declaration?.class !== 'file' || !declaration.payload) continue;
            const creation = [].concat(declaration.payload.creation || ['upload']);
            if (!creation.includes('upload')) continue;
            if (!payloadAccepts(declaration.payload, { mime: attachment.mimeType, size: attachment.size })) continue;
            const service = getAppRegistry().getInstanceService(typeId);
            if (!service?.constructionHandlers?.upload) continue;
            candidates.push({ typeId, lineageKey, declaration, service });
        }
    }
    return candidates;
}

export async function normalizeInstanceRefs(instanceRefs = [], auth = {}, options = {}) {
    if (!Array.isArray(instanceRefs)) return [];
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    const allowedTypes = new Set(scopedInstanceOptionTypes(scopedAuth).map(source => source.typeId));
    const normalized = instanceRefs
        .map(ref => ({
            type: normalizeInstanceOptionType(ref?.type),
            id: ref?.id?.toString?.().trim?.() || '',
            label: typeof ref?.label === 'string' ? ref.label.trim() : ''
        }))
        .filter(ref => ref.type && ref.id)
        .slice(0, INSTANCE_REF_LIMIT);

    const refs = [];
    // Contract-driven previews (SPEC §4): resolve each referenced type's
    // declared snapshot paths once per message — pack and org declarations
    // alike, resolved through the registry view.
    const snapshotPathsByType = new Map();
    const snapshotPathsFor = async (typeId) => {
        if (!snapshotPathsByType.has(typeId)) {
            const declaration = await declarationForType(typeId, scopedAuth.organizationId).catch(() => null);
            snapshotPathsByType.set(typeId, Array.isArray(declaration?.snapshot) ? declaration.snapshot : null);
        }
        return snapshotPathsByType.get(typeId);
    };
    for (const ref of normalized) {
        if (!allowedTypes.has(ref.type)) continue;
        const readableOptions = await listEntityOptions(scopedAuth, ref.type, ref.id, options.recipientUserId || null);
        const option = readableOptions.find(item => item.value?.toString?.() === ref.id || item.value === ref.id);
        if (option) {
            refs.push({
                type: ref.type,
                id: ref.id,
                label: option.label,
                instance: compactInstanceSnapshot(ref.type, option.instance, await snapshotPathsFor(ref.type)),
                chatOnlyForRecipient: option.recipientHasAccess === false
            });
        }
    }
    return refs;
}

async function buildConversationSummaries(messages, auth, options = {}) {
    const groupsByKey = new Map((options.groups || [])
        .map(group => [groupConversationKey(group._id), group]));
    const conversations = new Map();
    for (const message of messages) {
        const conversationKey = message.conversationKey || (message.userId ? supportConversationKey(message.userId) : null);
        if (!conversationKey) continue;
        if (options.adminSupportOnly && message.conversationKind === 'direct') continue;
        const group = groupsByKey.get(conversationKey);
        if (message.conversationKind === 'group' && !group) continue;
        if (!conversations.has(conversationKey)) {
            conversations.set(conversationKey, {
                conversationKey,
                conversationKind: message.conversationKind || 'support',
                participants: group ? group.participants : normalizeParticipants(message),
                groupName: group ? group.identity?.name || conversationKey : undefined,
                groupId: group ? group._id : undefined,
                groupCreatorId: group ? group.origin?.userId : undefined,
                lastMessage: message.message,
                instanceRefs: message.instanceRefs || [],
                attachments: message.attachments || null,
                senderUserId: message.senderUserId,
                timestamp: message.timestamp,
                unreadCount: 0
            });
        }
    }

    // Groups without messages still appear in the inbox as empty threads.
    for (const [conversationKey, group] of groupsByKey) {
        if (conversations.has(conversationKey)) continue;
        conversations.set(conversationKey, {
            conversationKey,
            conversationKind: 'group',
            participants: group.participants,
            groupName: group.identity?.name || conversationKey,
            groupId: group._id,
            groupCreatorId: group.origin?.userId,
            lastMessage: '',
            instanceRefs: [],
            senderUserId: '',
            timestamp: null,
            unreadCount: 0
        });
    }

    const keys = Array.from(conversations.keys());
    const reads = await repository.findReadStates(auth.userId, keys);
    const readsByKey = new Map(reads.map(read => [read.conversationKey, read.lastReadAt]));
    for (const message of messages) {
        const conversationKey = message.conversationKey || (message.userId ? supportConversationKey(message.userId) : null);
        const summary = conversations.get(conversationKey);
        if (!summary || message.senderUserId === auth.userId) continue;
        const lastReadAt = readsByKey.get(conversationKey) || new Date(0);
        if (new Date(message.timestamp) > new Date(lastReadAt)) summary.unreadCount += 1;
    }

    const enriched = [];
    for (const summary of conversations.values()) {
        enriched.push({
            ...summary,
            userId: summary.conversationKind === 'support' ? summary.participants[0] : undefined,
            participant: summary.conversationKind === 'group'
                ? null
                : await resolveConversationParticipant(summary, auth)
        });
    }
    await applyConversationPrefsAndReads(enriched, auth);
    return enriched.sort((left, right) => {
        if (!left.timestamp && !right.timestamp) {
            return conversationLabel(left).localeCompare(conversationLabel(right));
        }
        if (!left.timestamp) return 1;
        if (!right.timestamp) return -1;
        return new Date(right.timestamp) - new Date(left.timestamp);
    });
}

// Per-user pin/archive flags plus the own-last-message read mark. The read
// mark appears only when the viewer sent the newest message and at least one
// other participant has a read state at or after it.
async function applyConversationPrefsAndReads(rows, auth) {
    if (!rows.length) return rows;
    const keys = rows.map(row => row.conversationKey);
    const [prefs, othersReads] = await Promise.all([
        repository.findConversationPrefs(auth.userId, keys),
        repository.findOthersReadStates(keys, auth.userId)
    ]);
    const prefByKey = new Map(prefs.map(pref => [pref.conversationKey, pref]));
    const readByKey = new Map(othersReads.map(read => [read.conversationKey, read.lastReadAt]));
    for (const row of rows) {
        const pref = prefByKey.get(row.conversationKey);
        row.pinned = Boolean(pref?.pinnedAt);
        row.archived = Boolean(pref?.archivedAt);
        row.lastMessageRead = false;
        if (row.timestamp && row.senderUserId && String(row.senderUserId) === String(auth.userId)) {
            const othersReadAt = readByKey.get(row.conversationKey);
            row.lastMessageRead = Boolean(othersReadAt
                && new Date(othersReadAt) >= new Date(row.timestamp));
        }
    }
    return rows;
}

export async function updateConversationPrefs(auth, body = {}) {
    const conversationKey = String(body.conversationKey || '');
    if (!/^(support|direct|group|instance):/.test(conversationKey)) {
        throw createError({ statusCode: 400, message: 'Invalid conversationKey' });
    }
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const patch = {};
    if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
    if (typeof body.archived === 'boolean') patch.archived = body.archived;
    const pref = await repository.upsertConversationPref(auth.userId, conversationKey, patch);
    return {
        conversationKey,
        pinned: Boolean(pref?.pinnedAt),
        archived: Boolean(pref?.archivedAt)
    };
}

async function addReachableUserConversations(conversations, auth) {
    const byKey = new Map(conversations.map(conversation => [conversation.conversationKey, conversation]));
    const users = await usersService.list(auth).catch(() => []);
    for (const user of users) {
        const dto = user?.toJSON ? user.toJSON() : user;
        const userId = dto?._id?.toString?.() || dto?._id || dto?.id;
        if (!userId || userId === auth.userId) continue;
        const conversationKey = directConversationKey(auth.userId, userId);
        if (byKey.has(conversationKey)) continue;
        byKey.set(conversationKey, {
            conversationKey,
            conversationKind: 'direct',
            participants: [auth.userId, userId].sort(),
            lastMessage: '',
            instanceRefs: [],
            timestamp: null,
            unreadCount: 0,
            participant: dto
        });
    }
    return Array.from(byKey.values())
        .sort((left, right) => {
            if (!left.timestamp && !right.timestamp) return conversationLabel(left).localeCompare(conversationLabel(right));
            if (!left.timestamp) return 1;
            if (!right.timestamp) return -1;
            return new Date(right.timestamp) - new Date(left.timestamp);
        });
}

function normalizeParticipants(message) {
    if (Array.isArray(message.participants) && message.participants.length) {
        return message.participants.map(item => item?.toString?.() || item).filter(Boolean);
    }
    return message.userId ? [message.userId] : [];
}

async function resolveConversationParticipant(summary, auth) {
    if (summary.conversationKind === 'support') {
        if (summary.participants[0] && summary.participants[0] !== auth.userId) {
            const user = await usersService.getById(summary.participants[0]).catch(() => null);
            // Unresolvable users keep an empty name — never their id.
            return user ? user.toJSON() : { _id: summary.participants[0], identity: {}, data: {} };
        }
        return { _id: 'support', identity: { name: 'Support' }, data: {} };
    }
    const otherUserId = summary.participants.find(participant => participant !== auth.userId)
        || summary.participants[0];
    if (!otherUserId) return null;
    const user = await usersService.getById(otherUserId).catch(() => null);
    return user ? user.toJSON() : { _id: otherUserId, identity: {}, data: {} };
}

export async function getConversationContextByKey(auth, conversationKey) {
    if (!conversationKey) throw createError({ statusCode: 400, message: 'Conversation key is required' });
    if (conversationKey.startsWith('instance:')) {
        return await getInstanceConversationContext(auth, conversationKey);
    }
    if (conversationKey === supportConversationKey(auth.userId)) {
        return await getUserConversationContext(auth, null);
    }
    if (conversationKey.startsWith('direct:')) {
        const parts = conversationKey.split(':').slice(1);
        if (!parts.includes(auth.userId)) throw createError({ statusCode: 403, message: 'Forbidden' });
        const recipientUserId = parts.find(part => part !== auth.userId) || auth.userId;
        return await getUserConversationContext(auth, recipientUserId);
    }
    if (conversationKey.startsWith('group:')) {
        return await getGroupConversationContext(auth, conversationKey.slice('group:'.length));
    }
    if (auth.isAdmin && conversationKey.startsWith('support:')) {
        return getAdminSupportContext(conversationKey.slice('support:'.length));
    }
    throw createError({ statusCode: 403, message: 'Forbidden' });
}

function userConversationsMatch(userId, organizationId = null) {
    return {
        $or: [
            { conversationKey: supportConversationKey(userId) },
            { userId, conversationKey: { $exists: false } },
            { conversationKind: 'direct', participants: userId },
            { conversationKind: 'group', participants: userId },
            ...(organizationId ? [{ conversationKind: 'instance', organizationId }] : [])
        ]
    };
}

function adminSupportConversationsMatch() {
    return {
        sender: { $ne: MESSAGE_SENDER.WELCOME },
        conversationKind: { $ne: 'direct' }
    };
}

async function loadInstanceOptions(auth, type) {
    const loader = instanceOptionLoaderFor(type);
    if (!loader) return [];

    if (auth.process?.active && type !== 'user') {
        const sources = scopedInstanceOptionTypes(auth).filter(source => source.typeId === type);
        if (sources.length) return await loadInstanceOptionsForSources(auth, type, sources);
    }

    return dedupeInstances(await loader(auth, {}));
}

async function loadInstanceOptionsForSources(auth, type, sources = []) {
    const loader = instanceOptionLoaderFor(type);
    if (!loader || !sources.length) return [];

    const results = [];
    for (const source of sources) {
        const resolvedFilters = await resolveSourceFilters(auth, source);
        for (const filters of resolvedFilters) {
            results.push(...await loader(auth, filters));
        }
    }
    return dedupeInstances(results);
}

function normalizeInstanceOption(type, instance) {
    const dto = instance?.toJSON ? instance.toJSON() : instance;
    const value = dto?._id?.toString?.() || dto?._id || dto?.id || '';
    // Naming law lives in the support README: labels carry names only.
    const label = dto?.identity?.name || dto?.name || '';
    return {
        type,
        value,
        label,
        instance: dto
    };
}

function matchesInstanceQuery(option, query) {
    if (!query) return true;
    return [option.label, option.value]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(query));
}

function normalizeInstanceOptionType(type) {
    if (typeof type !== 'string') return '';
    return type.trim();
}

function isInstanceOptionTypeAllowed(auth = {}, type) {
    if (!type) return false;
    if (type === 'user') return true;
    return scopedInstanceOptionSources(auth).some(source => source.typeId === type);
}

function scopedInstanceOptionTypes(auth = {}) {
    return dedupeSources(scopedInstanceOptionSources(auth));
}

function scopedInstanceOptionSources(auth = {}) {
    if (auth.process?.active) {
        const sources = [];
        for (const screen of auth.screens || []) {
            for (const source of screen.sources || []) {
                if (!source?.typeId) continue;
                if (source.mode === 'single') continue;
                if (!sourceRequirementAllowed(auth, source.required || screen.required || {})) continue;
                sources.push({
                    ...source,
                    screenKey: screen.screenKey || screen.id || null,
                    screenTypeId: screen.typeId || null,
                    screenScope: screen.scope || null
                });
            }
        }
        // Create actions with a file-protocol creator grant their outputs
        // as attachable chat refs even without a readable list source: the
        // chat attachment picker offers the creator and must be able to
        // reference what it just created.
        for (const source of creatableCreatorSources(auth)) {
            if (!sources.some(existing => existing.typeId === source.typeId)) {
                sources.push(source);
            }
        }
        return sources;
    }

    return Object.keys(INSTANCE_OPTION_LOADERS)
        .filter(typeId => typeId !== 'user')
        .map(typeId => ({ typeId, label: typeId }));
}

/**
 * A createInstance action whose inputs carry an upload/capture/editor
 * creator exposes the creator's type as a creator-only attachment
 * source. Compiled manifests carry attachment kinds as the expanded
 * `[{ kind, creation }]` array (the payload-trait projection keyed by
 * type id); unknown shapes score no creator credit instead of throwing
 * (a malformed manifest must not take down messaging).
 */
function creatableCreatorSources(auth = {}) {
    const byType = new Map();
    for (const action of auth.roleAssignments?.actions || []) {
        if (action?.actionKind !== 'createInstance') continue;
        for (const field of [...(action.inputPolicy?.fields || []), ...(action.construction?.inputs || [])]) {
            const typeId = field?.creator?.typeId;
            if (typeId && userCreatableAttachmentKinds(field.creator.attachmentKinds)) {
                byType.set(typeId, typeId);
            }
        }
    }
    return [...byType.values()].map(typeId => ({ typeId, label: typeId, creatorOnly: true }));
}

function userCreatableAttachmentKinds(kinds) {
    if (Array.isArray(kinds)) {
        return kinds.some(kind => ['upload', 'capture', 'editor'].includes(kind?.creation?.mode));
    }
    if (kinds && typeof kinds === 'object') {
        return Object.values(kinds).some(kind => ['upload', 'capture', 'editor'].includes(kind?.creation?.mode));
    }
    return false;
}

function sourceRequirementAllowed(auth = {}, requirement = {}) {
    if (!requirement.feature) return true;
    const requiredLevel = requirement.action ? actionToLevel(requirement.action, requirement.level || 'read') : requirement.level || 'read';
    return normalizePermissionGrants((auth.effectivePermissions || {})[requirement.feature]).some(grant => {
        if (!levelAtLeast(grant.level, requiredLevel)) return false;
        if (requirement.action && grant.actions && grant.actions[requirement.action] !== true) return false;
        return sourceTransitionMatches(requirement, grant);
    });
}

function sourceTransitionMatches(requirement = {}, grant = {}) {
    const required = firstTransition(requirement);
    if (!required) return true;
    const allowed = grant.transitions || grant.transition;
    if (!allowed) return true;
    const list = Array.isArray(allowed) ? allowed : [allowed];
    return list.some(item => {
        if (typeof item === 'string') return item === required.to || item === `${required.from}->${required.to}`;
        return (!required.from || !item.from || item.from === required.from) && (!required.to || !item.to || item.to === required.to);
    });
}

function firstTransition(requirement = {}) {
    const transition = requirement.transition || requirement.transitions;
    return Array.isArray(transition) ? transition[0] : transition;
}

function dedupeSources(sources = []) {
    const byType = new Map();
    for (const source of sources) {
        if (!byType.has(source.typeId)) byType.set(source.typeId, source);
    }
    return [...byType.values()];
}

function sourceFilters(source = {}) {
    const filters = { ...(source.filters || {}) };
    const statuses = statusFiltersFromRequirement(source.required || {});
    if (statuses.length === 1) filters.primaryState = statuses[0];
    else if (statuses.length > 1) filters.primaryStates = statuses.join(',');
    return filters;
}

async function resolveSourceFilters(auth, source = {}) {
    const filters = sourceFilters(source);
    if (!hasUnresolvedScreenScope(filters)) return [filters];

    const directResolved = resolveFilterPlaceholders(filters, source.screenScope || {});
    if (!hasUnresolvedScreenScope(directResolved)) return [directResolved];

    const expanded = await expandParentScopedFilters(auth, directResolved, source);
    return expanded.filter(item => !hasUnresolvedScreenScope(item));
}

function resolveFilterPlaceholders(value, scope = {}) {
    if (Array.isArray(value)) return value.map(item => resolveFilterPlaceholders(item, scope));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFilterPlaceholders(item, scope)]));
    }
    if (value === '$screen.instanceId' || value === '$screen.scope.instanceId') {
        return resolveScopeInstanceId(scope) || value;
    }
    return value;
}

async function expandParentScopedFilters(auth, filters = {}, source = {}) {
    const parentType = source.screenTypeId;
    if (!parentType) return [];

    const parentSources = scopedInstanceOptionSources(auth).filter(item => item.typeId === parentType);
    if (!parentSources.length) return [];

    const parentEntities = await loadInstanceOptionsForSources(auth, parentType, parentSources).catch(() => []);
    const parentIds = parentEntities
        .map(instance => {
            const dto = instance?.toJSON ? instance.toJSON() : instance;
            return dto?._id?.toString?.() || dto?._id || dto?.id || null;
        })
        .filter(Boolean);
    if (!parentIds.length) return [];

    const expansions = [];
    for (const parentId of parentIds) {
        const resolved = resolveFilterPlaceholders(filters, {
            ...(source.screenScope || {}),
            instanceId: parentId
        });
        if (!hasUnresolvedScreenScope(resolved)) expansions.push(resolved);
    }
    return expansions;
}

function resolveScopeInstanceId(scope = {}) {
    if (scope.instanceId) return scope.instanceId;
    for (const [key, value] of Object.entries(scope || {})) {
        if (key.endsWith('Id') && value) return value;
    }
    return null;
}

function statusFiltersFromRequirement(requirement = {}) {
    return [...new Set(statusesFromRule(requirement.rule))];
}

function statusesFromRule(rule) {
    if (!rule || typeof rule !== 'object') return [];
    if (Array.isArray(rule)) return rule.flatMap(statusesFromRule);
    if (Array.isArray(rule.any)) return rule.any.flatMap(statusesFromRule);
    if (Array.isArray(rule.all)) return rule.all.flatMap(statusesFromRule);
    if (rule.not) return [];
    if ((rule.fact === 'primaryState' || rule.fact === 'status.primary') && rule.equals) return [String(rule.equals)];
    if ((rule.fact === 'primaryState' || rule.fact === 'status.primary') && Array.isArray(rule.in)) return rule.in.map(String);
    return [];
}

function hasUnresolvedScreenScope(value) {
    if (Array.isArray(value)) return value.some(hasUnresolvedScreenScope);
    if (value && typeof value === 'object') return Object.values(value).some(hasUnresolvedScreenScope);
    return typeof value === 'string' && value.startsWith('$screen.');
}

function dedupeInstances(instances = []) {
    const byId = new Map();
    for (const instance of instances) {
        const dto = instance?.toJSON ? instance.toJSON() : instance;
        const id = dto?._id?.toString?.() || dto?._id || dto?.id;
        if (!id || byId.has(id)) continue;
        byId.set(id, instance);
    }
    return [...byId.values()];
}

async function listReadableInstances(auth, type) {
    const instances = await loadInstanceOptions(auth, type).catch(() => []);
    return new Set(instances
        .map(instance => {
            const dto = instance?.toJSON ? instance.toJSON() : instance;
            return dto?._id?.toString?.() || dto?._id || dto?.id || null;
        })
        .filter(Boolean));
}

function compactInstanceSnapshot(type, instance, snapshotPaths = null) {
    const dto = instance?.toJSON ? instance.toJSON() : instance;
    if (!dto || typeof dto !== 'object') return null;

    const snapshot = {
        _id: dto._id,
        name: dto.identity?.name ?? dto.name ?? null,
        state: dto.state ?? null,
        organizationId: dto.organizationId ?? null,
        lineage: dto.lineage || {},
        relations: dto.relations || {},
        payload: dto.payload || null
    };
    const fields = { ...(dto.fields || {}) };

    // Contract-driven previews (SPEC §4 snapshot facet): a type that
    // declares its snapshot paths keeps exactly those — pack and org
    // declarations alike, no per-type branches in the framework. A type
    // without the declaration gets the generic compact strip: previews
    // never carry heavy geometry layers.
    if (Array.isArray(snapshotPaths)) {
        const kept = {};
        for (const path of snapshotPaths) {
            const value = path.split('.').reduce((cursor, key) => (cursor?.[key] !== undefined ? cursor[key] : undefined), dto);
            if (value === undefined) continue;
            if (path === 'fields.geometry') kept.geometry = compactGeometrySnapshot(value);
            else kept[path.slice('fields.'.length)] = value;
        }
        snapshot.fields = kept;
        return snapshot;
    }

    delete fields.layoutData;
    delete fields.layerData;
    delete fields.polygonParts;
    if (fields.geometry) fields.geometry = compactGeometrySnapshot(fields.geometry);
    snapshot.fields = fields;
    return snapshot;
}

function compactGeometrySnapshot(geometry = {}) {
    const compact = pickDefined(geometry, ['preview', 'dxfId', 'dimensions', 'bounds']);
    return Object.keys(compact).length ? compact : undefined;
}

function pickDefined(source = {}, keys = []) {
    return keys.reduce((acc, key) => {
        if (source[key] !== undefined) acc[key] = source[key];
        return acc;
    }, {});
}

async function resolveConversationParticipantAuth(requesterAuth = {}, participantUserId = null) {
    if (!participantUserId || participantUserId === requesterAuth.userId) return requesterAuth;
    const context = await getUserConversationContext(requesterAuth, participantUserId);
    const recipient = context.recipient || (await usersService.getById(participantUserId))?.toJSON?.() || null;
    if (!recipient) throw createError({ statusCode: 404, message: 'User not found' });

    return await resolveProcessAuth({
        userId: recipient._id?.toString?.() || recipient._id || recipient.id,
        organizationId: recipient.lineage?.organizationId?.toString?.() || recipient.lineage?.organizationId || recipient.data?.memberships?.[0]?.organizationId || null,
        role: recipient.data?.role,
        permissions: recipient.data?.permissions || {},
        memberships: recipient.data?.memberships || [],
        restrictedTo: recipient.data?.restrictedTo || recipient.lineage?.restrictedTo || null
    });
}

async function resolveInstanceOptionAuth(auth = {}) {
    if (!auth?.userId) return auth;
    if (auth.process?.active || Array.isArray(auth.screens) || auth.effectivePermissions) return auth;
    const resolved = await resolveProcessAuth(auth);
    if (resolved?.process?.active || Array.isArray(resolved?.screens) || resolved?.effectivePermissions) return resolved;
    return auth;
}

function supportConversationKey(userId) {
    return `support:${userId}`;
}

function directConversationKey(left, right) {
    return `direct:${[left, right].map(String).sort().join(':')}`;
}

function conversationLabel(conversation) {
    return conversation?.groupName
        || conversation?.participant?.identity?.name
        || conversation?.participant?.name
        || conversation?.conversationKey
        || '';
}


function messageProjection() {
    return {
        userId: 1,
        message: 1,
        sender: 1,
        senderUserId: 1,
        timestamp: 1,
        _id: 1,
        conversationKey: 1,
        conversationKind: 1,
        participants: 1,
        instanceRefs: 1,
        attachments: 1,
        instanceLink: 1,
        instancePath: 1,
        parent: 1,
        forwardedFrom: 1,
        agent: 1,
        notice: 1,
        organizationId: 1
    };
}
