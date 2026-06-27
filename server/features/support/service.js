import { createError } from 'h3';
import * as materialsService from '~/server/features/materials/service.js';
import * as projectsService from '~/server/features/projects/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as sheetsService from '~/server/features/sheets/service.js';
import * as usersService from '~/server/features/users/service.js';
import * as repository from './repository.js';
import { MESSAGE_SENDER } from './const.js';

const ENTITY_REF_LIMIT = 6;
const ENTITY_OPTION_LIMIT = 20;
const ENTITY_OPTION_TYPE_DEFS = [
    { value: 'project', labelKey: 'common.project' },
    { value: 'queue', labelKey: 'queue.title' },
    { value: 'sheet', labelKey: 'support.entityTypes.sheet' },
    { value: 'material', labelKey: 'support.entityTypes.material' },
    { value: 'user', labelKey: 'common.user' }
];
const ENTITY_OPTION_TYPES = new Set(ENTITY_OPTION_TYPE_DEFS.map(type => type.value));

export async function getUserConversationContext(auth, recipientUserId = null) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });

    if (!recipientUserId || recipientUserId === userId) {
        return {
            kind: 'support',
            conversationKey: supportConversationKey(userId),
            participants: [userId],
            match: legacySupportMatch(userId),
            recipient: null
        };
    }

    const recipient = await usersService.getById(recipientUserId);
    if (!recipient) throw createError({ statusCode: 404, message: 'User not found' });
    if (!auth.isAdmin && !sharesOrganization(auth, recipient)) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }

    const participants = [userId, recipientUserId].map(String).sort();
    return {
        kind: 'direct',
        conversationKey: `direct:${participants.join(':')}`,
        participants,
        match: { conversationKey: `direct:${participants.join(':')}` },
        recipient: recipient.toJSON()
    };
}

export function getAdminSupportContext(customerId) {
    return {
        kind: 'support',
        conversationKey: supportConversationKey(customerId),
        participants: [customerId],
        match: legacySupportMatch(customerId)
    };
}

export async function listMessages(match) {
    return await repository.find(match, messageProjection());
}

export async function listMessagesSince(match, timestamp) {
    return await repository.findSince(match, timestamp, messageProjection());
}

export async function listUserConversations(auth) {
    const userId = auth?.userId;
    if (!userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    const messages = await repository.findConversationMessages(userConversationsMatch(userId), messageProjection());
    const conversations = await buildConversationSummaries(messages, auth);
    return await addReachableUserConversations(conversations, auth);
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
    return await repository.markRead(context.conversationKey, auth.userId);
}

export async function listEntityOptions(auth, type, query = '') {
    if (!auth?.userId) throw createError({ statusCode: 401, message: 'Unauthorized' });
    if (!ENTITY_OPTION_TYPES.has(type)) {
        throw createError({ statusCode: 400, message: 'Unsupported entity type' });
    }

    const normalizedQuery = query.toString().trim().toLowerCase();
    const entities = await loadEntityOptions(auth, type);
    return entities
        .map(entity => normalizeEntityOption(type, entity))
        .filter(option => option.value && matchesEntityQuery(option, normalizedQuery))
        .slice(0, ENTITY_OPTION_LIMIT);
}

export function listEntityOptionTypes() {
    return ENTITY_OPTION_TYPE_DEFS;
}

export async function sendUserMessage(auth, body = {}) {
    const context = await getUserConversationContext(auth, body.recipientUserId || null);
    return await insertMessage({
        context,
        sender: MESSAGE_SENDER.USER,
        senderUserId: auth.userId,
        message: body.message,
        entityRefs: body.entityRefs,
        auth
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
        entityRefs: body.entityRefs,
        auth
    });
}

async function insertMessage({ context, sender, senderUserId, message, entityRefs, auth }) {
    const text = normalizeMessage(message);
    const refs = await normalizeEntityRefs(entityRefs, auth);
    return await repository.insert({
        userId: context.kind === 'support' ? context.participants[0] : null,
        conversationKey: context.conversationKey,
        conversationKind: context.kind,
        participants: context.participants,
        sender,
        senderUserId,
        message: text,
        entityRefs: refs,
        timestamp: new Date()
    }, messageProjection());
}

function normalizeMessage(message) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) throw createError({ statusCode: 400, message: 'Message is required' });
    return text;
}

