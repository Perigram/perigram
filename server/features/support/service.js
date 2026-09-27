import { createError } from 'h3';
import * as artifactsService from '~/server/features/artifacts/service.js';
import * as usersService from '~/server/features/users/service.js';
import { resolveProcessAuth } from '~/server/features/process-definitions/runtime.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
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
const ATTACHMENT_KINDS = ['audio'];
const ATTACHMENT_DURATION_MAX_SECONDS = 600;
const scopedList = (service) => (auth, filters) => service.list(auth.userId, auth.organizationId, auth.role, auth, filters);
const INSTANCE_OPTION_LOADERS = {
    artifact: (auth, filters) => artifactsService.list(filters, auth.userId, auth.organizationId, auth.role, auth),
    user: (auth) => usersService.list(auth.userId, auth.organizationId, auth.role, auth)
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
    if (recipientUserId !== userId && !auth.isAdmin && !sharesOrganization(auth, recipient)) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }

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
 * 'call:group:<id>' }`. Participants must be organization-reachable users,
 * and the creator is always a participant.
 */
export async function createGroup(auth, body = {}) {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const name = String(body?.name || '').trim();
    if (!name) throw createError({ statusCode: 400, message: 'Group name is required' });
    if (!auth.organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });

    const requestedIds = (Array.isArray(body?.participantIds) ? body.participantIds : [])
        .map(item => item?.toString?.().trim() || '')
        .filter(Boolean);
    const reachable = await usersService.list(auth.userId, auth.organizationId, auth.role, auth)
        .catch(() => []);
    const reachableIds = new Set(reachable.map(user => {
        const dto = user?.toJSON ? user.toJSON() : user;
        return dto?._id?.toString?.() || dto?._id || dto?.id;
    }).filter(Boolean));
    const participants = [...new Set([String(auth.userId), ...requestedIds.filter(id => reachableIds.has(id))])];

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

function instanceName(dto = null, type = '') {
    return dto?.identity?.name || dto?.identity?.serial || dto?.identity?.uid || instanceIdOf(dto) || type;
}

function organizationIdOf(dto = null, scopedAuth = {}) {
    const fromLineage = dto?.lineage?.organizationId;
    return String(fromLineage || scopedAuth.organizationId || '');
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
            identity: { name: parsed.id },
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
            name: org ? instanceName(instanceDto(org)) : 'organization'
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
 * opening a thread renders the newest slice, not the whole history.
 */
export async function listMessages(match, options = {}) {
    const limit = Math.min(
        Math.max(Number.parseInt(options.limit, 10) || MESSAGE_PAGE_DEFAULT, 1),
        MESSAGE_PAGE_MAX
    );
    return await repository.find(match, messageProjection(), {
        limit,
        before: options.before || null
    });
}

export async function listUserConversations(auth) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const [messages, groups] = await Promise.all([
        repository.findConversationMessages(userConversationsMatch(userId, auth.organizationId || null), messageProjection()),
        auth.organizationId
            ? repository.findGroupsByParticipant(userId, auth.organizationId)
            : Promise.resolve([])
    ]);
    const personMessages = messages.filter(message => message.conversationKind !== 'instance');
    const summaries = await buildConversationSummaries(personMessages, auth, { groups: groups.map(groupDTO) });
    const instanceRows = await instanceConversationSummaries(messages, auth);
    return [...instanceRows, ...summaries];
}

/**
 * Instance chat inbox rows, emitted in both groupings: top-level rows (every
 * message rolls up to the highest instance below the organization root, so
 * lower instances surface as one top-instance chat) and per-instance leaf rows
 * (`isLeafRow`) for the flat view. The client switches between them; unread
 * counts key on each row's own conversation key, and shell totals count the
 * top-level rows only.
 */
async function instanceConversationSummaries(messages, auth) {
    const instanceMessages = messages.filter(message => message.conversationKind === 'instance' && message.instanceLink);
    if (!instanceMessages.length) return [];

    // Rollup nodes are the top-level nodes of the lineage hierarchy trees:
    // each message joins at the ancestor whose type carries no non-organization
    // parent binding. The walk uses live lineage (instance lineage keys plus
    // the compiled bindings), never the stored instancePath, which can be
    // degraded when ancestors failed to resolve at send time.
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    const instanceCache = new Map();
    const entryByMessage = new WeakMap();
    const rollupEntryFor = async (message) => {
        if (!entryByMessage.has(message)) {
            entryByMessage.set(message, await topLevelInstanceFor(scopedAuth, message, instanceCache));
        }
        return entryByMessage.get(message);
    };

    const byKey = new Map();
    const leafByKey = new Map();
    for (const message of instanceMessages) {
        const entry = await rollupEntryFor(message);
        const key = instanceConversationKey(entry.type, entry.id);
        if (!byKey.has(key)) {
            byKey.set(key, instanceSummaryRow(entry, message, { isInstanceRoot: entry.type === 'organization' }));
        }
        const link = message.instanceLink;
        const leafKey = instanceConversationKey(link.type, link.id);
        // Entities that are their own top level already carry a top row; no
        // duplicate leaf row.
        if (leafKey !== key && !byKey.has(leafKey) && !leafByKey.has(leafKey)) {
            leafByKey.set(leafKey, instanceSummaryRow(link, message, { isLeafRow: true }));
        }
    }

    const rows = [...byKey.values(), ...leafByKey.values()];
    await applyInstanceUnreadCounts(rows, instanceMessages, auth, rollupEntryFor);
    await applyConversationPrefsAndReads(rows, auth);
    return rows.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
}

async function topLevelInstanceFor(scopedAuth, message, cache) {
    const bindings = scopedAuth.process?.lineageBindings || [];
    const parentBindingFor = (type) => bindings.find(binding => (
        binding.childTypeId === type
        && binding.parentTypeId !== 'organization'
        && binding.lineageKey
    ));
    const cachedInstance = async (type, id) => {
        const cacheKey = `${type}:${id}`;
        if (!cache.has(cacheKey)) {
            cache.set(cacheKey, await fetchLinkedInstance(scopedAuth, type, id));
        }
        return cache.get(cacheKey);
    };

    let type = message.instanceLink.type;
    let id = String(message.instanceLink.id);
    let name = message.instanceLink.name || id;
    const seen = new Set([`${type}:${id}`]);
    while (true) {
        const binding = parentBindingFor(type);
        if (!binding) break;
        const instance = instanceDto(await cachedInstance(type, id));
        const parentId = instance?.lineage?.[binding.lineageKey]
            ? String(instance.lineage[binding.lineageKey])
            : '';

        if (!parentId) break;
        const parentKey = `${binding.parentTypeId}:${parentId}`;
        if (seen.has(parentKey)) break;
        const parent = await cachedInstance(binding.parentTypeId, parentId);
        if (!parent) break;
        const parentDto = instanceDto(parent);
        seen.add(parentKey);
        type = binding.parentTypeId;
        id = parentId;
        name = parentDto?.identity?.name || name;
    }
    return { type, id, name };
}

function instanceSummaryRow(entry, message, flags = {}) {
    return {
        conversationKey: instanceConversationKey(entry.type, entry.id),
        conversationKind: 'instance',
        typeId: entry.type,
        instanceId: entry.id,
        instanceName: entry.name || entry.id,
        lastMessage: message.message,
        instanceRefs: message.instanceRefs || [],
        attachment: message.attachment || null,
        senderUserId: message.senderUserId,
        timestamp: message.timestamp,
        unreadCount: 0,
        ...flags
    };
}

async function applyInstanceUnreadCounts(rows, instanceMessages, auth, rollupEntryFor) {
    const reads = await repository.findReadStates(auth.userId, rows.map(row => row.conversationKey));
    const readsByKey = new Map(reads.map(read => [read.conversationKey, read.lastReadAt]));
    const rowByKey = new Map(rows.map(row => [row.conversationKey, row]));
    for (const message of instanceMessages) {
        if (message.senderUserId === auth.userId) continue;
        const entry = await rollupEntryFor(message);
        const link = message.instanceLink;
        const targets = new Set([
            instanceConversationKey(entry.type, entry.id),
            instanceConversationKey(link.type, link.id)
        ]);
        for (const key of targets) {
            const row = rowByKey.get(key);
            if (!row) continue;
            const lastReadAt = readsByKey.get(row.conversationKey) || new Date(0);
            if (new Date(message.timestamp) > new Date(lastReadAt)) row.unreadCount += 1;
        }
    }
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

export async function listInstanceOptions(auth, type, query = '', recipientUserId = null) {
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

export async function listInstanceOptionTypes(auth = {}) {
    const scopedAuth = await resolveInstanceOptionAuth(auth);
    return scopedInstanceOptionTypes(scopedAuth).map(source => ({
        value: source.typeId,
        label: source.label || source.typeId,
        labelKey: source.labelKey || null,
        sourceId: source.id || null,
        screenKey: source.screenKey || null
    }));
}

export async function sendUserMessage(auth, body = {}) {
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
        attachment: body.attachment,
        parentMessageId: body.parentMessageId,
        auth,
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
        attachment: body.attachment,
        auth
    });
}

async function insertMessage({ context, sender, senderUserId, message, instanceRefs, attachment, parentMessageId, auth, recipientUserId = null }) {
    const refs = await normalizeInstanceRefs(instanceRefs, auth, { recipientUserId });
    const normalizedAttachment = normalizeAttachment(attachment);
    const text = normalizeMessage(message, refs, normalizedAttachment);
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
        ...(normalizedAttachment ? { attachment: normalizedAttachment } : {}),
        ...(parent ? { parent } : {}),
        ...instanceFields,
        timestamp: new Date()
    }, messageProjection());
    notifyConversationEvent(context, inserted);
    return inserted;
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
        ...(parentMessage.attachment ? { attachment: parentMessage.attachment } : {}),
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

function normalizeMessage(message, instanceRefs = [], attachment = null) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text && !instanceRefs.length && !attachment) {
        throw createError({ statusCode: 400, message: 'Message is required' });
    }
    return text;
}

/**
 * Voice messages are the one chat attachment channel: the client uploads the
 * recording through the files feature and references it here by GridFS id, so
 * the message document never embeds audio bytes and playback streams through
 * the shared download route.
 */
function normalizeAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') return null;
    const kind = String(attachment.kind || '');
    const fileId = String(attachment.fileId || '').trim();
    if (!ATTACHMENT_KINDS.includes(kind)) {
        throw createError({ statusCode: 400, message: 'Unsupported attachment kind' });
    }
    if (!fileId) {
        throw createError({ statusCode: 400, message: 'Attachment file is required' });
    }
    const durationSeconds = Number(attachment.durationSeconds);
    return {
        kind,
        fileId,
        mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType.slice(0, 100) : '',
        ...(Number.isFinite(durationSeconds)
            ? { durationSeconds: Math.min(Math.max(durationSeconds, 0), ATTACHMENT_DURATION_MAX_SECONDS) }
            : {})
    };
}

async function normalizeInstanceRefs(instanceRefs = [], auth = {}, options = {}) {
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
    for (const ref of normalized) {
        if (!allowedTypes.has(ref.type)) continue;
        const readableOptions = await listInstanceOptions(scopedAuth, ref.type, ref.id, options.recipientUserId || null);
        const option = readableOptions.find(item => item.value?.toString?.() === ref.id || item.value === ref.id);
        if (option) {
            refs.push({
                type: ref.type,
                id: ref.id,
                label: option.label,
                instance: compactInstanceSnapshot(ref.type, option.instance),
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
                attachment: message.attachment || null,
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
    const users = await usersService.list(auth.userId, auth.organizationId, auth.role, auth).catch(() => []);
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
            return user ? user.toJSON() : { _id: summary.participants[0], identity: { name: summary.participants[0] }, data: {} };
        }
        return { _id: 'support', identity: { name: 'Support' }, data: {} };
    }
    const otherUserId = summary.participants.find(participant => participant !== auth.userId)
        || summary.participants[0];
    if (!otherUserId) return null;
    const user = await usersService.getById(otherUserId).catch(() => null);
    return user ? user.toJSON() : { _id: otherUserId, identity: { name: otherUserId }, data: {} };
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
    const label = dto?.identity?.name || dto?.identity?.serial || dto?.identity?.uid || value;
    return {
        type,
        value,
        label,
        instance: dto
    };
}

function matchesInstanceQuery(option, query) {
    if (!query) return true;
    return [option.label, option.value, option.instance?.identity?.uid, option.instance?.identity?.serial]
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
        // Artifact creation actions grant their outputs as attachable chat
        // refs even without a readable artifact list source: the chat
        // attachment picker offers the org process's artifact creator and
        // must be able to reference what it just created.
        if (hasArtifactCreatorAction(auth) && !sources.some(source => source.typeId === 'artifact')) {
            sources.push({ typeId: 'artifact', label: 'artifact', creatorOnly: true });
        }
        return sources;
    }

    return Object.keys(INSTANCE_OPTION_LOADERS)
        .filter(typeId => typeId !== 'user')
        .map(typeId => ({ typeId, label: typeId }));
}

/**
 * Mirrors the client-side `artifactCreatorForAction` detection: a
 * createInstance action whose inputs carry an upload/capture/editor creator.
 * Compiled manifests carry attachment kinds as the expanded
 * `[{ kind, creation }]` array; unknown shapes score no creator credit
 * instead of throwing (a malformed manifest must not take down messaging).
 */
function hasArtifactCreatorAction(auth = {}) {
    return (auth.roleAssignments?.actions || []).some(action => (
        // The manifest speaks the projected UI-contract kinds beside the
        // legacy exposure fields; both identify creates.
        ['createInstance', 'createInstance'].includes(action?.actionKind)
        && [...(action.inputPolicy?.fields || []), ...(action.construction?.inputs || [])]
            .some(field => field?.creator?.typeId && userCreatableAttachmentKinds(field.creator.attachmentKinds))
    ));
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

function compactInstanceSnapshot(type, instance) {
    const dto = instance?.toJSON ? instance.toJSON() : instance;
    if (!dto || typeof dto !== 'object') return null;

    const snapshot = {
        _id: dto._id,
        identity: dto.identity || {},
        lineage: dto.lineage || {},
        origin: dto.origin || null,
        status: dto.status || null,
        specs: dto.specs || null,
        attachments: dto.attachments || {},
        summary: dto.summary || {}
    };
    const data = { ...(dto.data || {}) };

    if (type === 'cassette') {
        snapshot.data = {
            ...pickDefined(data, ['type', 'definition', 'materialPool', 'parameters', 'description', 'revisions', 'sheetDesignIds', 'results']),
            ...(data.geometry ? { geometry: compactGeometrySnapshot(data.geometry) } : {}),
            ...(data.layerData ? { layerData: data.layerData } : {}),
            ...(data.polygonParts ? { polygonParts: data.polygonParts } : {})
        };
        return snapshot;
    }

    delete data.layoutData;
    delete data.layerData;
    delete data.polygonParts;
    delete data.artifactIds;
    if (data.geometry) data.geometry = compactGeometrySnapshot(data.geometry);
    snapshot.data = data;
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

function sharesOrganization(auth = {}, recipient) {
    const authOrgIds = new Set((auth.memberships || [])
        .map(membership => membership.organizationId?.toString?.() || membership.organizationId)
        .filter(Boolean));
    if (auth.organizationId) authOrgIds.add(auth.organizationId.toString());

    const recipientOrgIds = (recipient.memberships || recipient.data?.memberships || [])
        .map(membership => membership.organizationId?.toString?.() || membership.organizationId)
        .filter(Boolean);

    return recipientOrgIds.some(orgId => authOrgIds.has(orgId));
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
        attachment: 1,
        instanceLink: 1,
        instancePath: 1,
        parent: 1,
        organizationId: 1
    };
}