async function normalizeEntityRefs(entityRefs = [], auth = {}) {
    if (!Array.isArray(entityRefs)) return [];
    const normalized = entityRefs
        .map(ref => ({
            type: typeof ref?.type === 'string' ? ref.type.trim() : '',
            id: ref?.id?.toString?.().trim?.() || '',
            label: typeof ref?.label === 'string' ? ref.label.trim() : ''
        }))
        .filter(ref => ref.type && ref.id)
        .slice(0, ENTITY_REF_LIMIT);

    const refs = [];
    for (const ref of normalized) {
        if (!ENTITY_OPTION_TYPES.has(ref.type)) continue;
        const options = await listEntityOptions(auth, ref.type, ref.id);
        const option = options.find(item => item.value?.toString?.() === ref.id || item.value === ref.id);
        if (option) refs.push({ type: ref.type, id: ref.id, label: option.label });
    }
    return refs;
}

async function buildConversationSummaries(messages, auth, options = {}) {
    const conversations = new Map();
    for (const message of messages) {
        const conversationKey = message.conversationKey || (message.userId ? supportConversationKey(message.userId) : null);
        if (!conversationKey) continue;
        if (options.adminSupportOnly && message.conversationKind === 'direct') continue;
        if (!conversations.has(conversationKey)) {
            conversations.set(conversationKey, {
                conversationKey,
                conversationKind: message.conversationKind || 'support',
                participants: normalizeParticipants(message),
                lastMessage: message.message,
                entityRefs: message.entityRefs || [],
                timestamp: message.timestamp,
                unreadCount: 0
            });
        }
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
            participant: await resolveConversationParticipant(summary, auth)
        });
    }
    return enriched.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
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
            entityRefs: [],
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
    const otherUserId = summary.participants.find(participant => participant !== auth.userId);
    if (!otherUserId) return null;
    const user = await usersService.getById(otherUserId).catch(() => null);
    return user ? user.toJSON() : { _id: otherUserId, identity: { name: otherUserId }, data: {} };
}

async function getConversationContextByKey(auth, conversationKey) {
    if (!conversationKey) throw createError({ statusCode: 400, message: 'Conversation key is required' });
    if (conversationKey === supportConversationKey(auth.userId)) {
        return await getUserConversationContext(auth, null);
    }
    if (conversationKey.startsWith('direct:')) {
        const parts = conversationKey.split(':').slice(1);
        if (!parts.includes(auth.userId)) throw createError({ statusCode: 403, message: 'Forbidden' });
        const recipientUserId = parts.find(part => part !== auth.userId);
        return await getUserConversationContext(auth, recipientUserId);
    }
    if (auth.isAdmin && conversationKey.startsWith('support:')) {
        return getAdminSupportContext(conversationKey.slice('support:'.length));
    }
    throw createError({ statusCode: 403, message: 'Forbidden' });
}

function userConversationsMatch(userId) {
    return {
        $or: [
            { conversationKey: supportConversationKey(userId) },
            { userId, conversationKey: { $exists: false } },
            { conversationKind: 'direct', participants: userId }
        ]
    };
}

function adminSupportConversationsMatch() {
    return {
        sender: { $ne: MESSAGE_SENDER.WELCOME },
        conversationKind: { $ne: 'direct' }
    };
}

async function loadEntityOptions(auth, type) {
    switch (type) {
        case 'project':
            return await projectsService.list(auth.userId, auth.organizationId, auth.role, auth);
        case 'queue':
            return await queuesService.list({}, auth.userId, auth.organizationId, auth.role, auth);
        case 'sheet':
            return await sheetsService.list(auth.userId, auth.organizationId, auth.role, auth);
        case 'material':
            return await materialsService.list();
        case 'user':
            return await usersService.list(auth.userId, auth.organizationId, auth.role, auth);
        default:
            return [];
    }
}

function normalizeEntityOption(type, entity) {
    const dto = entity?.toJSON ? entity.toJSON() : entity;
    const value = dto?._id?.toString?.() || dto?._id || dto?.id || '';
    const label = dto?.identity?.name || dto?.identity?.serial || dto?.identity?.uid || value;
    return {
        type,
        value,
        label,
        entity: dto
    };
}

function matchesEntityQuery(option, query) {
    if (!query) return true;
    return [option.label, option.value, option.entity?.identity?.uid, option.entity?.identity?.serial]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(query));
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
    return conversation?.participant?.identity?.name || conversation?.participant?.name || conversation?.conversationKey || '';
}

function legacySupportMatch(userId) {
    return {
        $or: [
            { conversationKey: supportConversationKey(userId) },
            { userId, conversationKey: { $exists: false } }
        ]
    };
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
        entityRefs: 1
    };
}
